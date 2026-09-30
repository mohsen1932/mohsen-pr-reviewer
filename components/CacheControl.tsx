"use client";

import { useState } from "react";
import { formatBytes } from "@/lib/format";

/**
 * The checkout cache holds private source in plaintext and grows with every
 * repository reviewed (SPEC.md §12), so its size is visible and clearable here
 * rather than only from a terminal.
 *
 * The initial size comes from the server, so there is no fetch on page load —
 * only the clear action talks to the API.
 */
export default function CacheControl({ initialBytes }: { initialBytes: number }) {
  const [bytes, setBytes] = useState(initialBytes);
  const [busy, setBusy] = useState(false);

  if (bytes === 0) return null;

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-[11px] text-ink-subtle">
      <span>
        Checkout cache: <span className="font-mono tabular-nums">{formatBytes(bytes)}</span> of
        repository source on disk, in plaintext.
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const response = await fetch("/api/cache", { method: "DELETE" });
            if (response.ok) setBytes(0);
          } catch {
            // Leaving the size shown is the honest outcome of a failed clear.
          } finally {
            setBusy(false);
          }
        }}
        className="rounded border border-line-strong px-2 py-0.5 transition-colors hover:text-ink disabled:opacity-40"
      >
        {busy ? "Clearing…" : "Clear cache"}
      </button>
    </div>
  );
}
