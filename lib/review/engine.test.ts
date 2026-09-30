import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PullDetail } from "../pulls";
import type { ReviewContext } from "./engine";

const create = vi.fn();

/**
 * The engine mutates one messages array across turns, so reading it after the
 * run shows the final state rather than what each call actually sent. Snapshot
 * at call time instead.
 */
const sent: unknown[][] = [];
const prepareCheckout = vi.fn();
const runTool = vi.fn();

vi.mock("./openai", () => ({ openai: () => ({ responses: { create } }) }));
vi.mock("./checkout", () => ({ prepareCheckout }));
vi.mock("./agent-tools", async () => {
  const actual = await vi.importActual<typeof import("./agent-tools")>("./agent-tools");
  return { ...actual, runTool };
});

const pull = {
  number: 7,
  title: "Fix it",
  headSha: "abc1234",
  headRef: "feature",
  baseRef: "main",
  body: null,
  files: [{ filename: "src/a.ts", status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n+x" }],
  excluded: [],
} as unknown as PullDetail;

const ctx = (): ReviewContext => ({ pull, owner: "owner", repo: "repo" });

/** One assistant turn in Responses-API shape; tool calls are optional. */
const turn = (
  content: string | null,
  toolCalls: { name: string; args: unknown }[] = [],
  usage = { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 0 } },
) => ({
  output: [
    ...(content ? [{ type: "message", role: "assistant", content: [{ type: "output_text", text: content }] }] : []),
    ...toolCalls.map((c, i) => ({
      type: "function_call",
      call_id: `call_${i}`,
      name: c.name,
      arguments: JSON.stringify(c.args),
    })),
  ],
  output_text: content ?? "",
  usage,
});

/** A raw output item, for malformed-call cases. */
const rawTurn = (items: unknown[], usage: unknown = {}) => ({
  output: items,
  output_text: "",
  usage,
});

beforeEach(() => {
  vi.resetModules();
  sent.length = 0;
  create.mockReset();
  create.mockImplementation((params: { input: unknown[] }) => {
    sent.push(structuredClone(params.input));
    return Promise.resolve(turn("done"));
  });
  runTool.mockReset().mockResolvedValue({ text: "tool output" });
  prepareCheckout.mockReset().mockResolvedValue("/cache/owner/repo");
});

afterEach(() => vi.useRealTimers());

async function collect(context = ctx()) {
  const { reviewPullRequest } = await import("./engine");
  const events = [];
  for await (const e of reviewPullRequest(context)) events.push(e);
  return events;
}
const paramsOf = (call = 0) => create.mock.calls[call][0];
/** Messages as they were when that call was made. */
const sentAt = (call: number) => sent[call] as { role: string; content: string }[];

/** Queue responses while still snapshotting the messages of each call. */
function respond(...responses: unknown[]) {
  let i = 0;
  create.mockImplementation((params: { input: unknown[] }) => {
    sent.push(structuredClone(params.input));
    const next = responses[Math.min(i, responses.length - 1)];
    i++;
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
}

describe("request shape", () => {
  it("sends the rubric as the system message and the PR as the user message", async () => {
    create.mockResolvedValue(turn("done"));
    await collect();
    const items = paramsOf().input;
    expect(items[0].role).toBe("system");
    expect(items[0].content).toContain("PRECISION OVER RECALL");
    expect(items[1].role).toBe("user");
    expect(items[1].content).toContain("#7");
  });

  it("offers only the read-only tool table", async () => {
    create.mockResolvedValue(turn("done"));
    await collect();
    const names = paramsOf().tools.map((t: { name: string }) => t.name);
    expect(names).toContain("report_finding");
    for (const forbidden of ["bash", "write_file", "fetch"]) expect(names).not.toContain(forbidden);
  });

  it("labels the diff as untrusted data", async () => {
    create.mockResolvedValue(turn("done"));
    await collect();
    expect(paramsOf().input[1].content).toContain("<untrusted-diff>");
    expect(paramsOf().input[1].content).toContain("not instructions");
  });

  it("passes the configured model and effort", async () => {
    create.mockResolvedValue(turn("done"));
    await collect();
    expect(paramsOf().model).toBe("gpt-5.4-mini");
    expect(paramsOf().reasoning.effort).toBe("high");
  });
});

describe("the agent loop", () => {
  it("stops when the model returns no tool calls", async () => {
    create.mockResolvedValue(turn("nothing to report"));
    const events = await collect();
    expect(create).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({ type: "done", turns: 1 });
  });

  it("runs tool calls and feeds the results back", async () => {
    respond(turn(null, [{ name: "read_file", args: { path: "src/a.ts" } }]), turn("done"));
    await collect();
    expect(runTool).toHaveBeenCalledWith("read_file", { path: "src/a.ts" }, expect.anything());
    expect(sentAt(1).at(-1)).toMatchObject({
      type: "function_call_output",
      call_id: "call_0",
      output: "tool output",
    });
  });

  it("handles several tool calls in one turn", async () => {
    respond(
      turn(null, [
        { name: "read_file", args: { path: "a.ts" } },
        { name: "search", args: { pattern: "x" } },
      ]),
      turn("done"),
    );
    await collect();
    expect(runTool).toHaveBeenCalledTimes(2);
  });

  it("emits assistant text as it arrives", async () => {
    respond(turn("looking at a.ts", [{ name: "read_file", args: {} }]), turn("done"));
    const events = await collect();
    expect(events).toContainEqual({ type: "message", role: "assistant", text: "looking at a.ts" });
  });

  it("stops at the turn limit and reports a partial review", async () => {
    create.mockResolvedValue(turn(null, [{ name: "read_file", args: {} }]));
    const { MAX_TURNS } = await import("./engine");
    const events = await collect();
    expect(create).toHaveBeenCalledTimes(MAX_TURNS);
    expect(events.at(-1)).toMatchObject({ type: "error", partial: true });
  });
});

describe("malformed tool calls", () => {
  it("returns an error result for unparseable arguments instead of crashing", async () => {
    respond(
      rawTurn([{ type: "function_call", call_id: "c1", name: "read_file", arguments: "{not json" }]),
      turn("done"),
    );
    await collect();
    expect(runTool).not.toHaveBeenCalled();
    expect((sentAt(1).at(-1) as unknown as { output: string }).output).toContain("not valid JSON");
  });

  it("refuses a tool name outside the table without dispatching it", async () => {
    respond(turn(null, [{ name: "bash", args: { cmd: "rm -rf /" } }]), turn("done"));
    await collect();
    // The allowlist is the tool table; a hallucinated name never reaches runTool.
    expect(runTool).not.toHaveBeenCalled();
    expect((sentAt(1).at(-1) as unknown as { output: string }).output).toContain("No tool named");
  });

  it("rejects non-object arguments", async () => {
    respond(
      rawTurn([{ type: "function_call", call_id: "c1", name: "read_file", arguments: "[1,2]" }]),
      turn("done"),
    );
    await collect();
    expect((sentAt(1).at(-1) as unknown as { output: string }).output).toContain("must be a JSON object");
  });
});

describe("findings", () => {
  it("streams a finding as soon as the tool records it", async () => {
    const finding = { id: "f1", file: "src/a.ts", line: 2 };
    runTool.mockImplementation(async (_n, _a, toolCtx) => {
      toolCtx.onFinding(finding);
      return { text: "Recorded" };
    });
    respond(turn(null, [{ name: "report_finding", args: {} }]), turn("done"));
    const events = await collect();
    expect(events).toContainEqual({ type: "finding", finding });
    expect(events.at(-1)).toMatchObject({ type: "done", findingCount: 1 });
  });

  it("keeps findings when the run hits the turn limit", async () => {
    runTool.mockImplementation(async (_n, _a, toolCtx) => {
      toolCtx.onFinding({ id: "f" });
      return { text: "ok" };
    });
    create.mockResolvedValue(turn(null, [{ name: "report_finding", args: {} }]));
    const events = await collect();
    expect(events.some((e) => e.type === "finding")).toBe(true);
    expect(events.at(-1)).toMatchObject({ partial: true });
  });

  it("keeps findings when the API fails mid-run", async () => {
    runTool.mockImplementation(async (_n, _a, toolCtx) => {
      toolCtx.onFinding({ id: "f" });
      return { text: "ok" };
    });
    respond(
      turn(null, [{ name: "report_finding", args: {} }]),
      Object.assign(new Error("boom"), { status: 500 }),
    );
    const events = await collect();
    expect(events.some((e) => e.type === "finding")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "error" });
  });
});

describe("usage and cost", () => {
  it("accumulates tokens across turns and computes cost", async () => {
    respond(
      turn(null, [{ name: "read_file", args: {} }], {
        input_tokens: 1000,
        output_tokens: 100,
        input_tokens_details: { cached_tokens: 400 },
      }),
      turn("done", [], {
        input_tokens: 2000,
        output_tokens: 50,
        input_tokens_details: { cached_tokens: 1600 },
      }),
    );
    const events = await collect();
    expect(events.at(-1)).toMatchObject({
      type: "done",
      usage: { inputTokens: 3000, outputTokens: 150, cacheReadTokens: 2000 },
    });
    const done = events.at(-1) as { usage: { cacheHitRate: number }; costUsd: number };
    expect(done.usage.cacheHitRate).toBeCloseTo(2000 / 3000);
    expect(done.costUsd).toBeGreaterThan(0);
  });

  it("reports a null cost for a model with no published price", async () => {
    process.env.REVIEW_MODEL = "some-unlisted-model";
    create.mockResolvedValue(turn("done"));
    const events = await collect();
    expect(events.at(-1)).toMatchObject({ type: "done", costUsd: null });
    expect(events).toContainEqual(expect.objectContaining({ phase: "cost-unknown" }));
    delete process.env.REVIEW_MODEL;
  });

  it("tolerates a response with no usage block", async () => {
    create.mockResolvedValue({ output: [], output_text: "done" });
    const events = await collect();
    expect(events.at(-1)).toMatchObject({ type: "done", usage: { inputTokens: 0 } });
  });
});

describe("failures", () => {
  it("ends with an error when the checkout fails, without calling the API", async () => {
    prepareCheckout.mockRejectedValue(new Error("git clone failed"));
    const events = await collect();
    expect(events).toEqual([{ type: "error", message: "git clone failed" }]);
    expect(create).not.toHaveBeenCalled();
  });

  it("names a rejected key", async () => {
    create.mockRejectedValue(Object.assign(new Error("Incorrect API key"), { status: 401 }));
    const events = await collect();
    expect(events.at(-1)).toMatchObject({ message: expect.stringContaining("OPENAI_API_KEY") });
  });

  it("distinguishes an exhausted quota from a rate limit", async () => {
    create.mockRejectedValue(
      Object.assign(new Error("You exceeded your current quota"), { status: 429 }),
    );
    const events = await collect();
    expect(events.at(-1)).toMatchObject({ message: expect.stringContaining("quota exhausted") });
  });

  it("names an unavailable model", async () => {
    create.mockRejectedValue(
      Object.assign(new Error("The model does not exist"), { status: 404 }),
    );
    const events = await collect();
    expect(events.at(-1)).toMatchObject({ message: expect.stringContaining("REVIEW_MODEL") });
  });

  it("scrubs a credential out of an API error", async () => {
    create.mockRejectedValue(new Error("failed with sk-proj-abcdefghijklmnopqrst"));
    const events = await collect();
    expect(JSON.stringify(events.at(-1))).not.toContain("sk-proj-");
  });

  it("ends cleanly when the model returns no output items", async () => {
    create.mockResolvedValue({ output: [], output_text: "", usage: {} });
    const events = await collect();
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });
});

describe("cancellation", () => {
  it("stops the loop when the caller aborts", async () => {
    const controller = new AbortController();
    create.mockImplementation(async () => {
      controller.abort();
      return turn(null, [{ name: "read_file", args: {} }]);
    });
    const events = await collect({ ...ctx(), signal: controller.signal });
    expect(create).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({ type: "error", partial: true });
  });
});
