import type { PullDetail } from "@/lib/pulls";
import { summarizeExclusions } from "@/lib/pr-files";
import { formatBytes } from "@/lib/format";

const STATUS_MARK: Record<string, string> = {
  added: "A",
  removed: "D",
  modified: "M",
  renamed: "R",
  copied: "C",
  changed: "M",
  unchanged: "·",
};

/** Changed-file list plus an explicit account of what was left out. SPEC.md §11. */
export default function DiffSummary({ pull }: { pull: PullDetail }) {
  const exclusions = summarizeExclusions(pull.excluded);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
        <h2 className="font-medium">Changed files</h2>
        <span className="text-black/50 dark:text-white/50">
          {pull.files.length} of {pull.changedFiles} reviewable
        </span>
        <span className="font-mono text-xs">
          <span className="text-emerald-600 dark:text-emerald-400">+{pull.additions}</span>{" "}
          <span className="text-red-600 dark:text-red-400">−{pull.deletions}</span>
        </span>
        <span className="ml-auto text-xs text-black/40 dark:text-white/40">
          {formatBytes(pull.totalPatchBytes)} of diff
        </span>
      </div>

      {exclusions.length > 0 && (
        <p className="mt-2 rounded-md border border-black/10 bg-black/[.03] px-3 py-2 text-xs text-black/60 dark:border-white/15 dark:bg-white/[.04] dark:text-white/60">
          Not reviewed: {exclusions.join(", ")}. Scope reduction is always reported,
          never silent.
        </p>
      )}

      <ul className="mt-3 font-mono text-xs">
        {pull.files.map((f) => (
          <li
            key={f.filename}
            className="flex gap-2 border-b border-black/5 py-1.5 dark:border-white/10"
          >
            <span className="w-3 shrink-0 text-black/40 dark:text-white/40">
              {STATUS_MARK[f.status] ?? "?"}
            </span>
            <span className="min-w-0 flex-1 truncate">{f.filename}</span>
            {f.patchOmitted && (
              <span className="shrink-0 text-amber-700 dark:text-amber-400">
                patch omitted
              </span>
            )}
            <span className="shrink-0 text-emerald-600 dark:text-emerald-400">
              +{f.additions}
            </span>
            <span className="shrink-0 text-red-600 dark:text-red-400">−{f.deletions}</span>
            <span className="w-16 shrink-0 text-right text-black/30 dark:text-white/30">
              {f.parsed.hunks.length} hunk{f.parsed.hunks.length === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
