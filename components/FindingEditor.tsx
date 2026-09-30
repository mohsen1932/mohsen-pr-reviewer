"use client";

import { useState } from "react";
import { CATEGORIES, DISPOSITIONS, type Finding } from "@/lib/findings/schema";
import type { EditableFields } from "@/lib/findings/edit";

const field =
  "w-full rounded-md border border-line bg-canvas px-2.5 py-1.5 text-[13px] text-ink " +
  "placeholder:text-ink-subtle focus:border-line-strong focus:outline-none";

export type EditorDraft = Partial<EditableFields>;

export default function FindingEditor({
  finding,
  error,
  onSave,
  onCancel,
}: {
  finding: Finding;
  error?: string;
  onSave: (changes: EditorDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<EditableFields>({
    title: finding.title,
    body: finding.body,
    disposition: finding.disposition,
    category: finding.category,
    line: finding.line,
    endLine: finding.endLine,
    failureScenario: finding.failureScenario,
  });

  const set = <K extends keyof EditableFields>(key: K, value: EditableFields[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="col-span-1 text-[11px] text-ink-subtle">
          Disposition
          <select
            value={draft.disposition}
            onChange={(e) => set("disposition", e.target.value as Finding["disposition"])}
            className={`${field} mt-1`}
          >
            {DISPOSITIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-1 text-[11px] text-ink-subtle">
          Line
          <input
            type="number"
            min={1}
            value={draft.line}
            onChange={(e) => set("line", Number(e.target.value))}
            className={`${field} mt-1 font-mono tabular-nums`}
          />
        </label>
        <label className="col-span-1 text-[11px] text-ink-subtle">
          End line
          <input
            type="number"
            min={1}
            value={draft.endLine ?? ""}
            placeholder="—"
            onChange={(e) =>
              set("endLine", e.target.value ? Number(e.target.value) : undefined)
            }
            className={`${field} mt-1 font-mono tabular-nums`}
          />
        </label>
      </div>

      <label className="block text-[11px] text-ink-subtle">
        Title
        <input
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          className={`${field} mt-1`}
        />
      </label>

      <label className="block text-[11px] text-ink-subtle">
        Body (markdown — this is what gets posted)
        <textarea
          value={draft.body}
          rows={6}
          onChange={(e) => set("body", e.target.value)}
          className={`${field} mt-1 resize-y font-mono text-[12px]`}
        />
      </label>

      {draft.disposition === "blocking" && (
        <label className="block text-[11px] text-ink-subtle">
          Failure scenario (required for blocking)
          <textarea
            value={draft.failureScenario ?? ""}
            rows={3}
            placeholder="Inputs or state leading to a wrong result"
            onChange={(e) => set("failureScenario", e.target.value)}
            className={`${field} mt-1 resize-y`}
          />
        </label>
      )}

      {error && <p className="text-[13px] text-del">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-ink hover:opacity-90"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-line-strong px-3 py-1.5 text-[13px] text-ink-muted hover:bg-hover"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
