"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  initialReviewState,
  reviewReducer,
  type BulkScope,
  type ReviewState,
} from "@/lib/review/reducer";
import { applyEdit, createUserFinding, type EditableFields } from "@/lib/findings/edit";
import type { AnchorTarget } from "@/lib/review/anchor";
import type { FindingStatus } from "@/lib/findings/schema";
import { EventStreamParser } from "@/lib/review/stream";
import { loadState, saveState } from "@/lib/review/persist";

/**
 * Drives a review and turns its SSE frames into reducer actions.
 *
 * State is mirrored to sessionStorage so a refresh mid-triage does not discard
 * a review that cost real money (SPEC.md §3, §13).
 */

type Target = { owner: string; repo: string; number: number; headSha: string };

/** Ids for user-authored findings; crypto.randomUUID is not in every browser. */
function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useReviewStream(target: Target, files: AnchorTarget[]) {
  const [state, dispatch] = useReducer(reviewReducer, target, (t) =>
    loadState(typeof window === "undefined" ? undefined : window.sessionStorage, t),
  );
  const abortRef = useRef<AbortController | null>(null);
  // Read inside stable callbacks, so editing does not re-create them per keystroke.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    saveState(window.sessionStorage, target, state);
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

  const setStatus = useCallback(
    (id: string, status: FindingStatus) => dispatch({ type: "setStatus", id, status }),
    [],
  );

  const remove = useCallback((id: string) => dispatch({ type: "delete", id }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const clearUndo = useCallback(() => dispatch({ type: "clearUndo" }), []);

  const bulk = useCallback(
    (scope: BulkScope, action: "approve" | "dismiss" | "delete") =>
      dispatch({ type: "bulk", scope, action }),
    [],
  );

  /** Returns a message when the edit is rejected, so the form can show it. */
  const edit = useCallback(
    (id: string, changes: Partial<EditableFields>): string | undefined => {
      const finding = stateRef.current.findings.find((f) => f.id === id);
      if (!finding) return "That finding no longer exists.";
      const result = applyEdit(finding, changes, files);
      if (!result.ok) return result.message;
      dispatch({ type: "replace", finding: result.finding });
      return undefined;
    },
    [files],
  );

  const add = useCallback(
    (draft: EditableFields & { file: string }): string | undefined => {
      const result = createUserFinding(draft, files, newId());
      if (!result.ok) return result.message;
      dispatch({ type: "add", finding: result.finding });
      return undefined;
    },
    [files],
  );

  return { state, start, cancel, reset, setStatus, remove, undo, clearUndo, bulk, edit, add };
}
