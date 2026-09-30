import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config";
import { getAuthenticatedUser } from "./github";
import { scrubError } from "./scrub";

/**
 * Startup validation. SPEC.md §14.
 *
 * Reports precisely what is wrong rather than failing on the first API call.
 * Each check is independent: a missing OpenAI key must not hide a missing
 * git binary.
 */

const run = promisify(execFile);

export type CheckId = "git" | "github" | "openai";

export type Check = {
  id: CheckId;
  label: string;
  ok: boolean;
  /** Present when ok — e.g. the resolved git version or GitHub login. */
  detail?: string;
  /** Present when not ok — what is wrong. */
  problem?: string;
  /** Present when not ok — what to do about it. */
  fix?: string;
  /** Reviews cannot run without this; browsing still can. */
  blocksReviews: boolean;
};

/** `--filter=blob:none` needs git >= 2.19 (SPEC.md §7.2). */
const MIN_GIT = [2, 19] as const;

async function checkGit(): Promise<Check> {
  const base = { id: "git" as const, label: "git", blocksReviews: true };
  try {
    const { stdout } = await run("git", ["--version"]);
    const match = stdout.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!match) {
      return { ...base, ok: false, problem: `Unrecognized: ${stdout.trim()}` };
    }
    const [major, minor] = [Number(match[1]), Number(match[2])];
    if (major < MIN_GIT[0] || (major === MIN_GIT[0] && minor < MIN_GIT[1])) {
      return {
        ...base,
        ok: false,
        problem: `git ${major}.${minor} is too old`,
        fix: `Reviews clone with --filter=blob:none, which needs git ${MIN_GIT[0]}.${MIN_GIT[1]} or newer.`,
      };
    }
    return { ...base, ok: true, detail: `${major}.${minor}` };
  } catch {
    return {
      ...base,
      ok: false,
      problem: "Not found on PATH",
      fix: "Reviews run against a real checkout, so a git binary is required.",
    };
  }
}

async function checkGitHub(): Promise<Check> {
  const base = { id: "github" as const, label: "GITHUB_TOKEN", blocksReviews: true };
  if (!config.githubToken) {
    return {
      ...base,
      ok: false,
      problem: "Not set",
      fix: "Create a fine-grained PAT with access to all repositories — Contents: Read, Pull requests: Read and write — and put it in .env",
    };
  }
  try {
    const user = await getAuthenticatedUser();
    return { ...base, ok: true, detail: `@${user.login}` };
  } catch (error) {
    const message = scrubError(error);
    const rejected = message.includes("401") || /bad credentials/i.test(message);
    return {
      ...base,
      ok: false,
      problem: rejected ? "Rejected by GitHub" : message,
      fix: rejected
        ? "The token is invalid, expired, or revoked. Create a new one."
        : undefined,
    };
  }
}

async function checkOpenAI(): Promise<Check> {
  const base = {
    id: "openai" as const,
    label: "OPENAI_API_KEY",
    blocksReviews: true,
  };
  if (!config.openaiApiKey) {
    return {
      ...base,
      ok: false,
      problem: "Not set",
      fix: "Create a key at platform.openai.com and set a spend limit — this app is its only consumer.",
    };
  }
  try {
    // GET /v1/models is a free, zero-token credential probe. Inference goes
    // through the chat completions API; this is deliberately not an inference
    // path, and it cannot detect an exhausted quota (§14).
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { authorization: `Bearer ${config.openaiApiKey}` },
    });
    if (response.status === 401 || response.status === 403) {
      return {
        ...base,
        ok: false,
        problem: "Rejected by OpenAI",
        fix: "The key is invalid or revoked. Create a new one at platform.openai.com.",
      };
    }
    if (!response.ok) {
      return { ...base, ok: false, problem: `OpenAI API returned ${response.status}` };
    }
    return { ...base, ok: true, detail: `model: ${config.reviewModel}` };
  } catch (error) {
    return { ...base, ok: false, problem: scrubError(error) };
  }
}

export type StartupReport = {
  checks: Check[];
  /** Every check passed. */
  ready: boolean;
  /** Browsing works, but "Review this PR" must stay disabled. */
  canBrowse: boolean;
};

export async function runStartupChecks(): Promise<StartupReport> {
  const checks = await Promise.all([checkGit(), checkGitHub(), checkOpenAI()]);
  const byId = (id: CheckId) => checks.find((c) => c.id === id)!;
  return {
    checks,
    ready: checks.every((c) => c.ok),
    canBrowse: byId("github").ok,
  };
}
