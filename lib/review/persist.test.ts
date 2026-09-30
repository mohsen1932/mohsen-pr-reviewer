import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadState, saveState, storageKey } from "./persist";
import { initialReviewState, reviewReducer, type ReviewState } from "./reducer";
import type { Finding } from "../findings/schema";

const TARGET = { owner: "o", repo: "r", number: 7, headSha: "abc1234" };

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    size: () => map.size,
  };
}

const finding = (over: Partial<Finding> = {}): Finding =>
  ({
    id: "f1",
    file: "src/a.ts",
    line: 2,
    disposition: "blocking",
    category: "correctness",
    title: "Bug",
    body: "b",
    failureScenario: "inputs lead to a wrong result and it matters",
    confidence: "confirmed",
    status: "pending",
    edited: false,
    lineValid: true,
    snapped: false,
    origin: "agent",
    ...over,
  }) as Finding;

let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  storage = memoryStorage();
});

describe("storageKey", () => {
  it("includes the head sha, so a pushed-to PR starts clean", () => {
    const a = storageKey(TARGET);
    const b = storageKey({ ...TARGET, headSha: "def5678" });
    expect(a).not.toBe(b);
  });

  it("distinguishes pull requests in the same repo", () => {
    expect(storageKey(TARGET)).not.toBe(storageKey({ ...TARGET, number: 8 }));
  });
});

describe("round trip", () => {
  it("preserves findings, edits and triage status", () => {
    const state: ReviewState = {
      ...initialReviewState,
      status: "done",
      findings: [
        finding({ id: "a", status: "approved", edited: true, title: "I rewrote this" }),
        finding({ id: "b", status: "dismissed" }),
        finding({ id: "c", origin: "user", disposition: "nitpick" }),
      ],
    };

    saveState(storage, TARGET, state);
    const restored = loadState(storage, TARGET);

    expect(restored.findings).toHaveLength(3);
    expect(restored.findings[0]).toMatchObject({
      status: "approved",
      edited: true,
      title: "I rewrote this",
    });
    expect(restored.findings[1].status).toBe("dismissed");
    expect(restored.findings[2].origin).toBe("user");
  });

  it("preserves the run summary", () => {
    const state: ReviewState = {
      ...initialReviewState,
      status: "done",
      summary: {
        turns: 5,
        costUsd: 0.0071,
        durationMs: 40_000,
        findingCount: 1,
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 1, cacheHitRate: 0.8 },
      },
    };
    saveState(storage, TARGET, state);
    expect(loadState(storage, TARGET).summary).toMatchObject({ turns: 5, costUsd: 0.0071 });
  });

  it("does not persist a pending undo", () => {
    const state: ReviewState = {
      ...initialReviewState,
      status: "done",
      undo: { findings: [finding()], label: "Finding deleted" },
    };
    saveState(storage, TARGET, state);
    // A toast surviving a reload would let a deletion be reversed long after
    // it was decided.
    expect(loadState(storage, TARGET).undo).toBeUndefined();
  });

  it("survives a full triage sequence", () => {
    let state = reviewReducer(initialReviewState, { type: "start" });
    for (const f of [finding({ id: "a" }), finding({ id: "b" }), finding({ id: "c" })]) {
      state = reviewReducer(state, { type: "event", event: { type: "finding", finding: f } });
    }
    state = reviewReducer(state, { type: "setStatus", id: "a", status: "approved" });
    state = reviewReducer(state, { type: "setStatus", id: "b", status: "dismissed" });
    state = reviewReducer(state, { type: "delete", id: "c" });

    saveState(storage, TARGET, state);
    const restored = loadState(storage, TARGET);

    expect(restored.findings.map((f) => f.id)).toEqual(["a", "b"]);
    expect(restored.findings.map((f) => f.status)).toEqual(["approved", "dismissed"]);
  });
});

describe("resilience", () => {
  it("returns the initial state when nothing is stored", () => {
    expect(loadState(storage, TARGET)).toEqual(initialReviewState);
  });

  it("returns the initial state with no storage at all", () => {
    expect(loadState(undefined, TARGET)).toEqual(initialReviewState);
  });

  it("ignores corrupt JSON rather than throwing", () => {
    storage.setItem(storageKey(TARGET), "{not json");
    expect(loadState(storage, TARGET)).toEqual(initialReviewState);
  });

  it("ignores a shape from an older build", () => {
    storage.setItem(storageKey(TARGET), JSON.stringify({ something: "else" }));
    expect(loadState(storage, TARGET)).toEqual(initialReviewState);
  });

  it("does not persist an idle state, so a fresh page stays fresh", () => {
    saveState(storage, TARGET, initialReviewState);
    expect(storage.size()).toBe(0);
  });

  it("survives a storage that throws, as private mode does", () => {
    const hostile = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() => saveState(hostile, TARGET, { ...initialReviewState, status: "done" })).not.toThrow();
    expect(loadState(hostile, TARGET)).toEqual(initialReviewState);
  });

  it("does not read another pull request's review", () => {
    saveState(storage, TARGET, { ...initialReviewState, status: "done", findings: [finding()] });
    expect(loadState(storage, { ...TARGET, number: 99 }).findings).toEqual([]);
  });
});
