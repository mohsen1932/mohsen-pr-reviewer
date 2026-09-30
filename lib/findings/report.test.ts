import { describe, expect, it, vi } from "vitest";
import { parsePatch } from "../diff";
import { acceptFinding } from "./report";
import type { AnchorTarget } from "../review/anchor";

const PATCH = ["@@ -1,4 +1,5 @@", " a", "-b", "+b2", "+c", " d", " e"].join("\n");
const FILES: AnchorTarget[] = [{ filename: "src/a.ts", parsed: parsePatch(PATCH) }];
const SCENARIO = "A request with an empty token reaches compare() and returns true.";

const input = (over: Record<string, unknown> = {}) => ({
  file: "src/a.ts",
  line: 2,
  disposition: "non-blocking",
  category: "correctness",
  title: "Wrong comparison",
  body: "Uses == instead of ===.",
  confidence: "plausible",
  ...over,
});

describe("accepting a valid finding", () => {
  it("returns a finding with UI state the model never supplies", () => {
    const result = acceptFinding(input(), FILES);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.finding).toMatchObject({
      file: "src/a.ts",
      line: 2,
      status: "pending",
      edited: false,
      lineValid: true,
      snapped: false,
      origin: "agent",
    });
    expect(result.finding.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("gives each finding a distinct id", () => {
    const a = acceptFinding(input(), FILES);
    const b = acceptFinding(input(), FILES);
    if (!a.accepted || !b.accepted) throw new Error("expected both accepted");
    expect(a.finding.id).not.toBe(b.finding.id);
  });

  it("anchors a near-miss line and reports the move", () => {
    const result = acceptFinding(input({ line: 7 }), FILES);
    if (!result.accepted) throw new Error("expected accepted");
    expect(result.finding).toMatchObject({ line: 5, snapped: true, lineValid: true });
    expect(result.note).toContain("nearest changed line");
  });

  it("keeps an unanchorable finding as a file-level note", () => {
    const result = acceptFinding(input({ line: 900 }), FILES);
    if (!result.accepted) throw new Error("expected accepted");
    expect(result.finding.lineValid).toBe(false);
  });

  it("keeps a coherent endLine", () => {
    const result = acceptFinding(input({ line: 2, endLine: 4 }), FILES);
    if (!result.accepted) throw new Error("expected accepted");
    expect(result.finding.endLine).toBe(4);
  });

  it("drops an endLine that ended up before the anchored line", () => {
    // Anchoring moves line 7 down to 5; an endLine of 3 would now be inverted.
    const result = acceptFinding(input({ line: 7, endLine: 3 }), FILES);
    if (!result.accepted) throw new Error("expected accepted");
    expect(result.finding.line).toBe(5);
    expect(result.finding.endLine).toBeUndefined();
  });
});

describe("rejections are actionable", () => {
  it("rejects a file outside the PR and names the likely path", () => {
    const result = acceptFinding(input({ file: "lib/a.ts" }), FILES);
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.message).toContain('Did you mean "src/a.ts"');
  });

  it("tells the model the finding was not recorded", () => {
    const result = acceptFinding(input({ title: "" }), FILES);
    if (result.accepted) throw new Error("expected rejection");
    // Otherwise the model may assume it landed and move on.
    expect(result.message).toContain("not recorded");
    expect(result.message).toContain("call report_finding again");
  });

  it("names the offending field", () => {
    const result = acceptFinding(input({ disposition: "blocking" }), FILES);
    if (result.accepted) throw new Error("expected rejection");
    expect(result.message).toContain("failureScenario");
  });

  it("lists every field problem at once", () => {
    const result = acceptFinding(input({ title: "", category: "vibes" }), FILES);
    if (result.accepted) throw new Error("expected rejection");
    expect(result.message).toContain("title");
    expect(result.message).toContain("category");
  });

  it("refuses a nitpick outright — there is no such disposition", () => {
    const result = acceptFinding(input({ disposition: "nitpick" }), FILES);
    expect(result.accepted).toBe(false);
  });

  it.each([
    ["null", null],
    ["a string", "finding"],
    ["an empty object", {}],
    ["missing body", { file: "src/a.ts", line: 1 }],
  ])("rejects %s without throwing", (_label, value) => {
    expect(() => acceptFinding(value, FILES)).not.toThrow();
    expect(acceptFinding(value, FILES).accepted).toBe(false);
  });

  it("accepts blocking once a real scenario is supplied", () => {
    const result = acceptFinding(
      input({ disposition: "blocking", failureScenario: SCENARIO }),
      FILES,
    );
    expect(result.accepted).toBe(true);
  });
});

describe("determinism", () => {
  it("produces the same finding apart from the id", () => {
    vi.spyOn(Math, "random"); // guard: nothing here may depend on Math.random
    const a = acceptFinding(input(), FILES);
    const b = acceptFinding(input(), FILES);
    if (!a.accepted || !b.accepted) throw new Error("expected accepted");
    const strip = (f: Record<string, unknown>) => ({ ...f, id: "" });
    expect(strip(a.finding)).toEqual(strip(b.finding));
    vi.restoreAllMocks();
  });
});
