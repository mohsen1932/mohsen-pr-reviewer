import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAuthenticated = vi.fn();
// A function expression, not an arrow: the module calls `new Octokit(...)`,
// and arrows are not constructors.
const OctokitCtor = vi.fn(function Octokit() {
  return { rest: { users: { getAuthenticated } } };
});

vi.mock("@octokit/rest", () => ({ Octokit: OctokitCtor }));

let savedToken: string | undefined;

beforeEach(() => {
  savedToken = process.env.GITHUB_TOKEN;
  OctokitCtor.mockClear();
  getAuthenticated.mockReset();
});

afterEach(() => {
  if (savedToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = savedToken;
});

async function load(token?: string) {
  if (token === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = token;
  vi.resetModules();
  return import("./github");
}

const TOKEN = "github_pat_11ABCDE0123456789abcdefgh";

describe("github()", () => {
  it("throws when the token is absent", async () => {
    const { github } = await load(undefined);
    expect(() => github()).toThrow("GITHUB_TOKEN is not set");
  });

  it("constructs Octokit with the token", async () => {
    const { github } = await load(TOKEN);
    github();
    expect(OctokitCtor).toHaveBeenCalledWith(
      expect.objectContaining({ auth: TOKEN, userAgent: "local-pr-reviewer" }),
    );
  });

  it("returns a singleton — one client for the process", async () => {
    const { github } = await load(TOKEN);
    const first = github();
    const second = github();
    expect(first).toBe(second);
    expect(OctokitCtor).toHaveBeenCalledTimes(1);
  });
});

describe("getAuthenticatedUser", () => {
  it("maps the GitHub payload to our shape", async () => {
    const { getAuthenticatedUser } = await load(TOKEN);
    getAuthenticated.mockResolvedValue({
      data: { login: "octocat", name: "Mona", avatar_url: "https://x/a.png" },
    });
    await expect(getAuthenticatedUser()).resolves.toEqual({
      login: "octocat",
      name: "Mona",
      avatarUrl: "https://x/a.png",
    });
  });

  it("normalizes a missing name to null", async () => {
    const { getAuthenticatedUser } = await load(TOKEN);
    getAuthenticated.mockResolvedValue({
      data: { login: "octocat", name: undefined, avatar_url: "https://x/a.png" },
    });
    await expect(getAuthenticatedUser()).resolves.toMatchObject({ name: null });
  });

  it("propagates an API failure", async () => {
    const { getAuthenticatedUser } = await load(TOKEN);
    getAuthenticated.mockRejectedValue(new Error("HttpError: 401"));
    await expect(getAuthenticatedUser()).rejects.toThrow("401");
  });
});
