import { describe, expect, it } from "vitest";
import { parsePatch } from "../diff";
import { anchorFinding, SNAP_RADIUS, type AnchorTarget } from "./anchor";

// new-side lines 1..5 exist; 2 and 3 are added, 1/4/5 are context.
const PATCH = [
  "@@ -1,4 +1,5 @@",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  "+const c = 4;",
  " const d = 5;",
  " return a;",
].join("\n");

const target = (over: Partial<AnchorTarget> = {}): AnchorTarget => ({
  filename: "src/a.ts",
  parsed: parsePatch(PATCH),
  ...over,
});
const FILES = [target()];

describe("file must be in the pull request", () => {
  it("rejects a file the PR did not touch", () => {
    const result = anchorFinding({ file: "src/other.ts", line: 2 }, FILES);
    expect(result).toMatchObject({ ok: false, reason: "file-not-in-pr" });
  });

  it("suggests the right path when only the directory is wrong", () => {
    const result = anchorFinding({ file: "lib/a.ts", line: 2 }, FILES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('Did you mean "src/a.ts"');
  });

  it("does not invent a suggestion when nothing matches", () => {
    const result = anchorFinding({ file: "src/zzz.ts", line: 2 }, FILES);
    if (!result.ok) expect(result.message).not.toContain("Did you mean");
  });

  it("rejects against an empty file list", () => {
    expect(anchorFinding({ file: "src/a.ts", line: 1 }, []).ok).toBe(false);
  });
});

describe("lines already in the diff", () => {
  it.each([1, 2, 3, 4, 5])("accepts line %i unchanged", (line) => {
    expect(anchorFinding({ file: "src/a.ts", line }, FILES)).toEqual({
      ok: true,
      line,
      lineValid: true,
      snapped: false,
    });
  });
});

describe("snapping", () => {
  it("snaps a nearby line to the closest added line", () => {
    const result = anchorFinding({ file: "src/a.ts", line: 7 }, FILES);
    // 7 is outside the hunk; line 5 is the nearest commentable line.
    expect(result).toMatchObject({ ok: true, line: 5, lineValid: true, snapped: true });
  });

  it("takes the closest line, even when a further one was added", () => {
    // ctx1=1, added2=2, ctx3=3. From line 5, ctx3 is 2 away and added2 is 3.
    // Distance wins: snapping to the added line would move the comment further
    // from where the model actually pointed.
    const patch = ["@@ -1,3 +1,3 @@", " ctx1", "+added2", " ctx3"].join("\n");
    const files = [target({ parsed: parsePatch(patch) })];
    expect(anchorFinding({ file: "src/a.ts", line: 5 }, files)).toMatchObject({
      line: 3,
      snapped: true,
    });
  });

  it("breaks an exact tie toward the added line", () => {
    // ctx1=1, added2=2, ctx3=3. Line 2 is itself commentable, so use a patch
    // where an added and a context line sit equidistant from the target.
    const patch = ["@@ -1,4 +1,4 @@", " a", "+b", " c", " d"].join("\n");
    const files = [target({ parsed: parsePatch(patch) })];
    // From line 5: d=4 is 1 away, c=3 is 2, b=2 is 3 → nearest is 4.
    expect(anchorFinding({ file: "src/a.ts", line: 5 }, files)).toMatchObject({ line: 4 });
  });

  it("explains the move in a note", () => {
    const result = anchorFinding({ file: "src/a.ts", line: 7 }, FILES);
    if (result.ok) expect(result.note).toContain("anchored to the nearest changed line");
  });

  it(`gives up beyond ${SNAP_RADIUS} lines and posts as a file-level note`, () => {
    const result = anchorFinding({ file: "src/a.ts", line: 200 }, FILES);
    expect(result).toMatchObject({ ok: true, line: 200, lineValid: false, snapped: false });
  });

  it("snaps at exactly the radius boundary", () => {
    expect(anchorFinding({ file: "src/a.ts", line: 5 + SNAP_RADIUS }, FILES)).toMatchObject({
      lineValid: true,
      snapped: true,
    });
  });

  it("does not snap one line past the radius", () => {
    expect(anchorFinding({ file: "src/a.ts", line: 5 + SNAP_RADIUS + 1 }, FILES)).toMatchObject({
      lineValid: false,
    });
  });

  it("prefers the smaller line on a tie, so results are deterministic", () => {
    const patch = ["@@ -1,5 +1,5 @@", " a", " b", "+c", " d", " e"].join("\n");
    const files = [target({ parsed: parsePatch(patch) })];
    // Equidistant candidates on both sides must resolve the same way each run.
    const first = anchorFinding({ file: "src/a.ts", line: 99 }, files);
    const second = anchorFinding({ file: "src/a.ts", line: 99 }, files);
    expect(first).toEqual(second);
  });
});

describe("files with no usable patch", () => {
  it("keeps the finding as a file-level note when the patch was omitted", () => {
    const files = [target({ patchOmitted: true })];
    const result = anchorFinding({ file: "src/a.ts", line: 4 }, files);
    expect(result).toMatchObject({ ok: true, lineValid: false });
    if (result.ok) expect(result.note).toContain("file-level note");
  });

  it("keeps the finding when the file has no hunks", () => {
    const files = [target({ parsed: parsePatch("") })];
    expect(anchorFinding({ file: "src/a.ts", line: 1 }, files)).toMatchObject({
      ok: true,
      lineValid: false,
    });
  });
});

describe("multiple files", () => {
  it("anchors against the right file", () => {
    const other = target({
      filename: "src/b.ts",
      parsed: parsePatch("@@ -40,1 +40,2 @@\n ctx\n+new"),
    });
    expect(anchorFinding({ file: "src/b.ts", line: 41 }, [...FILES, other])).toMatchObject({
      ok: true,
      line: 41,
      lineValid: true,
    });
  });
});
