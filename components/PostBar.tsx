"use client";

import { useState } from "react";
import { countByDisposition } from "@/lib/findings/group";
import type { Finding } from "@/lib/findings/schema";

export type PostOutcome = {
  url: string;
  inlineCount: number;
  fileLevelCount: number;
  event: string;
};

export type PostFailure = { message: string; kind?: string; detail?: string };

type Props = {
  approved: Finding[];
  /** GitHub rejects REQUEST_CHANGES on your own PR, so it is not offered (§6). */
  canRequestChanges: boolean;
  posting: boolean;
  outcome?: PostOutcome;
  failure?: PostFailure;
  onPost: (event: "COMMENT" | "REQUEST_CHANGES") => void;
  onDismissFailure: () => void;
};

export default function PostBar({
  approved,
  canRequestChanges,
  posting,
  outcome,
  failure,
  onPost,
  onDismissFailure,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [event, setEvent] = useState<"COMMENT" | "REQUEST_CHANGES">("COMMENT");

  if (outcome) {
    return (
      <div className="sticky bottom-4 mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-add/30 bg-add/[0.06] px-4 py-3">
        <span className="text-[13px] text-ink">
          Posted {outcome.inlineCount} inline comment
          {outcome.inlineCount === 1 ? "" : "s"}
          {outcome.fileLevelCount > 0 &&
            ` and ${outcome.fileLevelCount} file-level note${outcome.fileLevelCount === 1 ? "" : "s"}`}
          .
        </span>
        <a
          href={outcome.url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto rounded-lg border border-line-strong px-3 py-1.5 text-[13px] text-ink hover:bg-hover"
        >
          View on GitHub ↗
        </a>
      </div>
    );
  }

  if (approved.length === 0) return null;
  const counts = countByDisposition(approved);
  const unanchored = approved.filter((f) => !f.lineValid).length;

  return (
    <div className="sticky bottom-4 mt-5 rounded-lg border border-accent/30 bg-raised px-4 py-3">
      {failure && (
        <div className="mb-3 rounded-md border border-del/25 bg-del/[0.06] px-3 py-2 text-[13px]">
          <p className="text-del">{failure.message}</p>
          {failure.detail && (
            <p className="mt-1 font-mono text-[11px] text-ink-subtle">{failure.detail}</p>
          )}
          {failure.kind === "own-pr" && (
            <button
              type="button"
              onClick={() => {
                setEvent("COMMENT");
                onDismissFailure();
                onPost("COMMENT");
              }}
              className="mt-2 rounded-md bg-accent px-2.5 py-1 text-[12px] font-medium text-accent-ink hover:opacity-90"
            >
              Post as a comment instead
            </button>
          )}
        </div>
      )}

      {confirming ? (
        <div className="space-y-3">
          <p className="text-[13px] text-ink">
            Post {approved.length} comment{approved.length === 1 ? "" : "s"} to this pull
            request?
          </p>
          <p className="font-mono text-[11px] tabular-nums text-ink-muted">
            {counts.blocking} blocking · {counts["non-blocking"]} non-blocking
            {unanchored > 0 && ` · ${unanchored} as file-level note${unanchored === 1 ? "" : "s"}`}
          </p>
          <p className="text-[11px] text-ink-subtle">
            This posts publicly to GitHub under your account and cannot be undone
            from here.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={posting}
              onClick={() => onPost(event)}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-40"
            >
              {posting
                ? "Posting…"
                : event === "REQUEST_CHANGES"
                  ? "Request changes"
                  : "Post review"}
            </button>
            <button
              type="button"
              disabled={posting}
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-line-strong px-3 py-2 text-[13px] text-ink-muted hover:bg-hover disabled:opacity-40"
            >
              Cancel
            </button>
            {canRequestChanges && (
              <label className="ml-auto flex cursor-pointer select-none items-center gap-2 text-[12px] text-ink-muted">
                <input
                  type="checkbox"
                  checked={event === "REQUEST_CHANGES"}
                  onChange={(e) => setEvent(e.target.checked ? "REQUEST_CHANGES" : "COMMENT")}
                  className="accent-accent"
                />
                Request changes
              </label>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] text-ink">
            {approved.length} finding{approved.length === 1 ? "" : "s"} approved
          </span>
          <span className="font-mono text-[11px] tabular-nums text-ink-subtle">
            {counts.blocking}B · {counts["non-blocking"]}N
          </span>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90"
          >
            Post {approved.length} comment{approved.length === 1 ? "" : "s"}
          </button>
        </div>
      )}
    </div>
  );
}
