import { z } from "zod";

/**
 * The finding model. SPEC.md §8.1, §8.2.
 *
 * Two independent axes. Keeping them separate is the point: *how urgent* and
 * *what kind* are different questions, and collapsing them into one severity
 * scale is what makes AI review output hard to triage.
 */

export const DISPOSITIONS = ["blocking", "non-blocking", "nitpick"] as const;
export const CATEGORIES = [
  "correctness",
  "security",
  "performance",
  "maintainability",
  "testing",
  "docs",
  "style",
] as const;

export const DispositionSchema = z.enum(DISPOSITIONS);
export const CategorySchema = z.enum(CATEGORIES);

export type Disposition = (typeof DISPOSITIONS)[number];
export type Category = (typeof CATEGORIES)[number];

/** Ordering for triage: worst first, then by kind, then by position. */
export const DISPOSITION_RANK: Record<Disposition, number> = {
  blocking: 0,
  "non-blocking": 1,
  nitpick: 2,
};

export const CATEGORY_RANK: Record<Category, number> = {
  security: 0,
  correctness: 1,
  performance: 2,
  testing: 3,
  maintainability: 4,
  docs: 5,
  style: 6,
};

/**
 * A failure scenario has to be a scenario. A few words ("it breaks") satisfies
 * a presence check while carrying none of the evidence that makes `blocking`
 * mean something.
 */
const MIN_FAILURE_SCENARIO = 24;

/** The shape the agent reports. UI state is added later, never by the model. */
export const ReportedFindingSchema = z
  .object({
    file: z.string().min(1).describe("Repo-relative path, exactly as it appears in the diff"),
    line: z.number().int().min(1).describe("Line number in the new version of the file"),
    endLine: z.number().int().min(1).optional().describe("Last line, for a multi-line finding"),
    disposition: DispositionSchema.describe(
      "blocking = must fix before merge, and requires failureScenario; " +
        "non-blocking = real but bounded; nitpick = preference only",
    ),
    category: CategorySchema,
    title: z.string().min(1).max(120).describe("One line, no trailing period"),
    body: z.string().min(1).describe("Markdown. This is what gets posted to GitHub."),
    failureScenario: z
      .string()
      .optional()
      .describe("Required when blocking: concrete inputs or state leading to a wrong result"),
    confidence: z.enum(["confirmed", "plausible"]),
  })
  .superRefine(applyClassificationRules);

/**
 * The rules that stop everything drifting to `blocking` and stop `style` being
 * dressed up as a correctness claim. Enforced in the schema rather than only in
 * the prompt, so they hold regardless of what the model decides to do.
 */
function applyClassificationRules(
  value: {
    disposition: Disposition;
    category: Category;
    failureScenario?: string;
  },
  ctx: z.RefinementCtx,
) {
  if (value.disposition === "blocking") {
    const scenario = value.failureScenario?.trim() ?? "";
    if (!scenario) {
      ctx.addIssue({
        code: "custom",
        path: ["failureScenario"],
        message:
          "A blocking finding requires failureScenario: concrete inputs or state leading to a wrong result. If you cannot write one, this is not blocking — use non-blocking.",
      });
    } else if (scenario.length < MIN_FAILURE_SCENARIO) {
      ctx.addIssue({
        code: "custom",
        path: ["failureScenario"],
        message: `failureScenario is too short to be a scenario (${scenario.length} chars). Describe the inputs or state and the wrong result they produce.`,
      });
    }
  }

  if (value.category === "style" && value.disposition !== "nitpick") {
    ctx.addIssue({
      code: "custom",
      path: ["disposition"],
      message:
        "A style finding is a nitpick by definition. Either set disposition to nitpick, or pick the category that reflects the real problem.",
    });
  }

  if (value.category === "security" && value.disposition === "nitpick") {
    ctx.addIssue({
      code: "custom",
      path: ["disposition"],
      message:
        "A security finding cannot be a nitpick. Use blocking with a failureScenario, or non-blocking if the impact is genuinely bounded.",
    });
  }
}

export type ReportedFinding = z.infer<typeof ReportedFindingSchema>;

export const FINDING_STATUSES = ["pending", "approved", "dismissed"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

/** A finding as the UI holds it: reported fields plus triage state. */
export type Finding = ReportedFinding & {
  id: string;
  status: FindingStatus;
  edited: boolean;
  /** False when no line in the diff could be found — posts as a file-level note. */
  lineValid: boolean;
  /** True when anchoring moved the line to the nearest changed line. */
  snapped: boolean;
  origin: "agent" | "user";
};

/** Sort key for triage order: worst disposition, then kind, then position. */
export function compareFindings(a: Finding, b: Finding): number {
  return (
    DISPOSITION_RANK[a.disposition] - DISPOSITION_RANK[b.disposition] ||
    CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] ||
    a.line - b.line ||
    a.title.localeCompare(b.title)
  );
}

/** Field names the agent supplies, for the MCP tool's input schema. */
export const REPORTED_FINDING_SHAPE = {
  file: ReportedFindingSchema.shape.file,
  line: ReportedFindingSchema.shape.line,
  endLine: ReportedFindingSchema.shape.endLine,
  disposition: ReportedFindingSchema.shape.disposition,
  category: ReportedFindingSchema.shape.category,
  title: ReportedFindingSchema.shape.title,
  body: ReportedFindingSchema.shape.body,
  failureScenario: ReportedFindingSchema.shape.failureScenario,
  confidence: ReportedFindingSchema.shape.confidence,
};
