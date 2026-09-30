import { describe, expect, it } from "vitest";
import path from "node:path";
import { PathEscapeError, resolveInside, toRepoRelative } from "./paths";

const ROOT = "/cache/repos/owner/repo";

describe("resolveInside", () => {
  it.each(["src/index.ts", "a.ts", "deep/nested/file.tsx", ".github/workflows/ci.yml"])(
    "accepts %s",
    (p) => {
      expect(resolveInside(ROOT, p)).toBe(path.resolve(ROOT, p));
    },
  );

  it("normalizes a redundant path", () => {
    expect(resolveInside(ROOT, "src/./a.ts")).toBe(path.resolve(ROOT, "src/a.ts"));
  });

  it.each([
    ["empty", ""],
    ["absolute", "/etc/passwd"],
    ["windows absolute", "C:\\Windows\\system32"],
    ["parent traversal", "../secrets"],
    ["deep traversal", "../../../../etc/passwd"],
    ["interior traversal", "src/../../etc/passwd"],
    ["NUL byte", "src/a\0.ts"],
  ])("rejects %s", (_label, p) => {
    expect(() => resolveInside(ROOT, p)).toThrow(PathEscapeError);
  });

  it("rejects traversal that resolves back inside but passes through outside", () => {
    // Normalizes to ROOT/other — still contained, so this must be allowed.
    expect(() => resolveInside(ROOT, "src/../other")).not.toThrow();
  });

  it("rejects a sibling directory with a shared prefix", () => {
    // /cache/repos/owner/repo-evil must not count as inside /cache/repos/owner/repo.
    expect(() => resolveInside(ROOT, "../repo-evil/x")).toThrow(PathEscapeError);
  });

  it.each([".git", ".git/config", ".git/hooks/pre-commit"])(
    "refuses to read %s, which holds credentials and the object store",
    (p) => {
      expect(() => resolveInside(ROOT, p)).toThrow(PathEscapeError);
    },
  );

  it("allows a file that merely starts with .git", () => {
    expect(() => resolveInside(ROOT, ".gitignore")).not.toThrow();
    expect(() => resolveInside(ROOT, ".github/x.yml")).not.toThrow();
  });

  it("names the offending input so the model can correct it", () => {
    expect(() => resolveInside(ROOT, "../x")).toThrow(/\.\.\/x/);
  });
});

describe("toRepoRelative", () => {
  it("returns a forward-slash repo-relative path", () => {
    expect(toRepoRelative(ROOT, path.join(ROOT, "src", "a.ts"))).toBe("src/a.ts");
  });

  it("returns an empty string for the root itself", () => {
    expect(toRepoRelative(ROOT, ROOT)).toBe("");
  });
});
