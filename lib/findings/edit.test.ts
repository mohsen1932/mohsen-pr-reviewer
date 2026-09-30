import { describe, expect, it } from "vitest";
import { parsePatch } from "../diff";
import { applyEdit, createUserFinding } from "./edit";
import type { AnchorTarget } from "../review/anchor";
import type { Finding } from "./schema";

const PATCH = ["@@ -1,4 +1,5 @@", " a", "-b", "+b2", "+c", " d", " e"].join("\n");
const FILES: AnchorTarget[] = [{ filename: "src/a.ts", parsed: parsePatch(PATCH) }];
const SCENARIO = "A request with an empty token reaches compare() and returns true.";

const base = (over: Partial<Finding> = {}): Finding =>
  ({
    id: "f1",
    file: "src/a.ts",
    line: 2,
    disposition: "non-blocking",
    category: "correctness",
    title: "Wrong",
    body: "Because.",
    confidence: "plausible",
    status: "pending",
    edited: false,
    lineValid: true,
    snapped: false,
    origin: "agent",
    ...over,
  }) as Finding;

describe("applyEdit", () => {
  it("updates text and marks the finding edited", () => {
    const result = applyEdit(base(), { title: "Rewritten", body: "New body." }, FILES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.finding).toMatchObject({ title: "Rewritten", body: "New body.", edited: true });
  });

  it("lets a human promote a finding to blocking with a scenario", () => {
    const result = applyEdit(
      base(),
      { disposition: "blocking", failureScenario: SCENARIO },
      FILES,
    );
    expect(result.ok).toBe(true);
  });

  it("holds a human to the same rule: blocking needs a scenario", () => {
    const result = applyEdit(base(), { disposition: "blocking" }, FILES);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe("failureScenario");
  });

  it("refuses to downgrade a finding to a nitpick, which no longer exists", () => {
    const result = applyEdit(base(), { disposition: "nitpick" as never }, FILES);
    expect(result.ok).toBe(false);
  });

  it("rejects an empty title", () => {
    const result = applyEdit(base(), { title: "" }, FILES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("title");
  });

  it("re-anchors when the line moves", () => {
    const result = applyEdit(base(), { line: 7 }, FILES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.finding).toMatchObject({ line: 5, snapped: true, lineValid: true });
    expect(result.note).toContain("nearest changed line");
  });

  it("marks a line that cannot be anchored as a file-level note", () => {
    const result = applyEdit(base(), { line: 900 }, FILES);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.finding.lineValid).toBe(false);
  });

  it("does not re-anchor when the line did not change", () => {
    // A user who deliberately placed a finding must not have it moved by an
    // unrelated body edit.
    const placed = base({ line: 4, snapped: true });
    const result = applyEdit(placed, { body: "new" }, FILES);
    if (!result.ok) throw new Error("expected ok");
    expect(result.finding).toMatchObject({ line: 4, snapped: true });
  });

  it("drops an endLine that ends up before the anchored line", () => {
    const result = applyEdit(base(), { line: 7, endLine: 3 }, FILES);
    if (!result.ok) throw new Error("expected ok");
    expect(result.finding.endLine).toBeUndefined();
  });

  it("keeps a coherent endLine", () => {
    const result = applyEdit(base(), { endLine: 4 }, FILES);
    if (!result.ok) throw new Error("expected ok");
    expect(result.finding.endLine).toBe(4);
  });

  it("preserves triage status through an edit", () => {
    const result = applyEdit(base({ status: "approved" }), { title: "x" }, FILES);
    if (!result.ok) throw new Error("expected ok");
    expect(result.finding.status).toBe("approved");
  });

  it("an empty change set is a no-op apart from the edited flag", () => {
    const result = applyEdit(base(), {}, FILES);
    if (!result.ok) throw new Error("expected ok");
    expect(result.finding).toMatchObject({ ...base(), edited: true });
  });
});

describe("createUserFinding", () => {
  const draft = {
    file: "src/a.ts",
    line: 2,
    disposition: "non-blocking" as const,
    category: "maintainability" as const,
    title: "My own note",
    body: "I think this is worth changing.",
  };

  it("creates an approved, user-marked finding", () => {
    const result = createUserFinding(draft, FILES, "u1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.finding).toMatchObject({
      id: "u1",
      origin: "user",
      status: "approved",
      edited: false,
    });
  });

  it("anchors like any other finding", () => {
    const result = createUserFinding({ ...draft, line: 7 }, FILES, "u1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.finding).toMatchObject({ line: 5, snapped: true });
  });

  it("refuses a file that is not in the pull request", () => {
    const result = createUserFinding({ ...draft, file: "other.ts" }, FILES, "u1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("line");
  });

  it("holds a user-written blocking finding to the scenario rule", () => {
    const result = createUserFinding({ ...draft, disposition: "blocking" }, FILES, "u1");
    expect(result.ok).toBe(false);
  });

  it("defaults confidence to confirmed — a human wrote it", () => {
    const result = createUserFinding(draft, FILES, "u1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.finding.confidence).toBe("confirmed");
  });
});
