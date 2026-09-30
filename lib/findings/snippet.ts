import type { DiffLine, ParsedPatch } from "../diff";

/**
 * The few diff lines around a finding, for showing next to it. BACKLOG B2.
 *
 * A finding cannot be judged without the code it is about, and the patch is
 * already on the page — so this is a slice, not a fetch.
 */

export const SNIPPET_CONTEXT = 3;

export type SnippetLine = DiffLine & {
  /** True for the line (or range) the finding points at. */
  target: boolean;
};

export type Snippet = {
  lines: SnippetLine[];
  /** Lines omitted before the first shown line, for a "…" marker. */
  truncatedBefore: boolean;
  truncatedAfter: boolean;
};

export function extractSnippet(
  parsed: ParsedPatch,
  line: number,
  endLine?: number,
  context: number = SNIPPET_CONTEXT,
): Snippet | null {
  const last = Math.max(line, endLine ?? line);

  for (const hunk of parsed.hunks) {
    const startIndex = hunk.lines.findIndex((l) => l.newLine === line);
    if (startIndex === -1) continue;

    // Deleted lines carry no new-side number, so the end of a range is found by
    // position rather than by arithmetic on line numbers.
    let endIndex = startIndex;
    for (let i = startIndex; i < hunk.lines.length; i++) {
      const candidate = hunk.lines[i].newLine;
      if (candidate !== undefined && candidate <= last) endIndex = i;
      if (candidate !== undefined && candidate > last) break;
    }

    const from = Math.max(0, startIndex - context);
    const to = Math.min(hunk.lines.length, endIndex + context + 1);

    return {
      lines: hunk.lines.slice(from, to).map((l, i) => ({
        ...l,
        target: from + i >= startIndex && from + i <= endIndex,
      })),
      truncatedBefore: from > 0,
      truncatedAfter: to < hunk.lines.length,
    };
  }

  // The line is not in the diff — a file-level finding (§8.5) has nothing to show.
  return null;
}
