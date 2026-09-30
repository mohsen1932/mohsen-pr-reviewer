import { describe, expect, it } from "vitest";
import { errorResponse } from "./api";
import { InvalidInputError } from "./validate";

async function body(res: Response) {
  return (await res.json()) as { error: string };
}

describe("errorResponse", () => {
  it("maps InvalidInputError to 400 with its message", async () => {
    const res = errorResponse(new InvalidInputError("Invalid owner: ../x"));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("Invalid owner: ../x");
  });

  it("maps a GitHub 401 to a token message", async () => {
    const res = errorResponse(Object.assign(new Error("Bad credentials"), { status: 401 }));
    expect(res.status).toBe(401);
    expect((await body(res)).error).toContain("GITHUB_TOKEN");
  });

  it("maps a bare GitHub 403 to an access message", async () => {
    // Without rate-limit headers a 403 is a permissions problem, and saying
    // "rate limited" would send the user looking in the wrong place.
    const res = errorResponse(Object.assign(new Error("forbidden"), { status: 403 }));
    expect(res.status).toBe(403);
    expect((await body(res)).error).toMatch(/lack access/i);
  });

  it("maps a GitHub 404 to an access message, not 'not found'", async () => {
    const res = errorResponse(Object.assign(new Error("Not Found"), { status: 404 }));
    expect(res.status).toBe(404);
    // 404 is also what an unapproved fine-grained token returns (SPEC.md §5),
    // so the message must point at access rather than at a typo.
    expect((await body(res)).error).toContain("token covers this repository");
  });

  it("falls back to 500 for anything else", async () => {
    const res = errorResponse(new Error("socket hang up"));
    expect(res.status).toBe(500);
    expect((await body(res)).error).toBe("socket hang up");
  });

  it("never leaks a credential from an upstream error", async () => {
    const token = "github_pat_11ABCDE0123456789abcdefgh";
    const res = errorResponse(new Error(`request failed with ${token}`));
    const { error } = await body(res); // a Response body reads only once
    expect(error).not.toContain(token);
    expect(error).toContain("[redacted]");
  });

  it("handles a thrown non-Error", async () => {
    const res = errorResponse({ weird: true });
    expect(res.status).toBe(500);
  });
});

describe("rate limiting", () => {
  const rateLimited = (reset: number, remaining = "0") =>
    Object.assign(new Error("API rate limit exceeded"), {
      status: 403,
      response: {
        headers: { "x-ratelimit-remaining": remaining, "x-ratelimit-reset": String(reset) },
      },
    });

  it("says when the limit resets, so 'try later' is actionable", async () => {
    const inTenMinutes = Math.floor((Date.now() + 10 * 60_000) / 1000);
    const res = errorResponse(rateLimited(inTenMinutes));
    expect(res.status).toBe(403);
    const { error } = await body(res);
    expect(error).toContain("rate limit");
    expect(error).toMatch(/about \d+ minutes?/);
  });

  it("rounds up, so it never says zero minutes", async () => {
    const soon = Math.floor((Date.now() + 5_000) / 1000);
    const { error } = await body(errorResponse(rateLimited(soon)));
    expect(error).toContain("about 1 minute");
  });

  it("falls back to an access message when the quota is not exhausted", async () => {
    const reset = Math.floor((Date.now() + 60_000) / 1000);
    const { error } = await body(errorResponse(rateLimited(reset, "42")));
    expect(error).toContain("lack access");
  });

  it("falls back when the reset header is missing", async () => {
    const error403 = Object.assign(new Error("forbidden"), { status: 403, response: { headers: {} } });
    const { error } = await body(errorResponse(error403));
    expect(error).toContain("lack access");
  });

  it("ignores an unparseable reset header", async () => {
    const { error } = await body(errorResponse(rateLimited(Number.NaN)));
    expect(error).toContain("lack access");
  });

  it("treats a 429 the same as a rate-limited 403", async () => {
    const reset = Math.floor((Date.now() + 120_000) / 1000);
    const res = errorResponse(
      Object.assign(new Error("too many requests"), {
        status: 429,
        response: { headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) } },
      }),
    );
    expect((await body(res)).error).toContain("rate limit");
  });
});
