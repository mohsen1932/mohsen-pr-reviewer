import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ReportedFindingSchema,
  type Finding,
  type ReportedFinding,
} from "./schema";
import { anchorFinding, type AnchorTarget } from "../review/anchor";

/**
 * Turning what the agent reports into a validated, anchored finding.
 * SPEC.md §7.4, §8.5.
 *
 * Separated from the MCP tool wrapper so the whole path is testable without
 * the Agent SDK.
 */

export type AcceptResult =
  | { accepted: true; finding: Finding; note?: string }
  | { accepted: false; message: string };

export function acceptFinding(input: unknown, files: AnchorTarget[]): AcceptResult {
  const parsed = ReportedFindingSchema.safeParse(input);
  if (!parsed.success) {
    return { accepted: false, message: formatIssues(parsed.error) };
  }

  const anchor = anchorFinding({ file: parsed.data.file, line: parsed.data.line }, files);
  if (!anchor.ok) {
    return { accepted: false, message: anchor.message };
  }

  const reported: ReportedFinding = parsed.data;
  const finding: Finding = {
    ...reported,
    line: anchor.line,
    // A multi-line finding whose end drifted before the anchored start is
    // meaningless; drop the range rather than post something incoherent.
    endLine:
      reported.endLine !== undefined && reported.endLine >= anchor.line
        ? reported.endLine
        : undefined,
    id: randomUUID(),
    status: "pending",
    edited: false,
    lineValid: anchor.lineValid,
    snapped: anchor.snapped,
  };

  return { accepted: true, finding, note: anchor.note };
}

/**
 * Zod issues rendered for the model, not for a log. It has to be able to fix
 * the finding from this text alone, so each issue names its field and says
 * what to do.
 */
function formatIssues(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const field = issue.path.join(".") || "(root)";
    return `- ${field}: ${issue.message}`;
  });
  return `This finding was rejected and not recorded. Fix and call report_finding again:\n${lines.join("\n")}`;
}
