import fs from "node:fs/promises";
import { git } from "./git";
import { resolveInside, PathEscapeError } from "./paths";
import { acceptFinding } from "../findings/report";
import { CATEGORIES, DISPOSITIONS, type Finding } from "../findings/schema";
import type { AnchorTarget } from "./anchor";

/**
 * The agent's entire capability surface. SPEC.md §7.4, §12.
 *
 * Read-only by construction: there is no shell, no write, and no network. A
 * tool that does not exist here cannot be called, which replaces the permission
 * permission callback a managed harness would provide — the allowlist *is* this
 * file, and the loop never dispatches a name that is not in it.
 *
 * Every path argument goes through resolveInside(), so nothing reads outside
 * the checkout.
 */

const MAX_OUTPUT = 40_000;
const MAX_FILE_BYTES = 256 * 1024;

export type ToolContext = {
  cwd: string;
  files: AnchorTarget[];
  /** Paths deliberately left out of the review (§11), with the reason. */
  excluded?: { filename: string; reason: string }[];
  onFinding: (finding: Finding) => void;
};

export type ToolResult = { text: string; isError?: boolean };

function clip(text: string): string {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… truncated` : text;
}

const ok = (text: string): ToolResult => ({ text: clip(text) || "(no output)" });
const fail = (text: string): ToolResult => ({ text, isError: true });

/**
 * Tool definitions handed to the model, in the Responses API's flat shape —
 * name, description and parameters at the top level, not nested under
 * `function` as Chat Completions requires.
 */
const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
) => ({
  type: "function" as const,
  name,
  description,
  parameters: { type: "object", properties, required, additionalProperties: false },
  strict: false,
});

export const TOOL_DEFINITIONS = [
  tool(
    "read_file",
    "Read a file from the checkout. Use this to see code around the diff — the " +
      "function containing a change, or a call site.",
    {
      path: { type: "string", description: "Repo-relative path, e.g. src/auth/session.ts" },
      startLine: { type: "integer", minimum: 1, description: "First line (optional)" },
      endLine: { type: "integer", minimum: 1, description: "Last line (optional)" },
    },
    ["path"],
  ),
  tool(
    "search",
    "Search the checkout for a regular expression, returning matching lines with " +
      "their file and line number. Use this to find the call sites of anything " +
      "whose contract changed.",
    {
      pattern: { type: "string", description: "POSIX extended regular expression" },
      path: { type: "string", description: "Limit to this directory or file (optional)" },
    },
    ["pattern"],
  ),
  tool(
    "list_files",
    "List tracked files matching a glob, e.g. src/**/*.ts.",
    { glob: { type: "string", description: "Glob pattern" } },
    ["glob"],
  ),
  tool(
    "git_log_for_file",
    "Recent commits that touched a file, newest first. Use this to see why code " +
      "was written the way it is before claiming it is wrong.",
    {
      path: { type: "string", description: "Repo-relative file path" },
      limit: { type: "integer", minimum: 1, maximum: 50 },
    },
    ["path"],
  ),
  tool(
    "git_blame",
    "Who last changed each line in a range, with commit and date.",
    {
      path: { type: "string", description: "Repo-relative file path" },
      startLine: { type: "integer", minimum: 1 },
      endLine: { type: "integer", minimum: 1 },
    },
    ["path", "startLine", "endLine"],
  ),
  tool(
    "report_finding",
    "Report one review finding. Call this once per finding, as you find it. It is " +
      "the only way a finding reaches the reviewer — anything written in prose is " +
      "discarded. Rejected findings come back with the reason so you can correct them.",
    {
      file: { type: "string", description: "Repo-relative path, exactly as in the diff" },
      line: { type: "integer", minimum: 1, description: "Line in the new version" },
      endLine: { type: "integer", minimum: 1 },
      disposition: {
        type: "string",
        enum: [...DISPOSITIONS],
        description:
          "blocking = must fix before merge, requires failureScenario; " +
          "non-blocking = real but bounded; nitpick = preference only",
      },
      category: { type: "string", enum: [...CATEGORIES] },
      title: { type: "string", description: "One line, no trailing period" },
      body: { type: "string", description: "Markdown. This is what gets posted." },
      failureScenario: {
        type: "string",
        description: "Required when blocking: inputs or state leading to a wrong result",
      },
      confidence: { type: "string", enum: ["confirmed", "plausible"] },
    },
    ["file", "line", "disposition", "category", "title", "body", "confidence"],
  ),
];

export const TOOL_NAMES = TOOL_DEFINITIONS.map((t) => t.name);

type Args = Record<string, unknown>;
const str = (a: Args, k: string): string => (typeof a[k] === "string" ? (a[k] as string) : "");
const num = (a: Args, k: string): number | undefined =>
  typeof a[k] === "number" ? (a[k] as number) : undefined;

export async function runTool(
  name: string,
  args: Args,
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "read_file":
        return await readFile(args, ctx);
      case "search":
        return await search(args, ctx);
      case "list_files":
        return await listFiles(args, ctx);
      case "git_log_for_file":
        return await gitLog(args, ctx);
      case "git_blame":
        return await gitBlame(args, ctx);
      case "report_finding":
        return reportFinding(args, ctx);
      default:
        // Unreachable via the API, which only offers TOOL_DEFINITIONS, but a
        // model can still hallucinate a name.
        return fail(`No tool named "${name}". Available: ${TOOL_NAMES.join(", ")}.`);
    }
  } catch (error) {
    if (error instanceof PathEscapeError) return fail(error.message);
    return fail(`${name} failed: ${(error as Error).message}`);
  }
}

/**
 * An excluded file is not merely absent — the agent is told it exists and was
 * deliberately skipped. Without this it spends turns hunting for a lockfile it
 * can never review, which is exactly what happened on the first real run.
 */
function excludedNotice(ctx: ToolContext, path: string): ToolResult | undefined {
  const match = ctx.excluded?.find((e) => e.filename === path || path.endsWith(`/${e.filename}`));
  if (!match) return undefined;
  return fail(
    `"${match.filename}" is excluded from this review (${match.reason}) and is not available. ` +
      "Do not look for it again — review the files in the diff instead.",
  );
}

async function readFile(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const excluded = excludedNotice(ctx, str(args, "path"));
  if (excluded) return excluded;
  const absolute = resolveInside(ctx.cwd, str(args, "path"));
  const stat = await fs.stat(absolute);
  if (!stat.isFile()) return fail(`"${str(args, "path")}" is not a file.`);
  if (stat.size > MAX_FILE_BYTES) {
    return fail(`"${str(args, "path")}" is ${Math.round(stat.size / 1024)} KB; read a line range instead.`);
  }

  const lines = (await fs.readFile(absolute, "utf8")).split("\n");
  const start = Math.max(1, num(args, "startLine") ?? 1);
  const end = Math.min(lines.length, num(args, "endLine") ?? lines.length);
  if (end < start) return fail("endLine must be greater than or equal to startLine.");

  const width = String(end).length;
  return ok(
    lines
      .slice(start - 1, end)
      .map((line, i) => `${String(start + i).padStart(width)}  ${line}`)
      .join("\n"),
  );
}

async function search(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const pattern = str(args, "pattern");
  if (!pattern) return fail("pattern is required.");
  const excluded = excludedNotice(ctx, pattern);
  if (excluded) return excluded;
  const scope = str(args, "path");
  // git grep stays inside the work tree and takes a fixed argument list, so
  // there is no shell and no way to reach outside the checkout.
  const gitArgs = ["grep", "-n", "-I", "--extended-regexp", "--max-count=5", "-e", pattern];
  if (scope) {
    resolveInside(ctx.cwd, scope); // validate before handing it to git
    gitArgs.push("--", scope);
  }
  try {
    return ok(await git(gitArgs, { cwd: ctx.cwd, step: "grep", timeoutMs: 30_000 }));
  } catch {
    // git grep exits non-zero when nothing matches.
    return ok("(no matches)");
  }
}

async function listFiles(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const glob = str(args, "glob") || "*";
  const out = await git(["ls-files", "--", glob], {
    cwd: ctx.cwd,
    step: "ls-files",
    timeoutMs: 30_000,
  });
  const names = out.split("\n").filter(Boolean).slice(0, 500);
  return ok(names.join("\n") || "(no files match)");
}

async function gitLog(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const filePath = str(args, "path");
  resolveInside(ctx.cwd, filePath);
  const out = await git(
    ["log", "-n", String(num(args, "limit") ?? 20), "--date=short", "--format=%h %ad %an: %s", "--", filePath],
    { cwd: ctx.cwd, step: "log", timeoutMs: 30_000 },
  );
  return ok(out.trim());
}

async function gitBlame(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const filePath = str(args, "path");
  resolveInside(ctx.cwd, filePath);
  const start = num(args, "startLine") ?? 1;
  const end = num(args, "endLine") ?? start;
  if (end < start) return fail("endLine must be greater than or equal to startLine.");
  const capped = Math.min(end, start + 200);
  const out = await git(["blame", "-L", `${start},${capped}`, "--date=short", "--", filePath], {
    cwd: ctx.cwd,
    step: "blame",
    timeoutMs: 30_000,
  });
  return ok(out.trimEnd());
}

function reportFinding(args: Args, ctx: ToolContext): ToolResult {
  const result = acceptFinding(args, ctx.files);
  if (!result.accepted) return fail(result.message);
  ctx.onFinding(result.finding);
  return ok(
    `Recorded: ${result.finding.disposition} / ${result.finding.category} at ` +
      `${result.finding.file}:${result.finding.line}.${result.note ? ` ${result.note}` : ""}`,
  );
}
