import type { Finding } from "../findings/schema";
import type { ReviewEvent, ReviewUsage } from "./engine";

/**
 * Review panel state. SPEC.md §10.
 *
 * Lives in lib/ rather than inside the component so the transitions can be
 * tested directly — the panel is the part most likely to be refactored, and
 * these rules are what must survive it (§16).
 */

export type ReviewStatus = "idle" | "running" | "done" | "failed";

export type ReviewSummary = {
  turns: number;
  costUsd: number | null;
  durationMs: number;
  findingCount: number;
  usage: ReviewUsage;
};

export type ReviewState = {
  status: ReviewStatus;
  /** Current activity, for the progress line. */
  phase?: string;
  detail?: string;
  findings: Finding[];
  /** Assistant prose. Kept, but secondary to the findings. */
  notes: string[];
  /** Most recent tool calls, newest last. */
  activity: { name: string; summary: string }[];
  error?: string;
  /** True when the run ended early but findings are still worth showing. */
  partial: boolean;
  summary?: ReviewSummary;
};

export type ReviewAction =
  | { type: "start" }
  | { type: "reset" }
  | { type: "disconnected" }
  | { type: "event"; event: ReviewEvent };

export const initialReviewState: ReviewState = {
  status: "idle",
  findings: [],
  notes: [],
  activity: [],
  partial: false,
};

/** Bounded so a long run cannot grow the panel without limit. */
const MAX_ACTIVITY = 12;

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case "reset":
      return initialReviewState;

    case "start":
      return { ...initialReviewState, status: "running", phase: "starting" };

    case "disconnected":
      // Only meaningful mid-run: a drop after completion changes nothing.
      return state.status === "running"
        ? {
            ...state,
            status: "failed",
            partial: state.findings.length > 0,
            error: "Connection to the review lost. Findings received so far are kept.",
          }
        : state;

    case "event":
      return applyEvent(state, action.event);
  }
}

function applyEvent(state: ReviewState, event: ReviewEvent): ReviewState {
  switch (event.type) {
    case "status":
      return { ...state, status: "running", phase: event.phase, detail: event.detail };

    case "tool":
      return {
        ...state,
        status: "running",
        phase: event.name,
        detail: event.summary,
        activity: [...state.activity, { name: event.name, summary: event.summary }].slice(
          -MAX_ACTIVITY,
        ),
      };

    case "message":
      return { ...state, notes: [...state.notes, event.text] };

    case "finding":
      // Findings arrive as they are discovered; duplicates would mean a retry
      // was double-counted.
      return state.findings.some((f) => f.id === event.finding.id)
        ? state
        : { ...state, findings: [...state.findings, event.finding] };

    case "done":
      return {
        ...state,
        status: "done",
        phase: undefined,
        detail: undefined,
        summary: {
          turns: event.turns,
          costUsd: event.costUsd,
          durationMs: event.durationMs,
          findingCount: event.findingCount,
          usage: event.usage,
        },
      };

    case "error":
      return {
        ...state,
        status: "failed",
        phase: undefined,
        detail: undefined,
        error: event.message,
        partial: event.partial === true,
      };
  }
}

/** Findings are worth showing whenever any arrived, even on a failed run. */
export function hasResults(state: ReviewState): boolean {
  return state.findings.length > 0;
}
