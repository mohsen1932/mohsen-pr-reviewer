import fs from "node:fs/promises";
import path from "node:path";
import { cacheDir } from "../config";
import { assertRepoRef, parsePullNumber } from "../validate";
import { cloneUrl, git, isGitError } from "./git";

/**
 * Git checkouts for review. SPEC.md §7.2, §12.
 *
 * Clones are cached and reused; a second review of the same repo is a fetch.
 * Everything here is confined to CACHE_DIR — the owner and repo arrive from a
 * URL, so they are treated as untrusted path segments.
 */

/** Refuse before filling the disk (§11). GitHub reports repo size in KB. */
export const MAX_REPO_SIZE_KB = 2 * 1024 * 1024;

export class CheckoutError extends Error {
  readonly step: string;

  constructor(message: string, step: string) {
    super(message);
    this.name = "CheckoutError";
    this.step = step;
  }
}

/**
 * Resolve the cache path for a repo and prove it stays inside CACHE_DIR.
 *
 * assertRepoRef already rejects separators and dot-segments; this is the second
 *, independent check — a containment assertion holds even if the first one is
 * later loosened.
 */
export function checkoutPathFor(owner: string, repo: string): string {
  assertRepoRef(owner, repo);
  const root = cacheDir();
  const target = path.resolve(root, owner, repo);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (!target.startsWith(rootWithSep)) {
    throw new CheckoutError(`Refusing to work outside the cache directory`, "confine");
  }
  return target;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function isGitRepo(dir: string): Promise<boolean> {
  return exists(path.join(dir, ".git"));
}

export type CheckoutProgress = (phase: string, detail?: string) => void;

export type CheckoutRequest = {
  owner: string;
  repo: string;
  pullNumber: number | string;
  headSha: string;
  /** From the GitHub repo record; guards the clone (§11). */
  sizeKb?: number;
  onProgress?: CheckoutProgress;
};

/**
 * Clone or update, fetch the PR head, and check it out detached.
 *
 * `--filter=blob:none` rather than `--depth`: a shallow clone would leave
 * `git log` and `git blame` useless, and those are most of the reason for
 * having a checkout at all.
 */
export async function prepareCheckout(request: CheckoutRequest): Promise<string> {
  const { owner, repo, headSha, sizeKb, onProgress = () => {} } = request;
  const pullNumber = parsePullNumber(request.pullNumber);

  if (!/^[0-9a-f]{7,40}$/i.test(headSha)) {
    throw new CheckoutError(`Invalid commit sha: ${headSha}`, "validate");
  }
  if (sizeKb !== undefined && sizeKb > MAX_REPO_SIZE_KB) {
    const gb = (sizeKb / 1024 / 1024).toFixed(1);
    throw new CheckoutError(
      `Repository is ${gb} GB, over the ${MAX_REPO_SIZE_KB / 1024 / 1024} GB limit`,
      "size",
    );
  }

  const dir = checkoutPathFor(owner, repo);

  try {
    if (await isGitRepo(dir)) {
      onProgress("reusing-clone", `${owner}/${repo}`);
    } else {
      onProgress("cloning", `${owner}/${repo}`);
      await fs.mkdir(path.dirname(dir), { recursive: true });
      // A previous run may have left a partial directory behind.
      if (await exists(dir)) await fs.rm(dir, { recursive: true, force: true });
      await git(
        ["clone", "--filter=blob:none", "--no-checkout", cloneUrl(owner, repo), dir],
        { authenticated: true, step: "clone", timeoutMs: 600_000 },
      );
    }

    onProgress("fetching-pr", `#${pullNumber}`);
    // The PR ref covers fork PRs, whose head is not a branch of this repo.
    await git(["fetch", "--filter=blob:none", "origin", `pull/${pullNumber}/head`], {
      cwd: dir,
      authenticated: true,
      step: "fetch",
      timeoutMs: 300_000,
    });

    onProgress("checking-out", headSha.slice(0, 7));
    await git(["checkout", "--detach", "--force", headSha], {
      cwd: dir,
      authenticated: true,
      step: "checkout",
      timeoutMs: 300_000,
    });

    return dir;
  } catch (error) {
    if (isGitError(error)) {
      throw new CheckoutError(`git ${error.step} failed: ${error.message}`, error.step);
    }
    throw error;
  }
}

/** Remove one repo's cache, or the whole cache directory. */
export async function clearCheckout(owner?: string, repo?: string): Promise<void> {
  const target = owner && repo ? checkoutPathFor(owner, repo) : cacheDir();
  await fs.rm(target, { recursive: true, force: true });
}

export async function cacheSizeBytes(): Promise<number> {
  const root = cacheDir();
  if (!(await exists(root))) return 0;

  let total = 0;
  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) total += (await fs.stat(full)).size;
    }
  };
  await walk(root);
  return total;
}
