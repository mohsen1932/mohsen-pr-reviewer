"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  initialReviewState,
  reviewReducer,
  type ReviewState,
} from "@/lib/review/reducer";
import { EventStreamParser } from "@/lib/review/stream";

/**
 * Drives a review and turns its SSE frames into reducer actions.
 *
 * State is mirrored to sessionStorage so a refresh mid-triage does not discard
 * a review that cost real money (SPEC.md §3, §13).
 */

type Target = { owner: string; repo: string; number: number; headSha: string };

const storageKey = (t: Target) =>
  `review:${t.owner}/${t.repo}#${t.number}@${t.headSha}`;

function restore(target: Target): ReviewState {
  if (typeof window === "undefined") return initialReviewState;
  try {
    const raw = window.sessionStorage.getItem(storageKey(target));
    return raw ? (JSON.parse(raw) as ReviewState) : initialReviewState;
  } catch {
    // Private mode, cleared storage, or a shape from an older build.
    return initialReviewState;
  }
}

export function useReviewStream(target: Target) {
  const [state, dispatch] = useReducer(reviewReducer, target, restore);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (state.status === "idle") return;
    try {
      window.sessionStorage.setItem(storageKey(target), JSON.stringify(state));
    } catch {
      // Storage is a convenience here, never the source of truth.
    }
  }, [state, target]);

  // A run belongs to the mounted panel; leaving the page cancels it server-side.
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: "start" });

    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          owner: target.owner,
          repo: target.repo,
          number: target.number,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => null);
        dispatch({
          type: "event",
          event: {
            type: "error",
            message: detail?.error ?? `The review could not be started (${response.status}).`,
          },
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = new EventStreamParser();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const event of parser.push(decoder.decode(value, { stream: true }))) {
          dispatch({ type: "event", event });
        }
      }

      dispatch({ type: "disconnected" });
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      dispatch({ type: "disconnected" });
    }
  }, [target.owner, target.repo, target.number]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  return { state, start, cancel, reset };
}
