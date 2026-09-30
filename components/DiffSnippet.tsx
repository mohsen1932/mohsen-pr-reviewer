import type { Snippet } from "@/lib/findings/snippet";

/** The code a finding is about, in diff form. BACKLOG B2. */

const KIND = {
  add: { gutter: "+", row: "bg-add/[0.07]", text: "text-add" },
  del: { gutter: "−", row: "bg-del/[0.07]", text: "text-del" },
  context: { gutter: " ", row: "", text: "text-ink-muted" },
} as const;

const ELLIPSIS = (
  <div aria-hidden className="px-3 py-0.5 font-mono text-[10px] text-ink-subtle">
    ⋯
  </div>
);

export default function DiffSnippet({
  snippet,
  file,
}: {
  snippet: Snippet;
  file: string;
}) {
  const width = Math.max(
    2,
    ...snippet.lines.map((l) => String(l.newLine ?? l.oldLine ?? "").length),
  );

  return (
    <figure className="overflow-hidden rounded-md border border-line bg-canvas">
      <figcaption className="sr-only">Diff around the finding in {file}</figcaption>
      {snippet.truncatedBefore && ELLIPSIS}
      <div className="overflow-x-auto">
        {snippet.lines.map((line, i) => {
          const kind = KIND[line.kind];
          return (
            <div
              key={i}
              className={`flex font-mono text-[11px] leading-[1.6] ${kind.row} ${
                // The target line is marked with a border, not colour alone.
                line.target ? "border-l-2 border-accent" : "border-l-2 border-transparent"
              }`}
            >
              <span
                aria-hidden
                className="shrink-0 select-none px-2 text-right tabular-nums text-ink-subtle"
                style={{ width: `${width + 1}ch` }}
              >
                {line.newLine ?? ""}
              </span>
              <span aria-hidden className={`shrink-0 select-none ${kind.text}`}>
                {kind.gutter}
              </span>
              <span className={`whitespace-pre pl-2 pr-3 ${kind.text}`}>
                {line.content || " "}
              </span>
            </div>
          );
        })}
      </div>
      {snippet.truncatedAfter && ELLIPSIS}
    </figure>
  );
}
