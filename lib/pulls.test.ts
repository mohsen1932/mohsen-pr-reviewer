import { beforeEach, describe, expect, it, vi } from "vitest";

const paginate = vi.fn();
const pullsGet = vi.fn();
const getAuthenticated = vi.fn();

vi.mock("./github", () => ({
  github: () => ({
    paginate,
    rest: {
      pulls: { get: pullsGet, list: "LIST_PULLS", listFiles: "LIST_FILES" },
      users: { getAuthenticated },
    },
  }),
}));

beforeEach(() => {
  vi.resetModules();
  paginate.mockReset();
  pullsGet.mockReset();
  getAuthenticated.mockReset();
  getAuthenticated.mockResolvedValue({ data: { login: "viewer" } });
});

const apiPull = (over: Record<string, unknown> = {}) => ({
  number: 7,
  title: "Fix the thing",
  draft: false,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  html_url: "https://github.com/o/r/pull/7",
  user: { login: "author", avatar_url: "https://x/a.png" },
  head: { sha: "abc1234def", ref: "feature" },
  base: { ref: "main" },
  body: "why",
  additions: 10,
  deletions: 2,
  changed_files: 2,
  ...over,
});

const apiFile = (over: Record<string, unknown> = {}) => ({
  filename: "src/a.ts",
  status: "modified",
  additions: 1,
  deletions: 1,
  changes: 2,
  patch: "@@ -1,2 +1,2 @@\n-old\n+new",
  ...over,
});

describe("listOpenPulls", () => {
  it("maps the API shape to our summary", async () => {
    paginate.mockResolvedValue([apiPull()]);
    const { listOpenPulls } = await import("./pulls");
    await expect(listOpenPulls("o", "r")).resolves.toEqual([
      {
        number: 7,
        title: "Fix the thing",
        author: "author",
        authorAvatar: "https://x/a.png",
        draft: false,
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-02T00:00:00Z",
        headSha: "abc1234def",
        baseRef: "main",
        headRef: "feature",
        url: "https://github.com/o/r/pull/7",
      },
    ]);
  });

  it("requests only open PRs, most recently updated first", async () => {
    paginate.mockResolvedValue([]);
    const { listOpenPulls } = await import("./pulls");
    await listOpenPulls("o", "r");
    expect(paginate).toHaveBeenCalledWith(
      "LIST_PULLS",
      expect.objectContaining({ state: "open", sort: "updated", direction: "desc" }),
    );
  });

  it("defaults a missing author and draft flag", async () => {
    paginate.mockResolvedValue([apiPull({ user: null, draft: undefined })]);
    const { listOpenPulls } = await import("./pulls");
    const [pr] = await listOpenPulls("o", "r");
    expect(pr).toMatchObject({ author: "unknown", authorAvatar: "", draft: false });
  });

  it("validates the repo ref before calling GitHub", async () => {
    const { listOpenPulls } = await import("./pulls");
    await expect(listOpenPulls("bad owner", "r")).rejects.toThrow(/Invalid owner/);
    expect(paginate).not.toHaveBeenCalled();
  });
});

describe("getPullDetail", () => {
  function wire(files: unknown[], pull = apiPull()) {
    pullsGet.mockResolvedValue({ data: pull });
    paginate.mockImplementation(async (route: string) =>
      route === "LIST_FILES" ? files : [],
    );
  }

  it("returns metadata with parsed patches", async () => {
    wire([apiFile()]);
    const { getPullDetail } = await import("./pulls");
    const detail = await getPullDetail("o", "r", 7);
    expect(detail).toMatchObject({ number: 7, headSha: "abc1234def", changedFiles: 2 });
    expect(detail.files[0].parsed.hunks).toHaveLength(1);
    expect(detail.files[0].parsed.hunks[0].newStart).toBe(1);
  });

  it("applies the file selection rules", async () => {
    wire([apiFile(), apiFile({ filename: "yarn.lock" }), apiFile({ filename: "a.png" })]);
    const { getPullDetail } = await import("./pulls");
    const detail = await getPullDetail("o", "r", 7);
    expect(detail.files.map((f) => f.filename)).toEqual(["src/a.ts"]);
    expect(detail.excluded.map((e) => e.reason)).toEqual(["generated", "binary"]);
  });

  it("flags a PR authored by the token's own user", async () => {
    wire([apiFile()], apiPull({ user: { login: "viewer", avatar_url: "" } }));
    const { getPullDetail } = await import("./pulls");
    // GitHub rejects REQUEST_CHANGES on your own PR (§6).
    await expect(getPullDetail("o", "r", 7)).resolves.toMatchObject({
      authoredByViewer: true,
    });
  });

  it("flags a PR authored by someone else", async () => {
    wire([apiFile()]);
    const { getPullDetail } = await import("./pulls");
    await expect(getPullDetail("o", "r", 7)).resolves.toMatchObject({
      authoredByViewer: false,
    });
  });

  it("accepts a numeric string PR number", async () => {
    wire([apiFile()]);
    const { getPullDetail } = await import("./pulls");
    await expect(getPullDetail("o", "r", "7")).resolves.toMatchObject({ number: 7 });
  });

  it("rejects an invalid PR number before calling GitHub", async () => {
    const { getPullDetail } = await import("./pulls");
    await expect(getPullDetail("o", "r", "0")).rejects.toThrow(/Invalid pull request/);
    expect(pullsGet).not.toHaveBeenCalled();
  });

  it("normalizes a null body", async () => {
    wire([apiFile()], apiPull({ body: null }));
    const { getPullDetail } = await import("./pulls");
    await expect(getPullDetail("o", "r", 7)).resolves.toMatchObject({ body: null });
  });

  it("handles a PR with no reviewable files", async () => {
    wire([apiFile({ filename: "logo.png" })]);
    const { getPullDetail } = await import("./pulls");
    const detail = await getPullDetail("o", "r", 7);
    expect(detail.files).toEqual([]);
    expect(detail.totalPatchBytes).toBe(0);
  });
});
