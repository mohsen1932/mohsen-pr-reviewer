import { addedLines, commentableLines, type ParsedPatch } from "../diff";

/**
 * Line anchoring. SPEC.md §8.5.
 *
 * GitHub rejects an entire review with a 422 if any comment targets a line
 * outside the diff, so every finding's line is checked here before it is shown
 * and again before it is posted. One bad line would lose the whole review.
 */

/** How far to look for a nearby changed line before giving up. */
export const SNAP_RADIUS = 3;

export type AnchorInput = {
  file: string;
  line: number;
};

export type AnchorTarget = {
  filename: string;
  parsed: ParsedPatch;
  /** True when the patch was dropped for size — no lines to anchor against. */
  patchOmitted?: boolean;
};

export type AnchorResult =
  | { ok: false; reason: "file-not-in-pr"; message: string }
  | { ok: true; line: number; lineValid: boolean; snapped: boolean; note?: string };

export function anchorFinding(
  input: AnchorInput,
  files: AnchorTarget[],
): AnchorResult {
  const file = files.find((f) => f.filename === input.file);

  // A finding on a file the PR did not touch cannot be posted at all, and is
  // usually a sign the agent drifted outside the diff.
  if (!file) {
    const near = suggestFilename(input.file, files);
    return {
      ok: false,
      reason: "file-not-in-pr",
      message:
        `"${input.file}" is not a file changed by this pull request.` +
        (near ? ` Did you mean "${near}"?` : "") +
        " Only comment on files in the diff.",
    };
  }

  // Nothing to anchor against, but the finding is still worth keeping as a
  // file-level note.
  if (file.patchOmitted || file.parsed.hunks.length === 0) {
    return {
      ok: true,
      line: input.line,
      lineValid: false,
      snapped: false,
      note: "No diff hunks available for this file; posting as a file-level note.",
    };
  }

  const commentable = commentableLines(file.parsed);
  if (commentable.has(input.line)) {
    return { ok: true, line: input.line, lineValid: true, snapped: false };
  }

  // Nearest wins; an added line only breaks a tie. Preferring "added" outright
  // would move a comment further from where the model pointed just because an
  // added line happened to be within the radius.
  const snapped = nearest(input.line, commentable, addedLines(file.parsed));

  if (snapped !== undefined) {
    return {
      ok: true,
      line: snapped,
      lineValid: true,
      snapped: true,
      note: `Line ${input.line} is not in the diff; anchored to the nearest changed line, ${snapped}.`,
    };
  }

  return {
    ok: true,
    line: input.line,
    lineValid: false,
    snapped: false,
    note: `Line ${input.line} is not in the diff and no changed line is within ${SNAP_RADIUS} lines; posting as a file-level note.`,
  };
}

/**
 * Closest candidate within SNAP_RADIUS. Ties break toward an added line, then
 * toward the smaller line number so the result is deterministic.
 */
function nearest(
  line: number,
  candidates: Set<number>,
  added: Set<number>,
): number | undefined {
  let best: number | undefined;
  let bestKey: [number, number, number] = [Infinity, Infinity, Infinity];

  for (const candidate of candidates) {
    const distance = Math.abs(candidate - line);
    if (distance > SNAP_RADIUS) continue;
    const key: [number, number, number] = [distance, added.has(candidate) ? 0 : 1, candidate];
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
      best = candidate;
      bestKey = key;
    }
  }
  return best;
}

/**
 * A wrong path is usually a basename the agent got right with the wrong
 * directory, so naming the likely file makes the retry cheap.
 */
function suggestFilename(wanted: string, files: AnchorTarget[]): string | undefined {
  const base = wanted.split("/").pop();
  if (!base) return undefined;
  return files.find((f) => f.filename.split("/").pop() === base)?.filename;
}
