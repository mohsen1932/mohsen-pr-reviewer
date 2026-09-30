import type { PullDetail } from "@/lib/pulls";
import { summarizeExclusions } from "@/lib/pr-files";
import { formatBytes } from "@/lib/format";
import { DiffStat } from "./ui";

const STATUS: Record<string, { mark: string; className: string; label: string }> = {
  added: { mark: "A", className: "text-add", label: "added" },
  removed: { mark: "D", className: "text-del", label: "removed" },
  modified: { mark: "M", className: "text-warn", label: "modified" },
  renamed: { mark: "R", className: "text-accent", label: "renamed" },
  copied: { mark: "C", className: "text-accent", label: "copied" },
  changed: { mark: "M", className: "text-warn", label: "changed" },
};

/** Changed-file table plus an explicit account of what was left out. */
export default function DiffSummary({ pull }: { pull: PullDetail }) {
  const exclusions = summarizeExclusions(pull.excluded);

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-medium text-ink">Changed files</h2>
        <span className="font-mono text-xs tabular-nums text-ink-subtle">
          {pull.files.length}/{pull.changedFiles} reviewable
        </span>
        <DiffStat additions={pull.additions} deletions={pull.deletions} />
        <span className="ml-auto font-mono text-[11px] tabular-nums text-ink-subtle">
          {formatBytes(pull.totalPatchBytes)} of diff
        </span>
      </div>

      {exclusions.length > 0 && (
        <p className="mb-3 rounded-lg border border-line bg-raised px-3.5 py-2.5 text-xs leading-relaxed text-ink-muted">
          <span className="text-ink">Not reviewed:</span> {exclusions.join(", ")}.
          Scope reduction is always reported, never silent.
        </p>
      )}

      <ul className="overflow-hidden rounded-lg border border-line bg-surface">
        {pull.files.map((f) => {
          const status = STATUS[f.status] ?? { mark: "?", className: "text-ink-subtle", label: f.status };
          return (
            <li
              key={f.filename}
              className="flex items-center gap-3 px-4 py-2.5 font-mono text-xs not-last:border-b not-last:border-line"
            >
              <span
                className={`w-3 shrink-0 font-semibold ${status.className}`}
                title={status.label}
              >
                {status.mark}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink-muted">
                {f.filename.includes("/") && (
                  <span className="text-ink-subtle">
                    {f.filename.slice(0, f.filename.lastIndexOf("/") + 1)}
                  </span>
                )}
                <span className="text-ink">{f.filename.split("/").pop()}</span>
              </span>
              {f.patchOmitted && (
                <span className="shrink-0 text-warn" title="Patch over 64 KB">
                  patch omitted
                </span>
              )}
              <span className="shrink-0 tabular-nums">
                <DiffStat additions={f.additions} deletions={f.deletions} />
              </span>
              <span className="w-14 shrink-0 text-right tabular-nums text-ink-subtle">
                {f.parsed.hunks.length}h
              </span>
            </li>
          );
        })}

        {pull.files.length === 0 && (
          <li className="px-4 py-10 text-center text-[13px] text-ink-subtle">
            Nothing reviewable — every changed file was excluded.
          </li>
        )}
      </ul>
    </section>
  );
}
