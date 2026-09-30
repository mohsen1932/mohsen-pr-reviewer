import type { Finding } from "./schema";

/**
 * Rendering findings for GitHub. SPEC.md §6.
 *
 * Comments use Conventional Comments, so the disposition is legible at a glance
 * in the GitHub UI and matches a convention reviewers already read.
 */

/** The label half of the prefix. Security earns its own, since it reads differently. */
function label(finding: Finding): string {
  if (finding.category === "security") return "security";
  return finding.disposition === "blocking" ? "issue" : "suggestion";
}

export function commentPrefix(finding: Finding): string {
  return `**${label(finding)} (${finding.disposition}):**`;
}

export function renderComment(finding: Finding): string {
  const parts = [`${commentPrefix(finding)} ${finding.title}`, "", finding.body.trim()];

  if (finding.failureScenario?.trim()) {
    parts.push("", `*Failure:* ${finding.failureScenario.trim()}`);
  }
  if (finding.confidence === "plausible") {
    parts.push("", "<sub>Flagged as unverified — the reviewer could not fully confirm this.</sub>");
  }

  return parts.join("\n");
}

/** A finding with no line in the diff still belongs somewhere (§8.5). */
export function renderFileLevelNote(finding: Finding): string {
  return `- **${finding.file}** — ${commentPrefix(finding)} ${finding.title}\n\n  ${finding.body
    .trim()
    .split("\n")
    .join("\n  ")}`;
}

export type ReviewBodyInput = {
  fileLevel: Finding[];
};

/**
 * GitHub requires a non-empty `body` on a COMMENT or REQUEST_CHANGES review, so
 * this is the shortest thing that is still true when there is nothing else to
 * say. No summary, no attribution — the comments speak for themselves.
 */
export const MINIMAL_REVIEW_BODY = "Review comments below.";

/**
 * The review's own body. It carries only what cannot go anywhere else: findings
 * that could not be anchored to a line in the diff (§8.5).
 */
export function renderReviewBody({ fileLevel }: ReviewBodyInput): string {
  if (fileLevel.length === 0) return MINIMAL_REVIEW_BODY;

  return [
    "### General",
    "",
    "These could not be anchored to a line in the diff:",
    "",
    ...fileLevel.map(renderFileLevelNote),
  ].join("\n");
}
