import { isValidName } from "./validate";

/** Parsed reference to a repository, optionally deep-linked to a PR. SPEC.md §6. */
export type RepoRef = {
  owner: string;
  repo: string;
  pullNumber?: number;
};

const SSH = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/;

/**
 * Accepts every form someone might paste:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   https://github.com/owner/repo/pull/42   → deep-links to the PR
 *   git@github.com:owner/repo.git
 *   owner/repo
 *
 * Returns null rather than throwing: this parses user input, and "not a repo
 * URL" is an ordinary outcome the input field reports inline.
 */
export function parseRepoUrl(input: string): RepoRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const ssh = SSH.exec(trimmed);
  if (ssh) return build(ssh[1], ssh[2]);

  let segments: string[];
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith("github.com/")) {
    let url: URL;
    try {
      url = new URL(trimmed.startsWith("github.com/") ? `https://${trimmed}` : trimmed);
    } catch {
      return null;
    }
    if (url.hostname.replace(/^www\./, "") !== "github.com") return null;
    segments = url.pathname.split("/").filter(Boolean);
  } else {
    // Bare "owner/repo", possibly with extra path segments.
    segments = trimmed.split("/").filter(Boolean);
  }

  if (segments.length < 2) return null;
  const [owner, rawRepo, ...rest] = segments;

  // /owner/repo/pull/42 — anything else after the repo (tree, blob, issues) is
  // ignored rather than rejected; the repo is still what was asked for.
  let pullNumber: number | undefined;
  if ((rest[0] === "pull" || rest[0] === "pulls") && rest[1]) {
    const n = Number(rest[1]);
    if (Number.isInteger(n) && n > 0) pullNumber = n;
  }

  return build(owner, rawRepo, pullNumber);
}

function build(owner: string, rawRepo: string, pullNumber?: number): RepoRef | null {
  const repo = rawRepo.replace(/\.git$/, "");
  if (!isValidName(owner) || !isValidName(repo)) return null;
  return pullNumber === undefined ? { owner, repo } : { owner, repo, pullNumber };
}
