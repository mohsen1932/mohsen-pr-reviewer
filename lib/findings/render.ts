import { countByDisposition } from "./group";
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
  inline: Finding[];
  fileLevel: Finding[];
  model: string;
};

/**
 * The review's own body: what was posted, and anything that could not be
 * anchored to a line. A reader should be able to tell the scope of the review
 * from this alone.
 */
export function renderReviewBody({ inline, fileLevel, model }: ReviewBodyInput): string {
  const all = [...inline, ...fileLevel];
  const counts = countByDisposition(all);
  const parts: string[] = [];

  const summary = [
    counts.blocking > 0 ? `${counts.blocking} blocking` : null,
    counts["non-blocking"] > 0 ? `${counts["non-blocking"]} non-blocking` : null,
  ].filter(Boolean);

  parts.push(
    `**AI review** — ${all.length} finding${all.length === 1 ? "" : "s"}` +
      (summary.length ? ` (${summary.join(", ")})` : ""),
  );

  if (fileLevel.length > 0) {
    parts.push(
      "",
      "### General",
      "",
      "These could not be anchored to a line in the diff:",
      "",
      ...fileLevel.map(renderFileLevelNote),
    );
  }

  parts.push(
    "",
    `<sub>Reviewed by \`${model}\`. Every comment was reviewed and approved by a human before posting.</sub>`,
  );

  return parts.join("\n");
}
