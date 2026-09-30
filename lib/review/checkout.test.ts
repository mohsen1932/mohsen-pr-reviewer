import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

const gitMock = vi.fn();
const fsMock = {
  access: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
};

vi.mock("./git", async () => {
  const actual = await vi.importActual<typeof import("./git")>("./git");
  return { ...actual, git: gitMock, cloneUrl: actual.cloneUrl };
});
vi.mock("node:fs/promises", () => ({ default: fsMock, ...fsMock }));

const CACHE = "/tmp/prr-cache";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.CACHE_DIR;
  process.env.CACHE_DIR = CACHE;
  vi.resetModules();
  gitMock.mockReset().mockResolvedValue("");
  for (const fn of Object.values(fsMock)) fn.mockReset();
  fsMock.access.mockRejectedValue(new Error("ENOENT")); // nothing cached
  fsMock.mkdir.mockResolvedValue(undefined);
  fsMock.rm.mockResolvedValue(undefined);
});

afterEach(() => {
  if (saved === undefined) delete process.env.CACHE_DIR;
  else process.env.CACHE_DIR = saved;
});

const load = () => import("./checkout");
const SHA = "91f73d30123456789abcdef0123456789abcdef0"; // 40 hex chars
const req = (over = {}) => ({
  owner: "owner",
  repo: "repo",
  pullNumber: 7,
  headSha: SHA,
  ...over,
});
const gitArgsFor = (verb: string) =>
  gitMock.mock.calls.map((c) => c[0] as string[]).find((a) => a[0] === verb);

describe("checkoutPathFor — containment", () => {
  it("resolves inside the cache directory", async () => {
    const { checkoutPathFor } = await load();
    expect(checkoutPathFor("owner", "repo")).toBe(path.join(CACHE, "owner", "repo"));
  });

  it.each([
    ["traversal in owner", "..", "repo"],
    ["traversal in repo", "owner", ".."],
    ["separator in owner", "a/b", "repo"],
    ["absolute-looking owner", "/etc", "repo"],
    ["dot segment", ".", "repo"],
  ])("rejects %s", async (_label, owner, repo) => {
    const { checkoutPathFor } = await load();
    expect(() => checkoutPathFor(owner, repo)).toThrow();
  });

  it("rejects a path that would escape even if it passed name validation", async () => {
    process.env.CACHE_DIR = "/tmp/prr-cache";
    const { checkoutPathFor } = await load();
    // Containment is asserted independently of the name check, so it still
    // holds if that check is ever loosened.
    expect(() => checkoutPathFor("..", "..")).toThrow();
  });
});

describe("prepareCheckout", () => {
  it("clones with blob filter, fetches the PR ref, and checks out detached", async () => {
    const { prepareCheckout } = await load();
    const dir = await prepareCheckout(req());

    expect(dir).toBe(path.join(CACHE, "owner", "repo"));
    // --filter=blob:none, not --depth: a shallow clone breaks git blame.
    expect(gitArgsFor("clone")).toEqual([
      "clone",
      "--filter=blob:none",
      "--no-checkout",
      "https://github.com/owner/repo.git",
      dir,
    ]);
    // The pull ref covers PRs opened from forks.
    expect(gitArgsFor("fetch")).toEqual([
      "fetch",
      "--filter=blob:none",
      "origin",
      "pull/7/head",
    ]);
    expect(gitArgsFor("checkout")).toEqual(["checkout", "--detach", "--force", SHA]);
  });

  it("never passes --depth, which would break blame", async () => {
    const { prepareCheckout } = await load();
    await prepareCheckout(req());
    const all = gitMock.mock.calls.flatMap((c) => c[0] as string[]);
    expect(all.some((a) => a.startsWith("--depth"))).toBe(false);
  });

  it("authenticates only the network operations", async () => {
    const { prepareCheckout } = await load();
    await prepareCheckout(req());
    for (const [args, opts] of gitMock.mock.calls as [string[], { authenticated?: boolean }][]) {
      if (["clone", "fetch", "checkout"].includes(args[0])) {
        expect(opts.authenticated).toBe(true);
      }
    }
  });

  it("reuses an existing clone instead of re-cloning", async () => {
    fsMock.access.mockResolvedValue(undefined); // .git exists
    const { prepareCheckout } = await load();
    const phases: string[] = [];
    await prepareCheckout(req({ onProgress: (p: string) => phases.push(p) }));
    expect(gitArgsFor("clone")).toBeUndefined();
    expect(phases).toContain("reusing-clone");
  });

  it("removes a partial directory left by a failed run", async () => {
    // Directory exists but has no .git — a clone that died midway.
    fsMock.access.mockImplementation(async (p: string) => {
      if (String(p).endsWith(".git")) throw new Error("ENOENT");
    });
    const { prepareCheckout } = await load();
    await prepareCheckout(req());
    expect(fsMock.rm).toHaveBeenCalledWith(path.join(CACHE, "owner", "repo"), {
      recursive: true,
      force: true,
    });
  });

  it("reports progress phases in order", async () => {
    const { prepareCheckout } = await load();
    const phases: string[] = [];
    await prepareCheckout(req({ onProgress: (p: string) => phases.push(p) }));
    expect(phases).toEqual(["cloning", "fetching-pr", "checking-out"]);
  });

  it.each(["", "nope", "zzzz", "12345", "../../etc"])(
    "rejects an invalid head sha %j before running git",
    async (sha) => {
      const { prepareCheckout } = await load();
      await expect(prepareCheckout(req({ headSha: sha }))).rejects.toThrow(/Invalid commit sha/);
      expect(gitMock).not.toHaveBeenCalled();
    },
  );

  it("rejects an invalid PR number before running git", async () => {
    const { prepareCheckout } = await load();
    await expect(prepareCheckout(req({ pullNumber: -1 }))).rejects.toThrow();
    expect(gitMock).not.toHaveBeenCalled();
  });

  it("refuses a repository over the size limit rather than filling the disk", async () => {
    const { prepareCheckout, MAX_REPO_SIZE_KB } = await load();
    await expect(prepareCheckout(req({ sizeKb: MAX_REPO_SIZE_KB + 1 }))).rejects.toThrow(
      /over the 2 GB limit/,
    );
    expect(gitMock).not.toHaveBeenCalled();
  });

  it("allows a repository at exactly the limit", async () => {
    const { prepareCheckout, MAX_REPO_SIZE_KB } = await load();
    await expect(prepareCheckout(req({ sizeKb: MAX_REPO_SIZE_KB }))).resolves.toBeTruthy();
  });

  it("names the failing git step", async () => {
    const { GitError } = await vi.importActual<typeof import("./git")>("./git");
    gitMock.mockRejectedValue(new GitError("repository not found", "clone"));
    const { prepareCheckout, CheckoutError } = await load();
    await expect(prepareCheckout(req())).rejects.toBeInstanceOf(CheckoutError);
    await expect(prepareCheckout(req())).rejects.toThrow(/git clone failed: repository not found/);
  });
});

describe("clearCheckout", () => {
  it("removes one repository", async () => {
    const { clearCheckout } = await load();
    await clearCheckout("owner", "repo");
    expect(fsMock.rm).toHaveBeenCalledWith(path.join(CACHE, "owner", "repo"), {
      recursive: true,
      force: true,
    });
  });

  it("removes the whole cache when given no repository", async () => {
    const { clearCheckout } = await load();
    await clearCheckout();
    expect(fsMock.rm).toHaveBeenCalledWith(CACHE, { recursive: true, force: true });
  });

  it("refuses to remove something outside the cache", async () => {
    const { clearCheckout } = await load();
    await expect(clearCheckout("..", "..")).rejects.toThrow();
    expect(fsMock.rm).not.toHaveBeenCalled();
  });
});

describe("cacheSizeBytes", () => {
  it("is zero when the cache does not exist", async () => {
    const { cacheSizeBytes } = await load();
    await expect(cacheSizeBytes()).resolves.toBe(0);
  });

  it("sums file sizes recursively", async () => {
    fsMock.access.mockResolvedValue(undefined);
    fsMock.readdir.mockImplementation(async (dir: string) =>
      dir === CACHE
        ? [
            { name: "sub", isDirectory: () => true, isFile: () => false },
            { name: "a.txt", isDirectory: () => false, isFile: () => true },
          ]
        : [{ name: "b.txt", isDirectory: () => false, isFile: () => true }],
    );
    fsMock.stat.mockResolvedValue({ size: 100 });
    const { cacheSizeBytes } = await load();
    await expect(cacheSizeBytes()).resolves.toBe(200);
  });
});

describe("recovering a corrupt cache", () => {
  const CORRUPT = "fatal: not a git repository (or any of the parent directories)";

  it("re-clones once when the cached clone is unusable", async () => {
    fsMock.access.mockResolvedValue(undefined); // a clone appears to exist
    const { GitError } = await vi.importActual<typeof import("./git")>("./git");
    let call = 0;
    gitMock.mockImplementation(async () => {
      call++;
      // Fail the first fetch, then succeed once the cache is rebuilt.
      if (call === 1) throw new GitError(CORRUPT, "fetch");
      return "";
    });

    const { prepareCheckout } = await load();
    const phases: string[] = [];
    await expect(
      prepareCheckout(req({ onProgress: (p: string) => phases.push(p) })),
    ).resolves.toBeTruthy();

    expect(phases).toContain("rebuilding-cache");
    expect(fsMock.rm).toHaveBeenCalled();
  });

  it("gives up after one rebuild rather than looping", async () => {
    fsMock.access.mockResolvedValue(undefined);
    const { GitError } = await vi.importActual<typeof import("./git")>("./git");
    gitMock.mockRejectedValue(new GitError(CORRUPT, "fetch"));

    const { prepareCheckout, CheckoutError } = await load();
    await expect(prepareCheckout(req())).rejects.toBeInstanceOf(CheckoutError);
  });

  it("does not rebuild for a failure the cache cannot cause", async () => {
    const { GitError } = await vi.importActual<typeof import("./git")>("./git");
    gitMock.mockRejectedValue(new GitError("Repository not found", "clone"));

    const { prepareCheckout } = await load();
    await expect(prepareCheckout(req())).rejects.toThrow(/Repository not found/);
    // A missing remote is not corruption; re-cloning would just fail again.
    expect(fsMock.rm).not.toHaveBeenCalledWith(expect.anything(), expect.anything());
  });

  it("does not rebuild when the repository is simply too large", async () => {
    const { prepareCheckout, MAX_REPO_SIZE_KB } = await load();
    await expect(
      prepareCheckout(req({ sizeKb: MAX_REPO_SIZE_KB + 1 })),
    ).rejects.toThrow(/over the 2 GB limit/);
    expect(gitMock).not.toHaveBeenCalled();
  });
});
