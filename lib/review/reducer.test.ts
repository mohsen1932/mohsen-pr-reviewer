import { describe, expect, it } from "vitest";
import {
  initialReviewState,
  reviewReducer,
  type ReviewAction,
  type ReviewState,
} from "./reducer";
import type { Finding } from "../findings/schema";

const finding = (over: Partial<Finding> = {}): Finding =>
  ({
    id: "f1",
    file: "src/a.ts",
    line: 2,
    disposition: "blocking",
    category: "correctness",
    title: "Bug",
    body: "b",
    confidence: "confirmed",
    status: "pending",
    edited: false,
    lineValid: true,
    snapped: false,
    origin: "agent",
    ...over,
  }) as Finding;

const run = (actions: ReviewAction[], from: ReviewState = initialReviewState) =>
  actions.reduce(reviewReducer, from);

const ev = (event: unknown): ReviewAction => ({ type: "event", event: event as never });

const USAGE = { inputTokens: 100, outputTokens: 10, cacheReadTokens: 50, cacheHitRate: 0.5 };
const DONE = {
  type: "done",
  turns: 3,
  costUsd: 0.02,
  durationMs: 1000,
  findingCount: 1,
  usage: USAGE,
};

describe("lifecycle", () => {
  it("starts idle", () => {
    expect(initialReviewState).toMatchObject({ status: "idle", findings: [], partial: false });
  });

  it("start clears any previous run", () => {
    const after = run([ev({ type: "finding", finding: finding() }), { type: "start" }]);
    expect(after).toMatchObject({ status: "running", findings: [] });
  });

  it("reset returns to idle", () => {
    expect(run([{ type: "start" }, { type: "reset" }])).toEqual(initialReviewState);
  });

  it("done records the summary and clears the progress line", () => {
    const after = run([{ type: "start" }, ev(DONE)]);
    expect(after).toMatchObject({
      status: "done",
      phase: undefined,
      summary: { turns: 3, costUsd: 0.02, findingCount: 1 },
    });
  });

  it("carries a null cost through rather than coercing it to zero", () => {
    const after = run([{ type: "start" }, ev({ ...DONE, costUsd: null })]);
    expect(after.summary?.costUsd).toBeNull();
  });
});

describe("findings", () => {
  it("appends findings in arrival order", () => {
    const after = run([
      { type: "start" },
      ev({ type: "finding", finding: finding({ id: "a" }) }),
      ev({ type: "finding", finding: finding({ id: "b" }) }),
    ]);
    expect(after.findings.map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("ignores a duplicate id, so a retry cannot double-count", () => {
    const after = run([
      { type: "start" },
      ev({ type: "finding", finding: finding({ id: "a" }) }),
      ev({ type: "finding", finding: finding({ id: "a", title: "changed" }) }),
    ]);
    expect(after.findings).toHaveLength(1);
    expect(after.findings[0].title).toBe("Bug");
  });
});

describe("progress", () => {
  it("status events drive the progress line", () => {
    const after = run([{ type: "start" }, ev({ type: "status", phase: "cloning", detail: "o/r" })]);
    expect(after).toMatchObject({ status: "running", phase: "cloning", detail: "o/r" });
  });

  it("tool events also record recent activity", () => {
    const after = run([
      { type: "start" },
      ev({ type: "tool", name: "read_file", summary: "a.ts" }),
    ]);
    expect(after.phase).toBe("read_file");
    expect(after.activity).toEqual([{ name: "read_file", summary: "a.ts" }]);
  });

  it("bounds the activity list so a long run cannot grow it without limit", () => {
    const actions: ReviewAction[] = [{ type: "start" }];
    for (let i = 0; i < 50; i++) {
      actions.push(ev({ type: "tool", name: `t${i}`, summary: "" }));
    }
    const after = run(actions);
    expect(after.activity.length).toBeLessThanOrEqual(12);
    // The newest calls are the ones kept.
    expect(after.activity.at(-1)!.name).toBe("t49");
  });

  it("collects assistant notes", () => {
    const after = run([{ type: "start" }, ev({ type: "message", role: "assistant", text: "hi" })]);
    expect(after.notes).toEqual(["hi"]);
  });
});

describe("failures", () => {
  it("an error ends the run", () => {
    const after = run([{ type: "start" }, ev({ type: "error", message: "boom" })]);
    expect(after).toMatchObject({ status: "failed", error: "boom", partial: false });
  });

  it("a partial error keeps the findings and says so", () => {
    const after = run([
      { type: "start" },
      ev({ type: "finding", finding: finding() }),
      ev({ type: "error", message: "turn limit", partial: true }),
    ]);
    expect(after).toMatchObject({ status: "failed", partial: true });
    expect(after.findings).toHaveLength(1);
  });

  it("a dropped connection mid-run is partial when findings arrived", () => {
    const after = run([
      { type: "start" },
      ev({ type: "finding", finding: finding() }),
      { type: "disconnected" },
    ]);
    expect(after).toMatchObject({ status: "failed", partial: true });
    expect(after.error).toContain("kept");
  });

  it("a dropped connection with no findings is not partial", () => {
    const after = run([{ type: "start" }, { type: "disconnected" }]);
    expect(after).toMatchObject({ status: "failed", partial: false });
  });

  it("a disconnect after a completed run changes nothing", () => {
    const done = run([{ type: "start" }, ev(DONE)]);
    expect(reviewReducer(done, { type: "disconnected" })).toBe(done);
  });

  it("a disconnect while idle changes nothing", () => {
    expect(reviewReducer(initialReviewState, { type: "disconnected" })).toBe(initialReviewState);
  });
});

describe("immutability", () => {
  it("never mutates the previous state", () => {
    const before = run([{ type: "start" }, ev({ type: "finding", finding: finding() })]);
    const snapshot = JSON.stringify(before);
    reviewReducer(before, ev({ type: "finding", finding: finding({ id: "b" }) }));
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
