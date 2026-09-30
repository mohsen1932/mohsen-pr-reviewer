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

describe("triage", () => {
  const withFindings = (...fs: Finding[]): ReviewState =>
    run([{ type: "start" }, ...fs.map((x) => ev({ type: "finding", finding: x }))]);

  it("approves and un-approves a finding", () => {
    const state = withFindings(finding({ id: "a" }));
    const approved = reviewReducer(state, { type: "setStatus", id: "a", status: "approved" });
    expect(approved.findings[0].status).toBe("approved");
    const back = reviewReducer(approved, { type: "setStatus", id: "a", status: "pending" });
    expect(back.findings[0].status).toBe("pending");
  });

  it("dismissing keeps the finding, so it can be restored", () => {
    const state = withFindings(finding({ id: "a" }));
    const after = reviewReducer(state, { type: "setStatus", id: "a", status: "dismissed" });
    expect(after.findings).toHaveLength(1);
    expect(after.findings[0].status).toBe("dismissed");
  });

  it("leaves other findings alone", () => {
    const state = withFindings(finding({ id: "a" }), finding({ id: "b" }));
    const after = reviewReducer(state, { type: "setStatus", id: "a", status: "approved" });
    expect(after.findings.find((f) => f.id === "b")!.status).toBe("pending");
  });

  it("replaces an edited finding in place", () => {
    const state = withFindings(finding({ id: "a", title: "old" }));
    const edited = { ...state.findings[0], title: "new", edited: true };
    const after = reviewReducer(state, { type: "replace", finding: edited });
    expect(after.findings[0]).toMatchObject({ title: "new", edited: true });
  });

  it("adds a user-authored finding", () => {
    const state = withFindings(finding({ id: "a" }));
    const mine = finding({ id: "mine", origin: "user" });
    const after = reviewReducer(state, { type: "add", finding: mine });
    expect(after.findings.map((f) => f.id)).toEqual(["a", "mine"]);
  });
});

describe("delete and undo", () => {
  const withFindings = (...fs: Finding[]): ReviewState =>
    run([{ type: "start" }, ...fs.map((x) => ev({ type: "finding", finding: x }))]);

  it("removes the finding and offers an undo", () => {
    const state = withFindings(finding({ id: "a" }), finding({ id: "b" }));
    const after = reviewReducer(state, { type: "delete", id: "a" });
    expect(after.findings.map((f) => f.id)).toEqual(["b"]);
    expect(after.undo).toMatchObject({ label: "Finding deleted" });
  });

  it("undo restores exactly what was deleted", () => {
    const original = finding({ id: "a", title: "keep me", status: "approved" });
    const deleted = reviewReducer(withFindings(original), { type: "delete", id: "a" });
    const restored = reviewReducer(deleted, { type: "undo" });
    expect(restored.findings).toHaveLength(1);
    expect(restored.findings[0]).toEqual(original);
    expect(restored.undo).toBeUndefined();
  });

  it("undo with nothing pending changes nothing", () => {
    const state = withFindings(finding({ id: "a" }));
    expect(reviewReducer(state, { type: "undo" })).toBe(state);
  });

  it("deleting a missing id changes nothing", () => {
    const state = withFindings(finding({ id: "a" }));
    expect(reviewReducer(state, { type: "delete", id: "nope" })).toBe(state);
  });

  it("clearUndo drops the offer once it expires", () => {
    const deleted = reviewReducer(withFindings(finding({ id: "a" })), { type: "delete", id: "a" });
    const cleared = reviewReducer(deleted, { type: "clearUndo" });
    expect(cleared.undo).toBeUndefined();
    // The finding stays gone — the toast expiring is not a second chance.
    expect(cleared.findings).toHaveLength(0);
  });
});

describe("bulk actions", () => {
  const state = () =>
    run([
      { type: "start" },
      ev({ type: "finding", finding: finding({ id: "b1", disposition: "blocking", file: "a.ts" }) }),
      ev({ type: "finding", finding: finding({ id: "n1", disposition: "nitpick", file: "a.ts" }) }),
      ev({ type: "finding", finding: finding({ id: "n2", disposition: "nitpick", file: "b.ts" }) }),
    ]);

  it("approves every blocking finding", () => {
    const after = reviewReducer(state(), {
      type: "bulk",
      scope: { kind: "disposition", disposition: "blocking" },
      action: "approve",
    });
    expect(after.findings.find((f) => f.id === "b1")!.status).toBe("approved");
    expect(after.findings.find((f) => f.id === "n1")!.status).toBe("pending");
  });

  it("dismisses every finding in one file", () => {
    const after = reviewReducer(state(), {
      type: "bulk",
      scope: { kind: "file", file: "a.ts" },
      action: "dismiss",
    });
    expect(after.findings.filter((f) => f.status === "dismissed").map((f) => f.id)).toEqual([
      "b1",
      "n1",
    ]);
  });

  it("deletes every nitpick, with one undo for the batch", () => {
    const after = reviewReducer(state(), {
      type: "bulk",
      scope: { kind: "disposition", disposition: "nitpick" },
      action: "delete",
    });
    expect(after.findings.map((f) => f.id)).toEqual(["b1"]);
    expect(after.undo!.findings).toHaveLength(2);
    expect(after.undo!.label).toBe("2 findings deleted");
  });

  it("undo restores a whole batch", () => {
    const deleted = reviewReducer(state(), {
      type: "bulk",
      scope: { kind: "disposition", disposition: "nitpick" },
      action: "delete",
    });
    expect(reviewReducer(deleted, { type: "undo" }).findings).toHaveLength(3);
  });

  it("a bulk delete matching nothing changes nothing", () => {
    const s = state();
    expect(
      reviewReducer(s, {
        type: "bulk",
        scope: { kind: "file", file: "missing.ts" },
        action: "delete",
      }),
    ).toBe(s);
  });

  it("scope 'all' covers everything", () => {
    const after = reviewReducer(state(), {
      type: "bulk",
      scope: { kind: "all" },
      action: "approve",
    });
    expect(after.findings.every((f) => f.status === "approved")).toBe(true);
  });
});

describe("selectors", () => {
  const state = () =>
    run([
      { type: "start" },
      ev({ type: "finding", finding: finding({ id: "p" }) }),
      ev({ type: "finding", finding: finding({ id: "a", status: "approved" }) }),
      ev({ type: "finding", finding: finding({ id: "d", status: "dismissed" }) }),
    ]);

  it("splits visible from dismissed", async () => {
    const { visibleFindings, dismissedFindings, approvedFindings } = await import("./reducer");
    expect(visibleFindings(state()).map((f) => f.id)).toEqual(["p", "a"]);
    expect(dismissedFindings(state()).map((f) => f.id)).toEqual(["d"]);
    expect(approvedFindings(state()).map((f) => f.id)).toEqual(["a"]);
  });
});
