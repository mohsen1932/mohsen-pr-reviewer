import { beforeEach, describe, expect, it, vi } from "vitest";
import { parsePatch } from "../diff";
import type { Finding } from "../findings/schema";

const createReview = vi.fn();
const getPullDetail = vi.fn();

vi.mock("../github", () => ({
  github: () => ({ rest: { pulls: { createReview } } }),
}));
vi.mock("../pulls", () => ({ getPullDetail }));

const HEAD = "abc1234def5678";
// new-side lines 1..5 exist
const PATCH = ["@@ -1,4 +1,5 @@", " a", "-b", "+b2", "+c", " d", " e"].join("\n");

const pullDetail = (over: Record<string, unknown> = {}) => ({
  number: 7,
  headSha: HEAD,
  authoredByViewer: false,
  files: [{ filename: "src/a.ts", parsed: parsePatch(PATCH) }],
  ...over,
});

const finding = (over: Partial<Finding> = {}): Finding =>
  ({
    id: "f1",
    file: "src/a.ts",
    line: 2,
    disposition: "blocking",
    category: "correctness",
    title: "Broken",
    body: "Because.",
    failureScenario: "Inputs lead to a wrong result and it matters here.",
    confidence: "confirmed",
    status: "approved",
    edited: false,
    lineValid: true,
    snapped: false,
    ...over,
  }) as Finding;

beforeEach(() => {
  vi.resetModules();
  createReview.mockReset().mockResolvedValue({ data: { html_url: "https://github.com/o/r/pull/7#r1" } });
  getPullDetail.mockReset().mockResolvedValue(pullDetail());
});

const load = () => import("./post");
const request = (over: Record<string, unknown> = {}) => ({
  owner: "o",
  repo: "r",
  number: 7,
  headSha: HEAD,
  event: "COMMENT" as const,
  findings: [finding()],
  ...over,
});

describe("posting", () => {
  it("makes exactly one createReview call", async () => {
    const { postReview } = await load();
    await postReview(request({ findings: [finding(), finding({ id: "f2", line: 3 })] }));
    // One review, one thread on the PR, all-or-nothing (§6).
    expect(createReview).toHaveBeenCalledTimes(1);
    expect(createReview.mock.calls[0][0].comments).toHaveLength(2);
  });

  it("pins the review to the reviewed commit", async () => {
    const { postReview } = await load();
    await postReview(request());
    expect(createReview.mock.calls[0][0]).toMatchObject({ commit_id: HEAD, event: "COMMENT" });
  });

  it("comments on the new side of the diff", async () => {
    const { postReview } = await load();
    await postReview(request());
    expect(createReview.mock.calls[0][0].comments[0]).toMatchObject({
      path: "src/a.ts",
      line: 2,
      side: "RIGHT",
    });
  });

  it("renders each comment in Conventional Comments form", async () => {
    const { postReview } = await load();
    await postReview(request());
    expect(createReview.mock.calls[0][0].comments[0].body).toContain("**issue (blocking):**");
  });

  it("posts a body with no summary or attribution", async () => {
    const { postReview } = await load();
    await postReview(request());
    const body = createReview.mock.calls[0][0].body;
    expect(body).not.toMatch(/AI review|reviewed by|gpt/i);
    // GitHub requires a non-empty body on a COMMENT review.
    expect(body.trim().length).toBeGreaterThan(0);
  });

  it("returns the review url and what was posted", async () => {
    const { postReview } = await load();
    await expect(postReview(request())).resolves.toMatchObject({
      url: "https://github.com/o/r/pull/7#r1",
      inlineCount: 1,
      fileLevelCount: 0,
      event: "COMMENT",
    });
  });

  it("moves an unanchorable finding into the review body instead of dropping it", async () => {
    const { postReview } = await load();
    const result = await postReview(request({ findings: [finding({ line: 900 })] }));
    expect(result).toMatchObject({ inlineCount: 0, fileLevelCount: 1 });
    expect(createReview.mock.calls[0][0].comments).toHaveLength(0);
    expect(createReview.mock.calls[0][0].body).toContain("### General");
  });

  it("re-anchors a line that drifted, rather than letting GitHub 422 the review", async () => {
    const { postReview } = await load();
    await postReview(request({ findings: [finding({ line: 7 })] }));
    expect(createReview.mock.calls[0][0].comments[0].line).toBe(5);
  });
});

describe("guards", () => {
  it("refuses an empty finding list", async () => {
    const { postReview } = await load();
    await expect(postReview(request({ findings: [] }))).rejects.toThrow(/nothing to post/);
    expect(createReview).not.toHaveBeenCalled();
  });

  it("refuses when the head moved since the review ran", async () => {
    getPullDetail.mockResolvedValue(pullDetail({ headSha: "9999999" }));
    const { postReview } = await load();
    await expect(postReview(request())).rejects.toMatchObject({ kind: "stale-head" });
    expect(createReview).not.toHaveBeenCalled();
  });

  it("refuses REQUEST_CHANGES on your own pull request before calling GitHub", async () => {
    getPullDetail.mockResolvedValue(pullDetail({ authoredByViewer: true }));
    const { postReview } = await load();
    await expect(
      postReview(request({ event: "REQUEST_CHANGES" })),
    ).rejects.toMatchObject({ kind: "own-pr" });
    expect(createReview).not.toHaveBeenCalled();
  });

  it("still allows commenting on your own pull request", async () => {
    getPullDetail.mockResolvedValue(pullDetail({ authoredByViewer: true }));
    const { postReview } = await load();
    await expect(postReview(request())).resolves.toMatchObject({ event: "COMMENT" });
  });

  it("re-validates findings the browser could have edited into an invalid state", async () => {
    const { postReview } = await load();
    // Promoted to blocking without a failure scenario — rejected here even
    // though the UI should have caught it.
    await expect(
      postReview(request({ findings: [finding({ failureScenario: undefined })] })),
    ).rejects.toMatchObject({ kind: "invalid" });
    expect(createReview).not.toHaveBeenCalled();
  });

  it("refuses a finding on a file that is not in the pull request", async () => {
    const { postReview } = await load();
    await expect(
      postReview(request({ findings: [finding({ file: "elsewhere.ts" })] })),
    ).rejects.toMatchObject({ kind: "invalid" });
    expect(createReview).not.toHaveBeenCalled();
  });

  it("validates the repo ref before anything else", async () => {
    const { postReview } = await load();
    await expect(postReview(request({ owner: "../evil" }))).rejects.toThrow(/Invalid owner/);
    expect(getPullDetail).not.toHaveBeenCalled();
  });
});

describe("GitHub failures", () => {
  const fail = (status: number, message: string) =>
    createReview.mockRejectedValue(Object.assign(new Error(message), { status }));

  it("explains a 422 in terms of the diff, not GitHub's wording", async () => {
    fail(422, "pull_request_review.comments[0].line is invalid");
    const { postReview } = await load();
    await expect(postReview(request())).rejects.toMatchObject({ kind: "github" });
    await expect(postReview(request())).rejects.toThrow(/not part of the diff/);
  });

  it("recognizes the own-PR 422 that slips past the pre-check", async () => {
    fail(422, "Can not request changes on your own pull request");
    const { postReview } = await load();
    await expect(
      postReview(request({ event: "REQUEST_CHANGES" })),
    ).rejects.toMatchObject({ kind: "own-pr" });
  });

  it("points at the missing token permission on a 403", async () => {
    fail(403, "Resource not accessible by integration");
    const { postReview } = await load();
    await expect(postReview(request())).rejects.toThrow(/Pull requests: write/);
  });

  it("passes other failures through", async () => {
    fail(500, "internal error");
    const { postReview } = await load();
    await expect(postReview(request())).rejects.toMatchObject({ kind: "github" });
  });
});
