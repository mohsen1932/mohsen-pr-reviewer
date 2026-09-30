"use client";

import { useMemo, useState } from "react";
import { countByDisposition, filterFindings, groupByFile } from "@/lib/findings/group";
import { dismissedFindings, visibleFindings } from "@/lib/review/reducer";
import type { AnchorTarget } from "@/lib/review/anchor";
import AddFinding from "./AddFinding";
import DismissedDrawer from "./DismissedDrawer";
import FileGroup from "./FileGroup";
import UndoToast from "./UndoToast";
import { useReviewStream } from "./useReviewStream";
import { Notice } from "./ui";

type Props = {
  owner: string;
  repo: string;
  number: number;
  headSha: string;
  /** Changed files with parsed patches, for anchoring edited and added findings. */
  files: AnchorTarget[];
  /** Why reviewing is unavailable, if it is. */
  blockedReason?: string;
};

export default function ReviewPanel({
  owner,
  repo,
  number,
  headSha,
  files,
  blockedReason,
}: Props) {
  const review = useReviewStream({ owner, repo, number, headSha }, files);
  const { state } = review;
  const [hideNitpicks, setHideNitpicks] = useState(false);

  const active = useMemo(() => visibleFindings(state), [state]);
  const dismissed = useMemo(() => dismissedFindings(state), [state]);
  const counts = useMemo(() => countByDisposition(active), [active]);
  const groups = useMemo(
    () => groupByFile(filterFindings(active, { hideNitpicks })),
    [active, hideNitpicks],
  );

  const approvedCount = active.filter((f) => f.status === "approved").length;
  const running = state.status === "running";
  const hasFindings = state.findings.length > 0;

  const actions = {
    setStatus: review.setStatus,
    edit: review.edit,
    remove: review.remove,
  };

  return (
    <section className="mt-7">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3.5">
        {running ? (
          <button
            type="button"
            onClick={review.cancel}
            className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-hover"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (state.status !== "idle") review.reset();
              void review.start();
            }}
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
          <Notice
            tone={state.partial ? "warn" : "del"}
            title={state.partial ? "Partial review" : "Review failed"}
          >
            {state.error}
          </Notice>
        </div>
      )}

      {hasFindings && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="text-sm font-medium text-ink">Findings</h2>
            <span className="font-mono text-xs tabular-nums text-ink-subtle">
              {counts.blocking} blocking · {counts["non-blocking"]} non-blocking ·{" "}
              {counts.nitpick} nitpick
            </span>

            <span className="ml-auto flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={counts.blocking === 0}
                onClick={() =>
                  review.bulk({ kind: "disposition", disposition: "blocking" }, "approve")
                }
                className="rounded-md border border-line-strong px-2.5 py-1 text-[12px] text-ink-muted transition-colors hover:bg-hover disabled:opacity-30"
              >
                Approve all blocking
              </button>
              <button
                type="button"
                disabled={counts.nitpick === 0}
                onClick={() =>
                  review.bulk({ kind: "disposition", disposition: "nitpick" }, "delete")
                }
                className="rounded-md border border-line-strong px-2.5 py-1 text-[12px] text-ink-subtle transition-colors hover:border-del/40 hover:text-del disabled:opacity-30"
              >
                Delete all nitpicks
              </button>
            </span>
          </div>

          <div className="mt-3 space-y-3">
            {groups.map((group) => (
              <FileGroup
                key={group.file}
                group={group}
                actions={actions}
                onBulk={(file, action) => review.bulk({ kind: "file", file }, action)}
              />
            ))}
            {groups.length === 0 && active.length > 0 && (
              <p className="rounded-lg border border-line bg-surface px-4 py-10 text-center text-[13px] text-ink-subtle">
                All {counts.nitpick} remaining findings are nitpicks, and they are hidden.
              </p>
            )}
          </div>

          <DismissedDrawer
            findings={dismissed}
            setStatus={review.setStatus}
            remove={review.remove}
          />
        </>
      )}

      {state.status !== "idle" && !running && (
        <AddFinding files={files.map((f) => f.filename)} onAdd={review.add} />
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

      {approvedCount > 0 && (
        <div className="sticky bottom-4 mt-5 flex items-center gap-3 rounded-lg border border-accent/30 bg-raised px-4 py-3">
          <span className="text-[13px] text-ink">
            {approvedCount} finding{approvedCount === 1 ? "" : "s"} approved
          </span>
          <button
            type="button"
            disabled
            title="Posting to GitHub arrives in M6"
            className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:cursor-not-allowed disabled:opacity-30"
          >
            Post {approvedCount} comment{approvedCount === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {state.undo && (
        <UndoToast
          label={state.undo.label}
          onUndo={review.undo}
          onExpire={review.clearUndo}
        />
      )}
    </section>
  );
}
