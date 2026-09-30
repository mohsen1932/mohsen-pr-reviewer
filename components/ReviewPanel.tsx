"use client";

import { useMemo, useState } from "react";
import { filterFindings, groupByFile, countByDisposition } from "@/lib/findings/group";
import FileGroup from "./FileGroup";
import { useReviewStream } from "./useReviewStream";
import { Notice } from "./ui";

type Props = {
  owner: string;
  repo: string;
  number: number;
  headSha: string;
  /** Why reviewing is unavailable, if it is. */
  blockedReason?: string;
};

export default function ReviewPanel({ owner, repo, number, headSha, blockedReason }: Props) {
  const { state, start, cancel, reset } = useReviewStream({ owner, repo, number, headSha });
  const [hideNitpicks, setHideNitpicks] = useState(false);

  const counts = useMemo(() => countByDisposition(state.findings), [state.findings]);
  const groups = useMemo(
    () => groupByFile(filterFindings(state.findings, { hideNitpicks })),
    [state.findings, hideNitpicks],
  );

  const running = state.status === "running";
  const hasFindings = state.findings.length > 0;

  return (
    <section className="mt-7">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3.5">
        {running ? (
          <button
            type="button"
            onClick={cancel}
            className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-hover"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={state.status === "idle" ? start : () => { reset(); void start(); }}
            disabled={Boolean(blockedReason)}
            title={blockedReason}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-25"
          >
            {state.status === "idle" ? "Review this PR" : "Review again"}
          </button>
        )}

        {blockedReason ? (
          <span className="text-xs text-warn">{blockedReason}</span>
        ) : running ? (
          <span className="flex min-w-0 items-center gap-2 text-xs text-ink-muted">
            <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-accent" />
            <span className="truncate font-mono">
              {state.phase ?? "working"}
              {state.detail ? ` ${state.detail}` : ""}
            </span>
          </span>
        ) : state.summary ? (
          <span className="font-mono text-[11px] tabular-nums text-ink-subtle">
            {state.summary.turns} turns ·{" "}
            {state.summary.costUsd === null
              ? "cost unknown"
              : `$${state.summary.costUsd.toFixed(4)}`}{" "}
            · {(state.summary.durationMs / 1000).toFixed(0)}s · cache{" "}
            {(state.summary.usage.cacheHitRate * 100).toFixed(0)}%
          </span>
        ) : null}

        {hasFindings && (
          <label className="ml-auto flex shrink-0 cursor-pointer select-none items-center gap-2 text-[13px] text-ink-muted">
            <input
              type="checkbox"
              checked={hideNitpicks}
              onChange={(e) => setHideNitpicks(e.target.checked)}
              className="accent-accent"
            />
            Hide nitpicks ({counts.nitpick})
          </label>
        )}
      </div>

      {state.error && (
        <div className="mt-4">
          <Notice tone={state.partial ? "warn" : "del"} title={state.partial ? "Partial review" : "Review failed"}>
            {state.error}
          </Notice>
        </div>
      )}

      {hasFindings && (
        <>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-3 text-sm">
            <h2 className="font-medium text-ink">Findings</h2>
            <span className="font-mono text-xs tabular-nums text-ink-subtle">
              {counts.blocking} blocking · {counts["non-blocking"]} non-blocking ·{" "}
              {counts.nitpick} nitpick
            </span>
          </div>

          <div className="mt-3 space-y-3">
            {groups.map((group) => (
              <FileGroup key={group.file} group={group} />
            ))}
            {groups.length === 0 && (
              <p className="rounded-lg border border-line bg-surface px-4 py-10 text-center text-[13px] text-ink-subtle">
                All {counts.nitpick} findings are nitpicks, and they are hidden.
              </p>
            )}
          </div>
        </>
      )}

      {state.status === "done" && !hasFindings && (
        <div className="mt-4">
          <Notice tone="neutral" title="No findings">
            The agent reviewed the diff and did not find anything worth reporting.
            {state.notes.length > 0 && ` ${state.notes.at(-1)}`}
          </Notice>
        </div>
      )}

      {running && state.activity.length > 0 && (
        <ol className="mt-4 space-y-1 font-mono text-[11px] text-ink-subtle">
          {state.activity.map((a, i) => (
            <li key={`${a.name}-${i}`} className="truncate">
              <span className="text-ink-muted">{a.name}</span> {a.summary}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
