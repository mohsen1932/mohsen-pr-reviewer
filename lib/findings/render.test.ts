import { describe, expect, it } from "vitest";
import { commentPrefix, renderComment, renderReviewBody } from "./render";
import type { Finding } from "./schema";

const f = (over: Partial<Finding> = {}): Finding =>
  ({
    id: "f1",
    file: "src/auth/session.ts",
    line: 42,
    disposition: "blocking",
    category: "correctness",
    title: "Session token compared with ==",
    body: "`compareTokens()` is not constant-time.",
    failureScenario: "256 guesses per byte recovers the token in ~8k requests.",
    confidence: "confirmed",
    status: "approved",
    edited: false,
    lineValid: true,
    snapped: false,
    ...over,
  }) as Finding;

describe("commentPrefix", () => {
  it.each([
    ["blocking correctness", { disposition: "blocking" }, "**issue (blocking):**"],
    ["non-blocking", { disposition: "non-blocking" }, "**suggestion (non-blocking):**"],
  ])("renders %s as %s", (_label, over, expected) => {
    expect(commentPrefix(f(over as Partial<Finding>))).toBe(expected);
  });

  it("gives security its own label, since it reads differently", () => {
    expect(commentPrefix(f({ category: "security" }))).toBe("**security (blocking):**");
    expect(commentPrefix(f({ category: "security", disposition: "non-blocking" }))).toBe(
      "**security (non-blocking):**",
    );
  });

  it("always carries the disposition, since there are only two", () => {
    expect(commentPrefix(f({ disposition: "non-blocking" }))).toContain("(non-blocking)");
  });
});

describe("renderComment", () => {
  it("leads with the prefix and title, then the body", () => {
    const comment = renderComment(f());
    expect(comment.startsWith("**issue (blocking):** Session token compared with ==")).toBe(true);
    expect(comment).toContain("`compareTokens()` is not constant-time.");
  });

  it("includes the failure scenario when present", () => {
    expect(renderComment(f())).toContain("*Failure:* 256 guesses per byte");
  });

  it("omits the failure line when there is none", () => {
    expect(renderComment(f({ failureScenario: undefined }))).not.toContain("*Failure:*");
  });

  it("omits an empty failure scenario rather than printing a bare label", () => {
    expect(renderComment(f({ failureScenario: "   " }))).not.toContain("*Failure:*");
  });

  it("flags an unverified finding, so a reader can weigh it", () => {
    expect(renderComment(f({ confidence: "plausible" }))).toContain("unverified");
  });

  it("does not flag a confirmed finding", () => {
    expect(renderComment(f())).not.toContain("unverified");
  });
});

describe("renderReviewBody", () => {
  const body = (over: Parameters<typeof renderReviewBody>[0]) => renderReviewBody(over);

  it("summarizes counts by disposition", () => {
    const text = body({
      inline: [f(), f({ id: "2", disposition: "non-blocking", failureScenario: undefined })],
      fileLevel: [],
      model: "gpt-5.4-mini",
    });
    expect(text).toContain("2 findings");
    expect(text).toContain("1 blocking");
    expect(text).toContain("1 non-blocking");
  });

  it("singularizes a lone finding", () => {
    expect(body({ inline: [f()], fileLevel: [], model: "m" })).toContain("1 finding (");
  });

  it("names the model and that a human approved every comment", () => {
    const text = body({ inline: [f()], fileLevel: [], model: "gpt-5.4-mini" });
    expect(text).toContain("gpt-5.4-mini");
    expect(text).toContain("approved by a human");
  });

  it("adds a General section for findings that could not be anchored", () => {
    const text = body({
      inline: [f()],
      fileLevel: [f({ id: "2", lineValid: false, title: "Unanchored thing" })],
      model: "m",
    });
    expect(text).toContain("### General");
    expect(text).toContain("Unanchored thing");
    expect(text).toContain("src/auth/session.ts");
  });

  it("omits the General section when everything anchored", () => {
    expect(body({ inline: [f()], fileLevel: [], model: "m" })).not.toContain("### General");
  });

  it("counts file-level notes in the total", () => {
    const text = body({ inline: [f()], fileLevel: [f({ id: "2" })], model: "m" });
    expect(text).toContain("2 findings");
  });

  it("indents a multi-line file-level body so the markdown list survives", () => {
    const text = body({
      inline: [],
      fileLevel: [f({ body: "line one\nline two" })],
      model: "m",
    });
    expect(text).toContain("  line one\n  line two");
  });
});
