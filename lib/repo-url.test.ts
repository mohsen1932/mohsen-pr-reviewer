import { describe, expect, it } from "vitest";
import { parseRepoUrl } from "./repo-url";

describe("the five documented forms", () => {
  it.each([
    ["https URL", "https://github.com/owner/repo"],
    ["https URL with .git", "https://github.com/owner/repo.git"],
    ["ssh remote", "git@github.com:owner/repo.git"],
    ["bare owner/repo", "owner/repo"],
    ["host-relative", "github.com/owner/repo"],
  ])("parses a %s", (_label, input) => {
    expect(parseRepoUrl(input)).toEqual({ owner: "owner", repo: "repo" });
  });

  it("deep-links a pull request URL", () => {
    expect(parseRepoUrl("https://github.com/owner/repo/pull/42")).toEqual({
      owner: "owner",
      repo: "repo",
      pullNumber: 42,
    });
  });
});

describe("tolerated variations", () => {
  it.each([
    ["trailing slash", "https://github.com/owner/repo/"],
    ["surrounding whitespace", "  https://github.com/owner/repo  "],
    ["www host", "https://www.github.com/owner/repo"],
    ["http scheme", "http://github.com/owner/repo"],
    ["query string", "https://github.com/owner/repo?tab=readme"],
    ["fragment", "https://github.com/owner/repo#readme"],
    ["ssh without .git", "git@github.com:owner/repo"],
  ])("accepts %s", (_label, input) => {
    expect(parseRepoUrl(input)).toMatchObject({ owner: "owner", repo: "repo" });
  });

  it("ignores extra path segments that are not a PR", () => {
    expect(parseRepoUrl("https://github.com/owner/repo/tree/main/src")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  it("accepts the /pulls/ spelling", () => {
    expect(parseRepoUrl("https://github.com/owner/repo/pulls/7")).toMatchObject({
      pullNumber: 7,
    });
  });

  it("keeps dots and dashes in names", () => {
    expect(parseRepoUrl("my-org/my.repo_name")).toEqual({
      owner: "my-org",
      repo: "my.repo_name",
    });
  });

  it("strips only a trailing .git, not an interior one", () => {
    expect(parseRepoUrl("owner/repo.github.io")).toMatchObject({ repo: "repo.github.io" });
  });
});

describe("rejections", () => {
  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
    ["owner with no repo", "https://github.com/owner"],
    ["bare owner", "owner"],
    ["a different host", "https://gitlab.com/owner/repo"],
    ["a lookalike host", "https://github.com.evil.test/owner/repo"],
    ["unparseable URL", "https://"],
    ["traversal in owner", "../etc/passwd"],
    ["name with a space", "own er/repo"],
    ["name with a slash escape", "owner/re%2Fpo"],
  ])("rejects %s", (_label, input) => {
    expect(parseRepoUrl(input)).toBeNull();
  });

  it("rejects dot-segments that pass the character class", () => {
    expect(parseRepoUrl("./.")).toBeNull();
    expect(parseRepoUrl("../..")).toBeNull();
  });
});

describe("pull number handling", () => {
  it.each([
    ["zero", "https://github.com/owner/repo/pull/0"],
    ["negative", "https://github.com/owner/repo/pull/-3"],
    ["non-numeric", "https://github.com/owner/repo/pull/abc"],
    ["missing", "https://github.com/owner/repo/pull"],
  ])("drops an invalid pull number (%s) but keeps the repo", (_label, input) => {
    expect(parseRepoUrl(input)).toEqual({ owner: "owner", repo: "repo" });
  });

  it("omits the key entirely when there is no PR, rather than setting undefined", () => {
    expect(Object.hasOwn(parseRepoUrl("owner/repo")!, "pullNumber")).toBe(false);
  });
});
