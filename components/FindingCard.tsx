"use client";

import { useMemo, useState } from "react";
import type { Disposition, Finding, FindingStatus } from "@/lib/findings/schema";
import { extractSnippet } from "@/lib/findings/snippet";
import type { ParsedPatch } from "@/lib/diff";
import DiffSnippet from "./DiffSnippet";
import type { EditorDraft } from "./FindingEditor";
import FindingBody from "./FindingBody";
import FindingEditor from "./FindingEditor";

/** Disposition styling. The word is always present — never colour alone (§10). */
const TONE: Record<Disposition, { dot: string; text: string }> = {
  blocking: { dot: "bg-del", text: "text-del" },
  "non-blocking": { dot: "bg-warn", text: "text-warn" },
};

export type FindingActions = {
  setStatus: (id: string, status: FindingStatus) => void;
  edit: (id: string, changes: EditorDraft) => string | undefined;
  remove: (id: string) => void;
};

const action =
  "rounded-md px-2.5 py-1 text-[12px] transition-colors disabled:opacity-30";

export default function FindingCard({
  finding,
  patch,
  actions,
}: {
  finding: Finding;
  /** The file's parsed patch, for the code shown above the comment. */
  patch?: ParsedPatch;
  actions: FindingActions;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const snippet = useMemo(
    () => (patch ? extractSnippet(patch, finding.line, finding.endLine) : null),
    [patch, finding.line, finding.endLine],
  );
  const tone = TONE[finding.disposition];
  const approved = finding.status === "approved";

  return (
    <article
      className={`px-4 py-4 not-last:border-b not-last:border-line ${
        approved ? "bg-accent/[0.04]" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={`size-1.5 rounded-full ${tone.dot}`} />
          <span className={`font-medium ${tone.text}`}>{finding.disposition}</span>
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
        {finding.edited && (
          <span className="text-[11px] text-accent" title="You changed this finding">
            edited
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] tabular-nums text-ink-subtle">
          {finding.lineValid ? `:${finding.line}` : "file-level"}
          {finding.snapped && (
            <span title="Moved to the nearest line in the diff"> (snapped)</span>
          )}
        </span>
      </div>

      {editing ? (
        <div className="mt-3">
          <FindingEditor
            finding={finding}
            error={error}
            onCancel={() => {
              setEditing(false);
              setError(undefined);
            }}
            onSave={(changes) => {
              const problem = actions.edit(finding.id, changes);
              if (problem) setError(problem);
              else {
                setEditing(false);
                setError(undefined);
              }
            }}
          />
        </div>
      ) : (
        <>
          <h3 className="mt-2 text-sm font-medium text-ink">{finding.title}</h3>

          {snippet && (
            <div className="mt-2.5">
              <DiffSnippet snippet={snippet} file={finding.file} />
            </div>
          )}

          <div className="mt-3">
            <FindingBody markdown={finding.body} />
          </div>

          {finding.failureScenario && (
            <p className="mt-3 border-l-2 border-line-strong pl-3 text-[13px] leading-relaxed text-ink-muted">
              <span className="text-ink-subtle">Failure: </span>
              {finding.failureScenario}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                actions.setStatus(finding.id, approved ? "pending" : "approved")
              }
              className={`${action} ${
                approved
                  ? "bg-accent text-accent-ink hover:opacity-90"
                  : "border border-line-strong text-ink-muted hover:bg-hover"
              }`}
            >
              {approved ? "Approved" : "Approve"}
            </button>
            <button
              type="button"
              onClick={() => actions.setStatus(finding.id, "dismissed")}
              className={`${action} border border-line-strong text-ink-muted hover:bg-hover`}
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={`${action} border border-line-strong text-ink-muted hover:bg-hover`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => actions.remove(finding.id)}
              aria-label="Delete finding"
              title="Delete (undoable for a few seconds)"
              className={`${action} ml-auto border border-line-strong text-ink-subtle hover:border-del/40 hover:text-del`}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </article>
  );
}
