"use client";

import { useEffect } from "react";

/** Delete is the only destructive action, so it is the only one with an undo. */
export const UNDO_MS = 10_000;

export default function UndoToast({
  label,
  onUndo,
  onExpire,
}: {
  label: string;
  onUndo: () => void;
  onExpire: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onExpire, UNDO_MS);
    return () => clearTimeout(timer);
    // A new label means a new deletion, so the countdown restarts.
  }, [label, onExpire]);

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-6 z-20 mx-auto flex w-fit items-center gap-4 rounded-lg border border-line-strong bg-raised px-4 py-2.5 text-[13px] shadow-lg"
    >
      <span className="text-ink-muted">{label}</span>
      <button
        type="button"
        onClick={onUndo}
        className="font-medium text-accent hover:underline"
      >
        Undo
      </button>
    </div>
  );
}
