"use client";

import { useState } from "react";
import type { FileGroup as Group } from "@/lib/findings/group";
import FindingCard from "./FindingCard";

const ORDER = ["blocking", "non-blocking", "nitpick"] as const;
const COUNT_TONE = {
  blocking: "text-del",
  "non-blocking": "text-warn",
  nitpick: "text-ink-subtle",
} as const;

export default function FileGroup({ group }: { group: Group }) {
  const [open, setOpen] = useState(true);
  const directory = group.file.includes("/")
    ? group.file.slice(0, group.file.lastIndexOf("/") + 1)
    : "";
  const name = group.file.split("/").pop();

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-hover"
      >
        <span aria-hidden className="font-mono text-[10px] text-ink-subtle">
          {open ? "▾" : "▸"}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">
          <span className="text-ink-subtle">{directory}</span>
          <span className="text-ink">{name}</span>
        </span>
        <span className="flex shrink-0 gap-2 font-mono text-[11px] tabular-nums">
          {ORDER.filter((d) => group.counts[d] > 0).map((d) => (
            <span key={d} className={COUNT_TONE[d]} title={d}>
              {group.counts[d]} {d}
            </span>
          ))}
        </span>
      </button>

      {open && (
        <div className="border-t border-line">
          {group.findings.map((finding) => (
            <FindingCard key={finding.id} finding={finding} />
          ))}
        </div>
      )}
    </section>
  );
}
