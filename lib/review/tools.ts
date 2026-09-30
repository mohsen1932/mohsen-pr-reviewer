import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { isSafeRepoPath } from "../validate";
import { git } from "./git";

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

export function createReviewTools(cwd: string) {
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

  return createSdkMcpServer({
    name: "review",
    version: "1.0.0",
    tools: [gitLogForFile, gitBlame],
  });
}

/** Fully-qualified names, as the SDK exposes SDK-MCP tools. */
export const REVIEW_TOOL_NAMES = [
  "mcp__review__git_log_for_file",
  "mcp__review__git_blame",
] as const;
