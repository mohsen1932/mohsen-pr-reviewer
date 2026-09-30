"use client";

import { useState } from "react";
import { CATEGORIES, DISPOSITIONS, type Finding } from "@/lib/findings/schema";
import type { EditableFields } from "@/lib/findings/edit";

const field =
  "w-full rounded-md border border-line bg-canvas px-2.5 py-1.5 text-[13px] text-ink " +
  "placeholder:text-ink-subtle focus:border-line-strong focus:outline-none";

export type NewFinding = EditableFields & { file: string };

/** Write your own finding against a changed file (§8.3). */
export default function AddFinding({
  files,
  onAdd,
}: {
  files: string[];
  onAdd: (draft: NewFinding) => string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [draft, setDraft] = useState<NewFinding>({
    file: files[0] ?? "",
    line: 1,
    disposition: "non-blocking",
    category: "correctness",
    title: "",
    body: "",
  });

  if (files.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-lg border border-dashed border-line-strong px-4 py-3 text-[13px] text-ink-subtle transition-colors hover:border-accent/40 hover:text-ink"
      >
        + Add your own finding
      </button>
    );
  }

  const set = <K extends keyof NewFinding>(key: K, value: NewFinding[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <form
      className="mt-3 space-y-3 rounded-lg border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const problem = onAdd(draft);
        if (problem) setError(problem);
        else {
          setOpen(false);
          setError(undefined);
          setDraft((d) => ({ ...d, title: "", body: "", failureScenario: undefined }));
        }
      }}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="col-span-2 text-[11px] text-ink-subtle">
          File
          <select
            value={draft.file}
            onChange={(e) => set("file", e.target.value)}
            className={`${field} mt-1 font-mono text-[12px]`}
          >
            {files.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-ink-subtle">
          Line
          <input
            type="number"
            min={1}
            value={draft.line}
            onChange={(e) => set("line", Number(e.target.value))}
            className={`${field} mt-1 font-mono tabular-nums`}
          />
        </label>
        <label className="text-[11px] text-ink-subtle">
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
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-ink-subtle">
          Category
          <select
            value={draft.category}
            onChange={(e) => set("category", e.target.value as Finding["category"])}
            className={`${field} mt-1`}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-ink-subtle">
          Title
          <input
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="One line"
            className={`${field} mt-1`}
          />
        </label>
      </div>

      <label className="block text-[11px] text-ink-subtle">
        Body (markdown)
        <textarea
          value={draft.body}
          rows={4}
          onChange={(e) => set("body", e.target.value)}
          className={`${field} mt-1 resize-y font-mono text-[12px]`}
        />
      </label>

      {draft.disposition === "blocking" && (
        <label className="block text-[11px] text-ink-subtle">
          Failure scenario (required for blocking)
          <textarea
            value={draft.failureScenario ?? ""}
            rows={2}
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
          Add finding
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(undefined);
          }}
          className="rounded-md border border-line-strong px-3 py-1.5 text-[13px] text-ink-muted hover:bg-hover"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
