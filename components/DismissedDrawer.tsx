"use client";

import { useState } from "react";
import type { Finding, FindingStatus } from "@/lib/findings/schema";

/** Dismissed findings stay visible but out of the way, and are restorable (§8.3). */
export default function DismissedDrawer({
  findings,
  setStatus,
  remove,
}: {
  findings: Finding[];
  setStatus: (id: string, status: FindingStatus) => void;
  remove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (findings.length === 0) return null;

  return (
    <section className="mt-3 overflow-hidden rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-xs transition-colors hover:bg-hover"
      >
        <span aria-hidden className="font-mono text-[10px] text-ink-subtle">
          {open ? "▾" : "▸"}
        </span>
        <span className="text-ink-muted">Dismissed</span>
        <span className="font-mono tabular-nums text-ink-subtle">{findings.length}</span>
      </button>

      {open && (
        <ul className="border-t border-line">
          {findings.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 px-4 py-2.5 not-last:border-b not-last:border-line"
            >
              <span className="text-[11px] text-ink-subtle">{f.disposition}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">
                {f.title}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-ink-subtle">
                {f.file.split("/").pop()}:{f.line}
              </span>
              <button
                type="button"
                onClick={() => setStatus(f.id, "pending")}
                className="shrink-0 rounded px-2 py-0.5 text-[11px] text-ink-subtle hover:bg-hover hover:text-ink"
              >
                restore
              </button>
              <button
                type="button"
                onClick={() => remove(f.id)}
                className="shrink-0 rounded px-2 py-0.5 text-[11px] text-ink-subtle hover:bg-hover hover:text-del"
              >
                delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
