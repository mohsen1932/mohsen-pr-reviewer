import {
  compareFindings,
  DISPOSITION_RANK,
  type Disposition,
  type Finding,
} from "./schema";

/** Grouping and ordering for the review panel. SPEC.md §8.4. */

export type FileGroup = {
  file: string;
  findings: Finding[];
  /** Worst disposition present, which decides the group's position. */
  worst: Disposition;
  counts: Record<Disposition, number>;
};

export function emptyCounts(): Record<Disposition, number> {
  return { blocking: 0, "non-blocking": 0, nitpick: 0 };
}

export function countByDisposition(findings: Finding[]): Record<Disposition, number> {
  const counts = emptyCounts();
  for (const f of findings) counts[f.disposition]++;
  return counts;
}

/**
 * Group by file, worst-first. Within a file: disposition, then category, then
 * line — so the thing most worth reading is at the top of the page and the top
 * of its group.
 */
export function groupByFile(findings: Finding[]): FileGroup[] {
  const byFile = new Map<string, Finding[]>();
  for (const finding of findings) {
    const list = byFile.get(finding.file);
    if (list) list.push(finding);
    else byFile.set(finding.file, [finding]);
  }

  const groups: FileGroup[] = [];
  for (const [file, list] of byFile) {
    const sorted = [...list].sort(compareFindings);
    groups.push({
      file,
      findings: sorted,
      worst: sorted[0].disposition,
      counts: countByDisposition(sorted),
    });
  }

  return groups.sort(
    (a, b) =>
      DISPOSITION_RANK[a.worst] - DISPOSITION_RANK[b.worst] ||
      b.findings.length - a.findings.length ||
      a.file.localeCompare(b.file),
  );
}

/** Hide-nitpicks is the filter people actually use, so it gets its own path. */
export function filterFindings(
  findings: Finding[],
  options: { hideNitpicks?: boolean } = {},
): Finding[] {
  if (!options.hideNitpicks) return findings;
  return findings.filter((f) => f.disposition !== "nitpick");
}
