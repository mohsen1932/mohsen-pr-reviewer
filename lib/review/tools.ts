import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { isSafeRepoPath } from "../validate";
import { git } from "./git";
import { acceptFinding } from "../findings/report";
import { REPORTED_FINDING_SHAPE, type Finding } from "../findings/schema";
import type { AnchorTarget } from "./anchor";

/**
 * The agent's git access. SPEC.md §7.4, §12.
 *
 * The agent has no Bash tool. It is pointed at a repository written by someone
 * else, and a shell is the widest possible blast radius for an instruction
 * carried in that repository's contents. Git reaches it through these two
 * read-only tools instead, each with a fixed argument list.
 *
 * Both take the repo path last, after `--`, so a filename can never be read as
 * a flag, and both reject anything that is not a plain repo-relative path.
 */

const MAX_OUTPUT = 60_000;

function textResult(text: string, isError = false) {
  const clipped =
    text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… truncated` : text;
  return { content: [{ type: "text" as const, text: clipped || "(no output)" }], isError };
}

function rejectPath(p: string) {
  return textResult(
    `Refused: "${p}" is not a repo-relative path. Use a path like src/index.ts.`,
    true,
  );
}

export type ReviewToolsContext = {
  cwd: string;
  /** Changed files with parsed patches, for anchoring (§8.5). */
  files: AnchorTarget[];
  /** Called for each accepted finding, so it can stream to the browser. */
  onFinding: (finding: Finding) => void;
};

export function createReviewTools(ctx: ReviewToolsContext) {
  const { cwd } = ctx;
  const gitLogForFile = tool(
    "git_log_for_file",
    "Recent commits that touched a file, newest first. Use this to see why code " +
      "was written the way it is before claiming it is wrong.",
    {
      path: z.string().describe("Repo-relative file path, e.g. src/auth/session.ts"),
      limit: z.number().int().min(1).max(50).optional().describe("Commits to return (default 20)"),
    },
    async ({ path: filePath, limit }) => {
      if (!isSafeRepoPath(filePath)) return rejectPath(filePath);
      try {
        const out = await git(
          [
            "log",
            `-n`,
            String(limit ?? 20),
            "--date=short",
            "--format=%h %ad %an: %s",
            "--",
            filePath,
          ],
          { cwd, step: "log", timeoutMs: 30_000 },
        );
        return textResult(out.trim());
      } catch (error) {
        return textResult(`git log failed: ${(error as Error).message}`, true);
      }
    },
    { annotations: { readOnlyHint: true } },
  );

  const gitBlame = tool(
    "git_blame",
    "Who last changed each line in a range, with commit and date. Use this to " +
      "find the change that introduced the code under review.",
    {
      path: z.string().describe("Repo-relative file path"),
      startLine: z.number().int().min(1).describe("First line (1-based)"),
      endLine: z.number().int().min(1).describe("Last line (inclusive)"),
    },
    async ({ path: filePath, startLine, endLine }) => {
      if (!isSafeRepoPath(filePath)) return rejectPath(filePath);
      if (endLine < startLine) {
        return textResult("Refused: endLine must be >= startLine.", true);
      }
      // A huge range would flood the context with little added signal.
      const capped = Math.min(endLine, startLine + 200);
      try {
        const out = await git(
          ["blame", "-L", `${startLine},${capped}`, "--date=short", "--", filePath],
          { cwd, step: "blame", timeoutMs: 30_000 },
        );
        return textResult(out.trimEnd());
      } catch (error) {
        return textResult(`git blame failed: ${(error as Error).message}`, true);
      }
    },
    { annotations: { readOnlyHint: true } },
  );

  const reportFinding = tool(
    "report_finding",
    "Report one review finding. Call this once per finding, as you find it — " +
      "do not collect them and summarize at the end. The finding is validated " +
      "and anchored to the diff immediately; if it is rejected you will be told " +
      "why and can correct it.",
    REPORTED_FINDING_SHAPE,
    async (input) => {
      const result = acceptFinding(input, ctx.files);

      if (!result.accepted) {
        // isError so the model treats this as a failed call and retries,
        // rather than as odd-looking data.
        return textResult(result.message, true);
      }

      ctx.onFinding(result.finding);
      return {
        content: [
          {
            type: "text" as const,
            text: `Recorded: ${result.finding.disposition} / ${result.finding.category} at ${result.finding.file}:${result.finding.line}.${result.note ? ` ${result.note}` : ""}`,
          },
        ],
        structuredContent: {
          id: result.finding.id,
          file: result.finding.file,
          line: result.finding.line,
          lineValid: result.finding.lineValid,
          snapped: result.finding.snapped,
        },
      };
    },
  );

  return createSdkMcpServer({
    name: "review",
    version: "1.0.0",
    tools: [gitLogForFile, gitBlame, reportFinding],
  });
}

/** Fully-qualified names, as the SDK exposes SDK-MCP tools. */
export const REVIEW_TOOL_NAMES = [
  "mcp__review__git_log_for_file",
  "mcp__review__git_blame",
  "mcp__review__report_finding",
] as const;
