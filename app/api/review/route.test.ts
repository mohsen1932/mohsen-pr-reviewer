import { beforeEach, describe, expect, it, vi } from "vitest";

const getRepo = vi.fn();
const getPullDetail = vi.fn();
const reviewPullRequest = vi.fn();

vi.mock("@/lib/repos", () => ({ getRepo }));
vi.mock("@/lib/pulls", () => ({ getPullDetail }));
vi.mock("@/lib/review/engine", () => ({ reviewPullRequest }));

beforeEach(() => {
  vi.resetModules();
  getRepo.mockReset().mockResolvedValue({ sizeKb: 500 });
  getPullDetail.mockReset().mockResolvedValue({ number: 7, headSha: "abc", files: [] });
  reviewPullRequest.mockReset();
});

const post = (body: unknown) =>
  new Request("http://localhost/api/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const yields = (...events: unknown[]) =>
  reviewPullRequest.mockImplementation(async function* () {
    for (const e of events) yield e;
  });

async function readAll(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

describe("validation", () => {
  it.each([
    ["bad owner", { owner: "../x", repo: "r", number: 1 }],
    ["bad repo", { owner: "o", repo: "a/b", number: 1 }],
    ["zero pull number", { owner: "o", repo: "r", number: 0 }],
    ["missing fields", {}],
  ])("rejects %s with 400 and never starts a review", async (_label, body) => {
    const { POST } = await import("./route");
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(reviewPullRequest).not.toHaveBeenCalled();
  });

  it("rejects a malformed body", async () => {
    const { POST } = await import("./route");
    expect((await POST(post("not json"))).status).toBe(400);
  });
});

describe("streaming", () => {
  it("responds as an event stream that proxies may not buffer", async () => {
    yields({ type: "done", turns: 1, costUsd: 0, durationMs: 1, findingCount: 0, usage: {} });
    const { POST } = await import("./route");
    const res = await POST(post({ owner: "o", repo: "r", number: 7 }));
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-transform");
  });

  it("writes one frame per event, in order", async () => {
    yields(
      { type: "status", phase: "cloning" },
      { type: "finding", finding: { id: "f1" } },
      { type: "done", turns: 2, costUsd: 0.01, durationMs: 5, findingCount: 1, usage: {} },
    );
    const { POST } = await import("./route");
    const body = await readAll(await POST(post({ owner: "o", repo: "r", number: 7 })));
    expect(body.indexOf("event: status")).toBeLessThan(body.indexOf("event: finding"));
    expect(body.indexOf("event: finding")).toBeLessThan(body.indexOf("event: done"));
  });

  it("passes the repo size through so the clone guard can fire", async () => {
    yields({ type: "done", turns: 1, costUsd: 0, durationMs: 1, findingCount: 0, usage: {} });
    const { POST } = await import("./route");
    await readAll(await POST(post({ owner: "o", repo: "r", number: 7 })));
    expect(reviewPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "o", repo: "r", sizeKb: 500 }),
    );
  });

  it("turns a mid-stream failure into an error frame rather than a dead stream", async () => {
    reviewPullRequest.mockImplementation(async function* () {
      yield { type: "status", phase: "cloning" };
      throw new Error("clone failed");
    });
    const { POST } = await import("./route");
    const body = await readAll(await POST(post({ owner: "o", repo: "r", number: 7 })));
    expect(body).toContain("event: error");
    expect(body).toContain("clone failed");
  });

  it("reports a GitHub failure as an error frame", async () => {
    getPullDetail.mockRejectedValue(new Error("Not Found"));
    const { POST } = await import("./route");
    const body = await readAll(await POST(post({ owner: "o", repo: "r", number: 7 })));
    expect(body).toContain("event: error");
    expect(reviewPullRequest).not.toHaveBeenCalled();
  });

  it("never leaks a credential into an error frame", async () => {
    getPullDetail.mockRejectedValue(new Error("failed with github_pat_11ABCDE0123456789abcdefgh"));
    const { POST } = await import("./route");
    const body = await readAll(await POST(post({ owner: "o", repo: "r", number: 7 })));
    expect(body).not.toContain("github_pat_");
  });
});
