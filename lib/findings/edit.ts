import { anchorFinding, type AnchorTarget } from "../review/anchor";
import { ReportedFindingSchema, type Finding } from "./schema";

/**
 * Applying a user's edit to a finding. SPEC.md §8.3.
 *
 * Kept out of the component so the rules — classification still holds, the line
 * still anchors — are testable and cannot be skipped by a different UI path.
 */

export type EditableFields = Pick<
  Finding,
  "title" | "body" | "disposition" | "category" | "line" | "endLine" | "failureScenario"
>;

export type EditResult =
  | { ok: true; finding: Finding; note?: string }
  | { ok: false; message: string; field?: keyof EditableFields };

export function applyEdit(
  finding: Finding,
  changes: Partial<EditableFields>,
  files: AnchorTarget[],
): EditResult {
  const merged = { ...finding, ...changes };

  // The same classification rules the agent is held to (§8.1): a human may
  // promote a finding to blocking, but not without a failure scenario.
  const parsed = ReportedFindingSchema.safeParse({
    file: merged.file,
    line: merged.line,
    endLine: merged.endLine,
    disposition: merged.disposition,
    category: merged.category,
    title: merged.title,
    body: merged.body,
    failureScenario: merged.failureScenario,
    confidence: merged.confidence,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      message: issue.message,
      field: issue.path[0] as keyof EditableFields | undefined,
    };
  }

  // Only re-anchor when the line actually moved; otherwise an edit to the body
  // would silently relocate a finding the user deliberately placed.
  let line = merged.line;
  let lineValid = merged.lineValid;
  let snapped = merged.snapped;
  let note: string | undefined;

  if (changes.line !== undefined && changes.line !== finding.line) {
    const anchor = anchorFinding({ file: merged.file, line: changes.line }, files);
    if (!anchor.ok) return { ok: false, message: anchor.message, field: "line" };
    line = anchor.line;
    lineValid = anchor.lineValid;
    snapped = anchor.snapped;
    note = anchor.note;
  }

  return {
    ok: true,
    note,
    finding: {
      ...merged,
      line,
      lineValid,
      snapped,
      endLine: merged.endLine !== undefined && merged.endLine >= line ? merged.endLine : undefined,
      edited: true,
    },
  };
}
