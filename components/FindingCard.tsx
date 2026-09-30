import type { Disposition, Finding } from "@/lib/findings/schema";
import FindingBody from "./FindingBody";

/** Disposition styling. The word is always present — never colour alone (§10). */
const TONE: Record<Disposition, { dot: string; text: string; label: string }> = {
  blocking: { dot: "bg-del", text: "text-del", label: "blocking" },
  "non-blocking": { dot: "bg-warn", text: "text-warn", label: "non-blocking" },
  nitpick: { dot: "bg-ink-subtle", text: "text-ink-subtle", label: "nitpick" },
};

export default function FindingCard({ finding }: { finding: Finding }) {
  const tone = TONE[finding.disposition];

  return (
    <article className="px-4 py-4 not-last:border-b not-last:border-line">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={`size-1.5 rounded-full ${tone.dot}`} />
          <span className={`font-medium ${tone.text}`}>{tone.label}</span>
        </span>
        <span className="text-ink-subtle">{finding.category}</span>
        {finding.confidence === "plausible" && (
          <span
            className="rounded border border-line-strong px-1.5 py-px text-[10px] uppercase tracking-wider text-ink-subtle"
            title="The agent could not fully verify this"
          >
            unverified
          </span>
        )}
        {finding.origin === "user" && (
          <span className="rounded border border-accent/30 px-1.5 py-px text-[10px] uppercase tracking-wider text-accent">
            yours
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] tabular-nums text-ink-subtle">
          {finding.lineValid ? `:${finding.line}` : "file-level"}
          {finding.snapped && (
            <span title="Moved to the nearest line in the diff"> (snapped)</span>
          )}
        </span>
      </div>

      <h3 className="mt-2 text-sm font-medium text-ink">{finding.title}</h3>

      <div className="mt-2">
        <FindingBody markdown={finding.body} />
      </div>

      {finding.failureScenario && (
        <p className="mt-3 border-l-2 border-line-strong pl-3 text-[13px] leading-relaxed text-ink-muted">
          <span className="text-ink-subtle">Failure: </span>
          {finding.failureScenario}
        </p>
      )}
    </article>
  );
}
