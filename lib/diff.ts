/**
 * Unified-diff patch parsing. SPEC.md §8.5.
 *
 * This is the foundation for line anchoring: GitHub rejects an entire review
 * with a 422 if any comment targets a line outside the diff, so every finding's
 * line is checked against these hunks before it is shown or posted.
 *
 * Hand-rolled rather than a dependency: we need new-side line numbers per line,
 * which most parsers do not expose directly, and the format is small.
 */

export type DiffLineKind = "add" | "del" | "context";

export type DiffLine = {
  kind: DiffLineKind;
  /** Line number in the pre-image. Absent for added lines. */
  oldLine?: number;
  /** Line number in the post-image. Absent for deleted lines. */
  newLine?: number;
  content: string;
};

export type Hunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Text after the closing @@, e.g. the enclosing function. */
  section: string;
  lines: DiffLine[];
};

export type ParsedPatch = {
  hunks: Hunk[];
};

// @@ -oldStart,oldLines +newStart,newLines @@ section
const HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

export function parsePatch(patch: string | undefined | null): ParsedPatch {
  if (!patch) return { hunks: [] };

  const hunks: Hunk[] = [];
  let current: Hunk | undefined;
  let oldLine = 0;
  let newLine = 0;

  for (const raw of patch.split("\n")) {
    const header = HEADER.exec(raw);
    if (header) {
      current = {
        oldStart: Number(header[1]),
        // An omitted count means 1, per the unified diff format.
        oldLines: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newLines: header[4] === undefined ? 1 : Number(header[4]),
        section: header[5] ?? "",
        lines: [],
      };
      oldLine = current.oldStart;
      newLine = current.newStart;
      hunks.push(current);
      continue;
    }

    if (!current) continue; // preamble (---/+++ headers, "diff --git")

    // "\ No newline at end of file" annotates the previous line; it occupies no
    // line number on either side.
    if (raw.startsWith("\\")) continue;

    const marker = raw[0];
    const content = raw.slice(1);

    if (marker === "+") {
      current.lines.push({ kind: "add", newLine, content });
      newLine++;
    } else if (marker === "-") {
      current.lines.push({ kind: "del", oldLine, content });
      oldLine++;
    } else if (marker === " " || raw === "") {
      // A fully empty line is a context line whose content is empty.
      current.lines.push({ kind: "context", oldLine, newLine, content });
      oldLine++;
      newLine++;
    }
    // Any other leading character is not part of a hunk body; ignore it.
  }

  return { hunks };
}

/** New-side line numbers that appear anywhere in the diff, added or context. */
export function commentableLines(parsed: ParsedPatch): Set<number> {
  const lines = new Set<number>();
  for (const hunk of parsed.hunks) {
    for (const line of hunk.lines) {
      if (line.newLine !== undefined) lines.add(line.newLine);
    }
  }
  return lines;
}

/** New-side line numbers the PR actually added or modified. */
export function addedLines(parsed: ParsedPatch): Set<number> {
  const lines = new Set<number>();
  for (const hunk of parsed.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === "add" && line.newLine !== undefined) lines.add(line.newLine);
    }
  }
  return lines;
}

/** Whether a comment on this new-side line would be accepted by GitHub. */
export function isCommentable(parsed: ParsedPatch, line: number): boolean {
  return commentableLines(parsed).has(line);
}
