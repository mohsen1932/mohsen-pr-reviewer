import { describe, expect, it } from "vitest";
import {
  compareFindings,
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

  it("does not require a scenario for non-blocking or nitpick", () => {
    expect(parse({ disposition: "non-blocking" }).success).toBe(true);
    expect(parse({ disposition: "nitpick" }).success).toBe(true);
  });
});

describe("style is a nitpick by definition", () => {
  it.each(["blocking", "non-blocking"])("rejects style marked %s", (disposition) => {
    const issues = issuesOf({ category: "style", disposition, failureScenario: SCENARIO });
    expect(issues.join()).toContain("nitpick by definition");
  });

  it("accepts style as a nitpick", () => {
    expect(parse({ category: "style", disposition: "nitpick" }).success).toBe(true);
  });
});

describe("security is never a nitpick", () => {
  it("rejects security marked nitpick", () => {
    const issues = issuesOf({ category: "security", disposition: "nitpick" });
    expect(issues.join()).toContain("cannot be a nitpick");
  });

  it.each([
    ["blocking", SCENARIO],
    ["non-blocking", undefined],
  ])("accepts security as %s", (disposition, failureScenario) => {
    expect(parse({ category: "security", disposition, failureScenario }).success).toBe(true);
  });
});

describe("multiple violations", () => {
  it("reports every problem at once, so one retry can fix all of them", () => {
    const issues = issuesOf({ category: "style", disposition: "blocking" });
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.join()).toContain("failureScenario");
    expect(issues.join()).toContain("nitpick by definition");
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

  it("puts blocking before non-blocking before nitpick", () => {
    const sorted = [
      f({ disposition: "nitpick" }),
      f({ disposition: "blocking", failureScenario: SCENARIO }),
      f({ disposition: "non-blocking" }),
    ].sort(compareFindings);
    expect(sorted.map((x) => x.disposition)).toEqual(["blocking", "non-blocking", "nitpick"]);
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
