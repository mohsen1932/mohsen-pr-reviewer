/**
 * Input validation for anything that reaches Octokit or the filesystem.
 * SPEC.md §12.
 */

/** GitHub owner and repository names. Also the guard against path traversal. */
const NAME = /^[A-Za-z0-9._-]+$/;

export function isValidName(value: string): boolean {
  if (!NAME.test(value)) return false;
  // "." and ".." pass the character class but are traversal, not names.
  if (value === "." || value === "..") return false;
  return true;
}

export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

export function assertRepoRef(owner: string, repo: string): void {
  if (!isValidName(owner)) throw new InvalidInputError(`Invalid owner: ${owner}`);
  if (!isValidName(repo)) throw new InvalidInputError(`Invalid repository: ${repo}`);
}

/** Pull request numbers are positive integers; anything else is a bad request. */
export function parsePullNumber(value: string | number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new InvalidInputError(`Invalid pull request number: ${value}`);
  }
  return n;
}

/**
 * Repo-relative path for the agent's file tools. Rejects absolute paths,
 * traversal, and NUL bytes.
 */
export function isSafeRepoPath(p: string): boolean {
  if (p.length === 0 || p.includes("\0")) return false;
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) return false;
  return !p.split(/[\\/]/).includes("..");
}
