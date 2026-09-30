import { config } from "../config";
import { github } from "../github";
import { getPullDetail } from "../pulls";
import { anchorFinding } from "./anchor";
import { renderComment, renderReviewBody } from "../findings/render";
import { ReportedFindingSchema, type Finding } from "../findings/schema";
import { assertRepoRef, parsePullNumber } from "../validate";

/**
 * Posting approved findings back to the pull request. SPEC.md §6, §9.
 *
 * One review with a comments array, not N separate comment calls: one API call,
 * one thread on the PR, and the whole thing succeeds or fails together. GitHub
 * rejects the entire review with a 422 if any single comment targets a line
 * outside the diff, which is why every finding is re-validated here even though
 * it was validated when it was created.
 */

export type ReviewEventKind = "COMMENT" | "REQUEST_CHANGES";

export class PostError extends Error {
  readonly kind: "stale-head" | "own-pr" | "invalid" | "github";
  readonly detail?: string;

  constructor(kind: PostError["kind"], message: string, detail?: string) {
    super(message);
    this.name = "PostError";
    this.kind = kind;
    this.detail = detail;
  }
}

export type PostRequest = {
  owner: string;
  repo: string;
  number: number | string;
  /** The head the findings were computed against. */
  headSha: string;
  event: ReviewEventKind;
  findings: Finding[];
};

export type PostResult = {
  url: string;
  inlineCount: number;
  fileLevelCount: number;
  event: ReviewEventKind;
};

export async function postReview(request: PostRequest): Promise<PostResult> {
  assertRepoRef(request.owner, request.repo);
  const number = parsePullNumber(request.number);

  if (request.findings.length === 0) {
    throw new PostError("invalid", "No findings were approved, so there is nothing to post.");
  }

  // Re-read the PR: this both re-derives the patches to anchor against and
  // catches a head that moved while the review was being triaged.
  const pull = await getPullDetail(request.owner, request.repo, number);

  if (pull.headSha !== request.headSha) {
    throw new PostError(
      "stale-head",
      "This pull request has new commits since the review ran, so the findings may point at lines that no longer exist. Re-run the review before posting.",
      `reviewed ${request.headSha.slice(0, 7)}, now ${pull.headSha.slice(0, 7)}`,
    );
  }

  if (request.event === "REQUEST_CHANGES" && pull.authoredByViewer) {
    throw new PostError(
      "own-pr",
      "GitHub does not allow requesting changes on your own pull request. Post as a comment instead.",
    );
  }

  const inline: Finding[] = [];
  const fileLevel: Finding[] = [];

  for (const finding of request.findings) {
    // The browser is not trusted to have kept a finding well-formed: it can be
    // edited freely, and one bad line loses the whole review.
    const parsed = ReportedFindingSchema.safeParse(finding);
    if (!parsed.success) {
      throw new PostError(
        "invalid",
        `"${finding.title || finding.id}" is no longer valid and was not posted.`,
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }

    const anchor = anchorFinding({ file: finding.file, line: finding.line }, pull.files);
    if (!anchor.ok) {
      throw new PostError("invalid", anchor.message);
    }

    if (anchor.lineValid) {
      inline.push({ ...finding, line: anchor.line });
    } else {
      fileLevel.push(finding);
    }
  }

  try {
    const { data } = await github().rest.pulls.createReview({
      owner: request.owner,
      repo: request.repo,
      pull_number: number,
      // Pins the review to the commit the findings were computed against.
      commit_id: request.headSha,
      event: request.event,
      body: renderReviewBody({ inline, fileLevel, model: config.reviewModel }),
      comments: inline.map((finding) => ({
        path: finding.file,
        line: finding.line,
        side: "RIGHT" as const,
        body: renderComment(finding),
      })),
    });

    return {
      url: data.html_url,
      inlineCount: inline.length,
      fileLevelCount: fileLevel.length,
      event: request.event,
    };
  } catch (error) {
    throw translateGitHubError(error, request.event);
  }
}

function translateGitHubError(error: unknown, event: ReviewEventKind): PostError {
  const status = (error as { status?: number }).status;
  const message = (error as Error).message ?? "";

  if (status === 422 && event === "REQUEST_CHANGES" && /own pull request/i.test(message)) {
    return new PostError(
      "own-pr",
      "GitHub does not allow requesting changes on your own pull request. Post as a comment instead.",
    );
  }
  if (status === 422) {
    // Almost always a line outside the diff — the case anchoring exists to
    // prevent, so say what it means rather than echoing GitHub.
    return new PostError(
      "github",
      "GitHub rejected the review. A comment targets a line that is not part of the diff; re-run the review against the current head.",
      message,
    );
  }
  if (status === 403) {
    return new PostError(
      "github",
      "GitHub refused the request. The token may lack Pull requests: write on this repository.",
    );
  }
  return new PostError("github", message || "GitHub rejected the review.");
}
