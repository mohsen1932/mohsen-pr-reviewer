import { describe, expect, it } from "vitest";
import {
  compareFindings,
  DISPOSITIONS,
  ReportedFindingSchema,
  type Category,
  type Disposition,
  type Finding,
} from "./schema";

const SCENARIO = "A request with an empty token reaches compare() and returns true.";

const reported = (over: Record<string, unknown> = {}) => ({
  file: "src/a.ts",
  line: 10,
  disposition: "non-blocking",
  category: "correctness",
  title: "Something is wrong",
  body: "Explanation.",
  confidence: "plausible",
  ...over,
});

const parse = (over: Record<string, unknown> = {}) =>
  ReportedFindingSchema.safeParse(reported(over));
const issuesOf = (over: Record<string, unknown> = {}) => {
  const result = parse(over);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("field validation", () => {
  it("accepts a well-formed finding", () => {
    expect(parse().success).toBe(true);
  });

  it.each([
    ["empty file", { file: "" }],
    ["line below 1", { line: 0 }],
    ["fractional line", { line: 1.5 }],
    ["empty title", { title: "" }],
    ["empty body", { body: "" }],
    ["unknown disposition", { disposition: "urgent" }],
    ["unknown category", { category: "vibes" }],
    ["unknown confidence", { confidence: "certain" }],
  ])("rejects %s", (_label, over) => {
    expect(parse(over).success).toBe(false);
  });

  it("caps the title so it stays a one-liner", () => {
    expect(parse({ title: "x".repeat(121) }).success).toBe(false);
    expect(parse({ title: "x".repeat(120) }).success).toBe(true);
  });

  it("allows an optional endLine", () => {
    expect(parse({ endLine: 14 }).success).toBe(true);
  });
});

describe("blocking requires a failure scenario", () => {
  it("rejects blocking with no scenario", () => {
    const issues = issuesOf({ disposition: "blocking" });
    expect(issues.join()).toContain("failureScenario");
    // The message must tell the model what to do instead.
    expect(issues.join()).toContain("not blocking");
  });

  it("rejects blocking with a whitespace-only scenario", () => {
    expect(parse({ disposition: "blocking", failureScenario: "   " }).success).toBe(false);
  });

  it("rejects a scenario too short to be a scenario", () => {
    const issues = issuesOf({ disposition: "blocking", failureScenario: "it breaks" });
    expect(issues.join()).toContain("too short");
  });

  it("accepts blocking with a real scenario", () => {
    expect(parse({ disposition: "blocking", failureScenario: SCENARIO }).success).toBe(true);
  });

  it("does not require a scenario for non-blocking", () => {
    expect(parse({ disposition: "non-blocking" }).success).toBe(true);
  });
});

describe("nitpicks have no representation", () => {
  it("rejects the nitpick disposition outright", () => {
    // Removed from the vocabulary rather than filtered downstream: a model
    // cannot report what it cannot name (§8.1).
    expect(parse({ disposition: "nitpick" }).success).toBe(false);
  });

  it("rejects the style category, which only ever meant nitpick", () => {
    expect(parse({ category: "style" }).success).toBe(false);
  });

  it("offers exactly two dispositions", () => {
    expect([...DISPOSITIONS]).toEqual(["blocking", "non-blocking"]);
  });

  it("still accepts a security finding at either disposition", () => {
    expect(parse({ category: "security", disposition: "non-blocking" }).success).toBe(true);
    expect(
      parse({ category: "security", disposition: "blocking", failureScenario: SCENARIO }).success,
    ).toBe(true);
  });
});

describe("multiple violations", () => {
  it("reports every field problem at once, so one retry can fix all of them", () => {
    const issues = issuesOf({ title: "", category: "vibes" });
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.join()).toContain("title");
    expect(issues.join()).toContain("category");
  });

  it("holds back cross-field rules until the fields themselves are valid", () => {
    // Zod runs refinements only after base validation passes, so a bad
    // category masks the blocking/failureScenario rule. The model fixes the
    // field, retries, and then sees the second problem — two rounds, not one.
    const issues = issuesOf({ category: "vibes", disposition: "blocking" });
    expect(issues.join()).toContain("category");
    expect(issues.join()).not.toContain("failureScenario");
  });
});

describe("compareFindings", () => {
  const f = (over: Partial<Finding>): Finding =>
    ({
      ...reported(),
      id: "x",
      status: "pending",
      edited: false,
      lineValid: true,
      snapped: false,
      origin: "agent",
      ...over,
    }) as Finding;

  it("puts blocking before non-blocking", () => {
    const sorted = [
      f({ disposition: "non-blocking" }),
      f({ disposition: "blocking", failureScenario: SCENARIO }),
    ].sort(compareFindings);
    expect(sorted.map((x) => x.disposition)).toEqual(["blocking", "non-blocking"]);
  });

  it("puts security and correctness first within a disposition", () => {
    const sorted = (["docs", "security", "maintainability", "correctness"] as Category[])
      .map((category) => f({ category }))
      .sort(compareFindings);
    expect(sorted.map((x) => x.category)).toEqual([
      "security",
      "correctness",
      "maintainability",
      "docs",
    ]);
  });

  it("orders by line within a category", () => {
    const sorted = [f({ line: 30 }), f({ line: 10 }), f({ line: 20 })].sort(compareFindings);
    expect(sorted.map((x) => x.line)).toEqual([10, 20, 30]);
  });

  it("is deterministic on a full tie", () => {
    const sorted = [f({ title: "b" }), f({ title: "a" })].sort(compareFindings);
    expect(sorted.map((x) => x.title)).toEqual(["a", "b"]);
  });

  it("ranks disposition above category", () => {
    const sorted = [
      f({ disposition: "non-blocking" as Disposition, category: "security" }),
      f({ disposition: "blocking" as Disposition, category: "docs", failureScenario: SCENARIO }),
    ].sort(compareFindings);
    expect(sorted[0].disposition).toBe("blocking");
  });
});
