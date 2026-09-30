import { describe, expect, it } from "vitest";
import { parsePatch } from "../diff";
import { extractSnippet, SNIPPET_CONTEXT } from "./snippet";

// new-side: 1 ctx, 2 add, 3 add, 4 ctx, 5 ctx
const PATCH = ["@@ -1,4 +1,5 @@", " a", "-b", "+b2", "+c", " d", " e"].join("\n");
const parsed = parsePatch(PATCH);

const LONG = [
  "@@ -1,20 +1,20 @@",
  ...Array.from({ length: 20 }, (_, i) => ` line${i + 1}`),
].join("\n");

describe("extractSnippet", () => {
  it("centres on the target line", () => {
    const snippet = extractSnippet(parsed, 3)!;
    const target = snippet.lines.filter((l) => l.target);
    expect(target).toHaveLength(1);
    expect(target[0].newLine).toBe(3);
  });

  it("includes surrounding context on both sides", () => {
    const snippet = extractSnippet(parsePatch(LONG), 10)!;
    const numbers = snippet.lines.map((l) => l.newLine);
    expect(numbers[0]).toBe(10 - SNIPPET_CONTEXT);
    expect(numbers.at(-1)).toBe(10 + SNIPPET_CONTEXT);
  });

  it("keeps deleted lines, which have no new-side number", () => {
    const snippet = extractSnippet(parsed, 2)!;
    expect(snippet.lines.some((l) => l.kind === "del")).toBe(true);
  });

  it("marks a multi-line range as the target", () => {
    const snippet = extractSnippet(parsed, 2, 3)!;
    expect(snippet.lines.filter((l) => l.target).map((l) => l.newLine)).toEqual([2, 3]);
  });

  it("does not run past the start of the hunk", () => {
    const snippet = extractSnippet(parsed, 1)!;
    expect(snippet.truncatedBefore).toBe(false);
    expect(snippet.lines[0].newLine).toBe(1);
  });

  it("does not run past the end of the hunk", () => {
    const snippet = extractSnippet(parsed, 5)!;
    expect(snippet.truncatedAfter).toBe(false);
  });

  it("reports truncation when the hunk is larger than the window", () => {
    const snippet = extractSnippet(parsePatch(LONG), 10)!;
    expect(snippet).toMatchObject({ truncatedBefore: true, truncatedAfter: true });
  });

  it("honours a custom context size", () => {
    expect(extractSnippet(parsePatch(LONG), 10, undefined, 1)!.lines).toHaveLength(3);
  });

  it("returns null for a line that is not in the diff", () => {
    // A file-level finding (§8.5) has no code to show.
    expect(extractSnippet(parsed, 900)).toBeNull();
  });

  it("returns null for an empty patch", () => {
    expect(extractSnippet(parsePatch(""), 1)).toBeNull();
  });

  it("finds the line in the correct hunk of several", () => {
    const multi = parsePatch(
      ["@@ -1,1 +1,1 @@", " first", "@@ -40,2 +41,2 @@", " ctx", "+target"].join("\n"),
    );
    const snippet = extractSnippet(multi, 42)!;
    expect(snippet.lines.filter((l) => l.target)[0]).toMatchObject({ content: "target" });
  });

  it("ignores an endLine that runs past the hunk", () => {
    const snippet = extractSnippet(parsed, 4, 999)!;
    expect(snippet.lines.filter((l) => l.target).map((l) => l.newLine)).toEqual([4, 5]);
  });
});
