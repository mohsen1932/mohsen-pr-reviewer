import { describe, expect, it } from "vitest";
import { addedLines, commentableLines, isCommentable, parsePatch } from "./diff";

const SIMPLE = [
  "@@ -1,4 +1,5 @@ function greet()",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  "+const c = 4;",
  " const d = 5;",
  " return a;",
].join("\n");

describe("parsePatch", () => {
  it("returns no hunks for absent patches", () => {
    expect(parsePatch(undefined).hunks).toEqual([]);
    expect(parsePatch(null).hunks).toEqual([]);
    expect(parsePatch("").hunks).toEqual([]);
  });

  it("reads the hunk header", () => {
    const [hunk] = parsePatch(SIMPLE).hunks;
    expect(hunk).toMatchObject({
      oldStart: 1,
      oldLines: 4,
      newStart: 1,
      newLines: 5,
      section: "function greet()",
    });
  });

  it("treats an omitted count as 1, per the unified diff format", () => {
    const [hunk] = parsePatch("@@ -7 +9 @@\n-old\n+new").hunks;
    expect(hunk).toMatchObject({ oldStart: 7, oldLines: 1, newStart: 9, newLines: 1 });
  });

  it("numbers both sides independently", () => {
    const [hunk] = parsePatch(SIMPLE).hunks;
    expect(hunk.lines.map((l) => [l.kind, l.oldLine, l.newLine])).toEqual([
      ["context", 1, 1],
      ["del", 2, undefined],
      ["add", undefined, 2],
      ["add", undefined, 3],
      ["context", 3, 4],
      ["context", 4, 5],
    ]);
  });

  it("keeps line content without the marker", () => {
    const [hunk] = parsePatch(SIMPLE).hunks;
    expect(hunk.lines[2].content).toBe("const b = 3;");
  });

  it("parses multiple hunks", () => {
    const patch = ["@@ -1,2 +1,2 @@", " a", "+b", "@@ -40,2 +41,3 @@", " x", "+y"].join("\n");
    const { hunks } = parsePatch(patch);
    expect(hunks).toHaveLength(2);
    expect(hunks[1]).toMatchObject({ newStart: 41, newLines: 3 });
  });

  it("handles a new file (@@ -0,0 +1,n @@)", () => {
    const { hunks } = parsePatch("@@ -0,0 +1,2 @@\n+first\n+second");
    expect(hunks[0]).toMatchObject({ oldStart: 0, oldLines: 0, newStart: 1 });
    expect(hunks[0].lines.map((l) => l.newLine)).toEqual([1, 2]);
  });

  it("handles a deleted file (@@ -1,2 +0,0 @@)", () => {
    const { hunks } = parsePatch("@@ -1,2 +0,0 @@\n-gone\n-also gone");
    expect(hunks[0].lines.every((l) => l.kind === "del")).toBe(true);
    expect(commentableLines(parsePatch("@@ -1,2 +0,0 @@\n-gone")).size).toBe(0);
  });

  it("ignores the no-newline marker, which occupies no line number", () => {
    const { hunks } = parsePatch("@@ -1,1 +1,1 @@\n-old\n\\ No newline at end of file\n+new");
    expect(hunks[0].lines).toHaveLength(2);
    expect(hunks[0].lines[1]).toMatchObject({ kind: "add", newLine: 1 });
  });

  it("treats a fully empty line as empty context", () => {
    const { hunks } = parsePatch("@@ -1,2 +1,2 @@\n a\n\n+b");
    expect(hunks[0].lines[1]).toMatchObject({ kind: "context", content: "" });
  });

  it("skips preamble before the first hunk", () => {
    const patch = ["diff --git a/x b/x", "--- a/x", "+++ b/x", "@@ -1,1 +1,1 @@", "+only"].join("\n");
    expect(parsePatch(patch).hunks).toHaveLength(1);
  });

  it("handles a section heading containing @@", () => {
    const [hunk] = parsePatch("@@ -1,1 +1,1 @@ fn a@@b()\n+x").hunks;
    expect(hunk.section).toBe("fn a@@b()");
  });

  it("tolerates an empty section heading", () => {
    expect(parsePatch("@@ -1,1 +1,1 @@\n+x").hunks[0].section).toBe("");
  });
});

describe("commentableLines", () => {
  it("includes added and context lines, never deleted ones", () => {
    expect([...commentableLines(parsePatch(SIMPLE))].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("spans every hunk", () => {
    const patch = ["@@ -1,1 +1,1 @@", "+a", "@@ -40,1 +41,1 @@", "+b"].join("\n");
    expect([...commentableLines(parsePatch(patch))].sort((a, b) => a - b)).toEqual([1, 41]);
  });
});

describe("addedLines", () => {
  it("includes only added lines", () => {
    expect([...addedLines(parsePatch(SIMPLE))].sort((a, b) => a - b)).toEqual([2, 3]);
  });

  it("is empty for a context-only patch", () => {
    expect(addedLines(parsePatch("@@ -1,1 +1,1 @@\n unchanged")).size).toBe(0);
  });
});

describe("isCommentable", () => {
  it.each([
    [1, true],
    [3, true],
    [5, true],
    [6, false],
    [0, false],
    [999, false],
  ])("line %i -> %s", (line, expected) => {
    expect(isCommentable(parsePatch(SIMPLE), line)).toBe(expected);
  });
});
