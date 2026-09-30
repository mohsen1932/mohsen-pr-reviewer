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

  it("maps a GitHub 403 to rate-limit-or-access", async () => {
    const res = errorResponse(Object.assign(new Error("forbidden"), { status: 403 }));
    expect(res.status).toBe(403);
    expect((await body(res)).error).toMatch(/rate limited|lacks access/i);
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
