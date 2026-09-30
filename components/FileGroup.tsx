"use client";

import { useState } from "react";
import type { FileGroup as Group } from "@/lib/findings/group";
import type { ParsedPatch } from "@/lib/diff";
import FindingCard, { type FindingActions } from "./FindingCard";

const ORDER = ["blocking", "non-blocking"] as const;
const COUNT_TONE = {
  blocking: "text-del",
  "non-blocking": "text-warn",
} as const;

export default function FileGroup({
  group,
  patch,
  actions,
  onBulk,
  locked = false,
}: {
  group: Group;
  patch?: ParsedPatch;
  actions: FindingActions;
  onBulk: (file: string, action: "approve" | "dismiss") => void;
  locked?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const directory = group.file.includes("/")
    ? group.file.slice(0, group.file.lastIndexOf("/") + 1)
    : "";
  const name = group.file.split("/").pop();

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span aria-hidden className="font-mono text-[10px] text-ink-subtle">
            {open ? "▾" : "▸"}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs">
            <span className="text-ink-subtle">{directory}</span>
            <span className="text-ink">{name}</span>
          </span>
        </button>

        <span className="flex shrink-0 gap-2 font-mono text-[11px] tabular-nums">
          {ORDER.filter((d) => group.counts[d] > 0).map((d) => (
            <span key={d} className={COUNT_TONE[d]}>
              {group.counts[d]} {d}
            </span>
          ))}
        </span>

        {!locked && (
          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => onBulk(group.file, "approve")}
              className="rounded px-1.5 py-0.5 text-[11px] text-ink-subtle hover:bg-hover hover:text-ink"
            >
              approve all
            </button>
            <button
              type="button"
              onClick={() => onBulk(group.file, "dismiss")}
              className="rounded px-1.5 py-0.5 text-[11px] text-ink-subtle hover:bg-hover hover:text-ink"
            >
              dismiss all
            </button>
          </span>
        )}
      </div>

      {open && (
        <div className="border-t border-line">
          {group.findings.map((finding) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              patch={patch}
              actions={actions}
              locked={locked}
            />
          ))}
        </div>
      )}
    </section>
  );
}
