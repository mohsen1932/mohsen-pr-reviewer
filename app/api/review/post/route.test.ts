import { beforeEach, describe, expect, it, vi } from "vitest";

const postReview = vi.fn();

vi.mock("@/lib/review/post", async () => {
  const actual = await vi.importActual<typeof import("@/lib/review/post")>("@/lib/review/post");
  return { ...actual, postReview };
});

beforeEach(() => {
  vi.resetModules();
  postReview.mockReset().mockResolvedValue({
    url: "https://github.com/o/r/pull/7#r1",
    inlineCount: 2,
    fileLevelCount: 0,
    event: "COMMENT",
  });
});

const HEAD = "abc1234def";
const post = (body: unknown) =>
  new Request("http://localhost/api/review/post", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const valid = (over: Record<string, unknown> = {}) => ({
  owner: "o",
  repo: "r",
  number: 7,
  headSha: HEAD,
  event: "COMMENT",
  findings: [{ id: "f1" }],
  ...over,
});

describe("validation", () => {
  it("requires a findings array", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(valid({ findings: undefined })));
    expect(res.status).toBe(400);
    expect(postReview).not.toHaveBeenCalled();
  });

  it("requires a plausible head sha", async () => {
    const { POST } = await import("./route");
    for (const headSha of [undefined, "", "not-a-sha", 42]) {
      expect((await POST(post(valid({ headSha })))).status).toBe(400);
    }
    expect(postReview).not.toHaveBeenCalled();
  });

  it("rejects a malformed body", async () => {
    const { POST } = await import("./route");
    expect((await POST(post("not json"))).status).toBe(400);
  });

  it("falls back to COMMENT for an unrecognized event", async () => {
    const { POST } = await import("./route");
    await POST(post(valid({ event: "MERGE_IT" })));
    // Never silently escalate to a stronger review action.
    expect(postReview).toHaveBeenCalledWith(expect.objectContaining({ event: "COMMENT" }));
  });

  it("passes REQUEST_CHANGES through when asked", async () => {
    const { POST } = await import("./route");
    await POST(post(valid({ event: "REQUEST_CHANGES" })));
    expect(postReview).toHaveBeenCalledWith(
      expect.objectContaining({ event: "REQUEST_CHANGES" }),
    );
  });
});

describe("responses", () => {
  it("returns the posted review on success", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(valid()));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ inlineCount: 2 });
  });

  it("returns 409 with a kind the UI can branch on for a caller-fixable failure", async () => {
    const { PostError } = await import("@/lib/review/post");
    postReview.mockRejectedValue(new PostError("own-pr", "Not on your own PR."));
    const { POST } = await import("./route");
    const res = await POST(post(valid()));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ kind: "own-pr" });
  });

  it("returns 409 for a stale head, with the detail", async () => {
    const { PostError } = await import("@/lib/review/post");
    postReview.mockRejectedValue(new PostError("stale-head", "Head moved.", "abc → def"));
    const { POST } = await import("./route");
    const res = await POST(post(valid()));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ kind: "stale-head", detail: "abc → def" });
  });

  it("returns 502 when GitHub itself rejected the review", async () => {
    const { PostError } = await import("@/lib/review/post");
    postReview.mockRejectedValue(new PostError("github", "GitHub rejected it."));
    const { POST } = await import("./route");
    expect((await POST(post(valid()))).status).toBe(502);
  });

  it("maps an invalid repo ref to 400", async () => {
    const { InvalidInputError } = await import("@/lib/validate");
    postReview.mockRejectedValue(new InvalidInputError("Invalid owner: ../x"));
    const { POST } = await import("./route");
    expect((await POST(post(valid()))).status).toBe(400);
  });

  it("never leaks a credential from an unexpected failure", async () => {
    postReview.mockRejectedValue(new Error("failed with github_pat_11ABCDE0123456789abcdefgh"));
    const { POST } = await import("./route");
    const res = await POST(post(valid()));
    expect(JSON.stringify(await res.json())).not.toContain("github_pat_");
  });
});
