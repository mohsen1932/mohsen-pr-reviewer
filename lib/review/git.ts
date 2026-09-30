import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config";

/**
 * Every git invocation in the app. SPEC.md §7.2, §12.
 *
 * Two rules hold everywhere:
 *   1. execFile with an argument array — never a shell string, so nothing in a
 *      path or ref can be interpreted as a command.
 *   2. Credentials travel in the environment, never in argv, so the token does
 *      not appear in `ps` output and never reaches `.git/config`.
 */

const run = promisify(execFile);

/**
 * Identity by `name`, not `instanceof`: duplicate module instances (ESM/CJS
 * interop, a second copy in node_modules) break prototype identity, and this
 * check gates the error message a user sees.
 */
export function isGitError(error: unknown): error is GitError {
  return error instanceof Error && error.name === "GitError" && "step" in error;
}

export class GitError extends Error {
  readonly step: string;

  constructor(message: string, step: string) {
    super(message);
    this.name = "GitError";
    this.step = step;
  }
}

export type GitOptions = {
  cwd?: string;
  /** Attach the GitHub token for network operations (clone, fetch). */
  authenticated?: boolean;
  timeoutMs?: number;
  maxBuffer?: number;
  /** Named for the error message when this step fails. */
  step: string;
};

/**
 * git reads config from GIT_CONFIG_KEY_n/VALUE_n as well as `-c`. The env form
 * is used deliberately: `-c http.extraHeader=Authorization: Basic …` would put
 * the credential in the process's command line, readable by `ps`.
 */
function authEnv(): Record<string, string> {
  if (!config.githubToken) return {};
  const basic = Buffer.from(`x-access-token:${config.githubToken}`).toString("base64");
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraHeader",
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
  };
}

export async function git(args: string[], options: GitOptions): Promise<string> {
  // Least privilege: git needs neither credential in its environment. The
  // GitHub token reaches it as a config header only when authenticated, and
  // ANTHROPIC_API_KEY has no business in a git subprocess at all.
  const { GITHUB_TOKEN: _gh, ANTHROPIC_API_KEY: _an, ...inherited } = process.env;

  const env = {
    ...inherited,
    // Never let git open an interactive credential or SSH prompt: on a missing
    // credential it must fail fast rather than hang the review.
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "",
    GCM_INTERACTIVE: "never",
    ...(options.authenticated ? authEnv() : {}),
    // The spread of process.env supplies NODE_ENV, which Next's types require.
  } as NodeJS.ProcessEnv;

  try {
    const { stdout } = await run("git", args, {
      cwd: options.cwd,
      env,
      timeout: options.timeoutMs ?? 120_000,
      maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? "";
    const message = (stderr || (error as Error).message || "git failed").trim();
    throw new GitError(message.split("\n").slice(0, 3).join(" "), options.step);
  }
}

/** Clone URL without embedded credentials — auth rides in the header. */
export function cloneUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}.git`;
}
