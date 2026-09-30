import { NextResponse } from "next/server";
import { InvalidInputError } from "./validate";
import { scrubError } from "./scrub";

/**
 * Shared error mapping for route handlers. SPEC.md §11, §12.
 *
 * Every message passes through scrubError, so a credential embedded in an
 * upstream error never reaches the browser.
 */

type Octokitish = {
  status?: number;
  response?: { headers?: Record<string, string | undefined> };
};

/**
 * A rate-limit 403 is only actionable if it says when the limit resets —
 * otherwise "try again later" is all the user has.
 */
function rateLimitMessage(error: unknown): string | undefined {
  const headers = (error as Octokitish).response?.headers ?? {};
  const remaining = headers["x-ratelimit-remaining"];
  const reset = headers["x-ratelimit-reset"];
  if (remaining !== "0" || !reset) return undefined;

  const resetsAt = new Date(Number(reset) * 1000);
  if (Number.isNaN(resetsAt.getTime())) return undefined;

  const minutes = Math.max(1, Math.ceil((resetsAt.getTime() - Date.now()) / 60_000));
  const clock = resetsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `GitHub rate limit reached. It resets at ${clock}, in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof InvalidInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const status = (error as Octokitish)?.status;
  const message = scrubError(error);

  if (status === 401) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN was rejected by GitHub. Check it is still valid." },
      { status: 401 },
    );
  }
  if (status === 403 || status === 429) {
    return NextResponse.json(
      {
        error:
          rateLimitMessage(error) ??
          "GitHub refused the request. The token may lack access to this repository.",
      },
      { status: 403 },
    );
  }
  if (status === 404) {
    return NextResponse.json(
      { error: "No access — check your token covers this repository." },
      { status: 404 },
    );
  }

  return NextResponse.json({ error: message }, { status: 500 });
}
