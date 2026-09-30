import { initialReviewState, type ReviewState } from "./reducer";

/**
 * Session persistence for a review. SPEC.md §3, §13.
 *
 * A review costs real money and there is no database behind it, so a refresh
 * mid-triage must not discard one. Kept out of the hook so the round-trip —
 * including edits and triage state — can be tested directly.
 */

export type PersistTarget = {
  owner: string;
  repo: string;
  number: number;
  headSha: string;
};

/**
 * Keyed by head sha: a review of an older commit is not a review of this one,
 * so a pushed-to PR starts clean rather than showing stale findings.
 */
export function storageKey(t: PersistTarget): string {
  return `review:${t.owner}/${t.repo}#${t.number}@${t.headSha}`;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function loadState(storage: StorageLike | undefined, target: PersistTarget): ReviewState {
  if (!storage) return initialReviewState;
  try {
    const raw = storage.getItem(storageKey(target));
    if (!raw) return initialReviewState;
    const parsed = JSON.parse(raw) as unknown;
    return isReviewState(parsed) ? parsed : initialReviewState;
  } catch {
    // Private mode, cleared storage, or a shape from an older build.
    return initialReviewState;
  }
}

export function saveState(
  storage: StorageLike | undefined,
  target: PersistTarget,
  state: ReviewState,
): void {
  if (!storage || state.status === "idle") return;
  try {
    // The undo offer is deliberately not persisted: a toast that survives a
    // reload would let a deletion be reversed long after it was decided.
    const { undo: _undo, ...persisted } = state;
    storage.setItem(storageKey(target), JSON.stringify(persisted));
  } catch {
    // Storage is a convenience here, never the source of truth.
  }
}

function isReviewState(value: unknown): value is ReviewState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ReviewState>;
  return (
    typeof candidate.status === "string" &&
    Array.isArray(candidate.findings) &&
    Array.isArray(candidate.notes)
  );
}
