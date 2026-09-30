import { beforeEach, describe, expect, it, vi } from "vitest";

const listRepos = vi.fn();
const getRepo = vi.fn();
const listOpenPulls = vi.fn();
const getPullDetail = vi.fn();

vi.mock("@/lib/repos", () => ({ listRepos, getRepo }));
vi.mock("@/lib/pulls", () => ({ listOpenPulls, getPullDetail }));

beforeEach(() => {
  vi.resetModules();
  for (const m of [listRepos, getRepo, listOpenPulls, getPullDetail]) m.mockReset();
});

const json = async (res: Response) => res.json();
const post = (body: unknown) =>
  new Request("http://localhost/api/repos/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("GET /api/repos", () => {
  it("returns the repo list", async () => {
    listRepos.mockResolvedValue([{ fullName: "o/r" }]);
    const { GET } = await import("./repos/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ repos: [{ fullName: "o/r" }] });
  });

  it("maps an upstream 401 through the shared error handler", async () => {
    listRepos.mockRejectedValue(Object.assign(new Error("Bad credentials"), { status: 401 }));
    const { GET } = await import("./repos/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("POST /api/repos/resolve", () => {
  it("resolves a pasted URL and confirms access", async () => {
    getRepo.mockResolvedValue({ fullName: "owner/repo" });
    const { POST } = await import("./repos/resolve/route");
    const res = await POST(post({ url: "https://github.com/owner/repo" }));
    expect(res.status).toBe(200);
    // `repo` must stay the name string — RepoUrlInput builds a URL from it.
    expect(await json(res)).toMatchObject({
      owner: "owner",
      repo: "repo",
      repository: { fullName: "owner/repo" },
    });
    expect(getRepo).toHaveBeenCalledWith("owner", "repo");
  });

  it("carries a pull number through for deep links", async () => {
    getRepo.mockResolvedValue({ fullName: "owner/repo" });
    const { POST } = await import("./repos/resolve/route");
    const res = await POST(post({ url: "https://github.com/owner/repo/pull/42" }));
    expect(await json(res)).toMatchObject({ pullNumber: 42 });
  });

  it("rejects a non-string url with 400", async () => {
    const { POST } = await import("./repos/resolve/route");
    const res = await POST(post({ url: 42 }));
    expect(res.status).toBe(400);
    expect(getRepo).not.toHaveBeenCalled();
  });

  it("rejects a malformed body with 400", async () => {
    const { POST } = await import("./repos/resolve/route");
    const res = await POST(post("not json"));
    expect(res.status).toBe(400);
  });

  it("rejects an unparseable URL with a helpful 400", async () => {
    const { POST } = await import("./repos/resolve/route");
    const res = await POST(post({ url: "https://gitlab.com/o/r" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/owner\/repo/);
    expect(getRepo).not.toHaveBeenCalled();
  });

  it("parsing is not access — a 404 from GitHub still surfaces", async () => {
    getRepo.mockRejectedValue(Object.assign(new Error("Not Found"), { status: 404 }));
    const { POST } = await import("./repos/resolve/route");
    const res = await POST(post({ url: "owner/repo" }));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/repos/:owner/:repo/pulls", () => {
  it("returns open pulls", async () => {
    listOpenPulls.mockResolvedValue([{ number: 1 }]);
    const { GET } = await import("./repos/[owner]/[repo]/pulls/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ owner: "o", repo: "r" }),
    });
    expect(await json(res)).toEqual({ pulls: [{ number: 1 }] });
  });

  it("maps an invalid ref to 400", async () => {
    const { InvalidInputError } = await import("@/lib/validate");
    listOpenPulls.mockRejectedValue(new InvalidInputError("Invalid owner: ../x"));
    const { GET } = await import("./repos/[owner]/[repo]/pulls/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ owner: "../x", repo: "r" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/repos/:owner/:repo/pulls/:number", () => {
  it("returns the PR detail", async () => {
    getPullDetail.mockResolvedValue({ number: 7, files: [] });
    const { GET } = await import("./repos/[owner]/[repo]/pulls/[number]/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ owner: "o", repo: "r", number: "7" }),
    });
    expect(await json(res)).toMatchObject({ number: 7 });
    expect(getPullDetail).toHaveBeenCalledWith("o", "r", "7");
  });

  it("maps an upstream failure to 500 without leaking a credential", async () => {
    getPullDetail.mockRejectedValue(
      new Error("failed with github_pat_11ABCDE0123456789abcdefgh"),
    );
    const { GET } = await import("./repos/[owner]/[repo]/pulls/[number]/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ owner: "o", repo: "r", number: "7" }),
    });
    expect(res.status).toBe(500);
    expect((await json(res)).error).not.toContain("github_pat_");
  });
});
