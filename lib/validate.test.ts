import { describe, expect, it } from "vitest";
import {
  assertRepoRef,
  InvalidInputError,
  isSafeRepoPath,
  isValidName,
  parsePullNumber,
} from "./validate";

describe("isValidName", () => {
  it.each(["owner", "my-org", "my.repo", "repo_name", "a1", "123"])("accepts %s", (n) => {
    expect(isValidName(n)).toBe(true);
  });

  it.each(["", "a/b", "a b", "a;b", "a\0b", "a$b", "..", ".", "a\nb"])(
    "rejects %j",
    (n) => {
      expect(isValidName(n)).toBe(false);
    },
  );

  it("rejects .. even though its characters are allowed", () => {
    expect(isValidName("..")).toBe(false);
  });
});

describe("assertRepoRef", () => {
  it("passes a valid pair", () => {
    expect(() => assertRepoRef("owner", "repo")).not.toThrow();
  });

  it("names the offending field", () => {
    expect(() => assertRepoRef("bad owner", "repo")).toThrow(/Invalid owner/);
    expect(() => assertRepoRef("owner", "bad/repo")).toThrow(/Invalid repository/);
  });

  it("throws InvalidInputError so routes can map it to a 400", () => {
    expect(() => assertRepoRef("../x", "repo")).toThrow(InvalidInputError);
  });
});

describe("parsePullNumber", () => {
  it.each([
    ["42", 42],
    [42, 42],
    ["1", 1],
  ])("accepts %j", (input, expected) => {
    expect(parsePullNumber(input)).toBe(expected);
  });

  it.each(["0", "-1", "1.5", "abc", "", "1e3000", "Infinity", "NaN"])(
    "rejects %j",
    (input) => {
      expect(() => parsePullNumber(input)).toThrow(InvalidInputError);
    },
  );
});

describe("isSafeRepoPath", () => {
  it.each(["src/index.ts", "a.ts", "deep/nested/path/file.tsx"])("accepts %s", (p) => {
    expect(isSafeRepoPath(p)).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["absolute", "/etc/passwd"],
    ["windows absolute", "C:\\Windows\\system32"],
    ["traversal", "../secrets"],
    ["interior traversal", "src/../../etc/passwd"],
    ["windows traversal", "src\\..\\..\\etc"],
    ["NUL byte", "src/a\0.ts"],
  ])("rejects %s", (_label, p) => {
    expect(isSafeRepoPath(p)).toBe(false);
  });

  it("allows a filename that merely starts with dots", () => {
    expect(isSafeRepoPath(".github/workflows/ci.yml")).toBe(true);
    expect(isSafeRepoPath("..gitignore")).toBe(true);
  });
});
