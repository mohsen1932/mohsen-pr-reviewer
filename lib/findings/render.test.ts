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
  it("carries no summary and no attribution", () => {
    const text = renderReviewBody({ fileLevel: [] });
    // The body is not a place to advertise the tool (user request).
    expect(text).not.toMatch(/AI review/i);
    expect(text).not.toMatch(/gpt|model|reviewed by/i);
    expect(text).not.toMatch(/\d+ finding/i);
  });

  it("is non-empty, which GitHub requires for a COMMENT review", () => {
    expect(renderReviewBody({ fileLevel: [] }).trim().length).toBeGreaterThan(0);
  });

  it("carries only the findings that could not be anchored", () => {
    const text = renderReviewBody({
      fileLevel: [f({ id: "2", lineValid: false, title: "Unanchored thing" })],
    });
    expect(text).toContain("### General");
    expect(text).toContain("Unanchored thing");
    expect(text).toContain("src/auth/session.ts");
  });

  it("omits the General section when everything anchored", () => {
    expect(renderReviewBody({ fileLevel: [] })).not.toContain("### General");
  });

  it("indents a multi-line file-level body so the markdown list survives", () => {
    const text = renderReviewBody({ fileLevel: [f({ body: "line one\nline two" })] });
    expect(text).toContain("  line one\n  line two");
  });
});
