import { beforeEach, describe, expect, it, vi } from "vitest";

const paginate = vi.fn();
const reposGet = vi.fn();
const githubMock = vi.fn(() => ({ paginate, rest: { repos: { get: reposGet, listForAuthenticatedUser: "LIST" } } }));

vi.mock("./github", () => ({ github: githubMock }));

beforeEach(() => {
  vi.resetModules();
  paginate.mockReset();
  reposGet.mockReset();
});

const apiRepo = (over: Record<string, unknown> = {}) => ({
  name: "repo",
  full_name: "owner/repo",
  private: true,
  description: "desc",
  default_branch: "main",
  pushed_at: "2026-09-01T00:00:00Z",
  language: "TypeScript",
  open_issues_count: 3,
  owner: { login: "owner" },
  ...over,
});

describe("listRepos", () => {
  it("maps the API shape to our summary", async () => {
    paginate.mockResolvedValue([apiRepo()]);
    const { listRepos } = await import("./repos");
    await expect(listRepos()).resolves.toEqual([
      {
        owner: "owner",
        name: "repo",
        fullName: "owner/repo",
        private: true,
        description: "desc",
        defaultBranch: "main",
        pushedAt: "2026-09-01T00:00:00Z",
        language: "TypeScript",
        openIssues: 3,
      },
    ]);
  });

  it("requests all visibilities and paginates to completion", async () => {
    paginate.mockResolvedValue([]);
    const { listRepos } = await import("./repos");
    await listRepos();
    // A truncated list is indistinguishable from a permissions problem (§6).
    expect(paginate).toHaveBeenCalledWith(
      "LIST",
      expect.objectContaining({
        visibility: "all",
        affiliation: "owner,collaborator,organization_member",
        sort: "pushed",
        per_page: 100,
      }),
    );
  });

  it("falls back to the full_name owner when owner is null", async () => {
    paginate.mockResolvedValue([apiRepo({ owner: null })]);
    const { listRepos } = await import("./repos");
    expect((await listRepos())[0].owner).toBe("owner");
  });

  it("supplies defaults for optional fields", async () => {
    paginate.mockResolvedValue([
      { name: "r", full_name: "o/r", private: false, owner: { login: "o" } },
    ]);
    const { listRepos } = await import("./repos");
    expect((await listRepos())[0]).toMatchObject({
      description: null,
      defaultBranch: "main",
      pushedAt: null,
      language: null,
      openIssues: 0,
    });
  });

  it("returns an empty list when the token sees nothing", async () => {
    paginate.mockResolvedValue([]);
    const { listRepos } = await import("./repos");
    await expect(listRepos()).resolves.toEqual([]);
  });
});

describe("getRepo", () => {
  it("returns a summary", async () => {
    reposGet.mockResolvedValue({ data: apiRepo() });
    const { getRepo } = await import("./repos");
    await expect(getRepo("owner", "repo")).resolves.toMatchObject({ fullName: "owner/repo" });
  });

  it("validates the ref before calling GitHub", async () => {
    const { getRepo } = await import("./repos");
    await expect(getRepo("../evil", "repo")).rejects.toThrow(/Invalid owner/);
    expect(reposGet).not.toHaveBeenCalled();
  });

  it("rejects a bad repo name before calling GitHub", async () => {
    const { getRepo } = await import("./repos");
    await expect(getRepo("owner", "a/b")).rejects.toThrow(/Invalid repository/);
    expect(reposGet).not.toHaveBeenCalled();
  });
});
