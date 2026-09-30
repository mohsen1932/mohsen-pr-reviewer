import { NextResponse } from "next/server";
import { InvalidInputError } from "./validate";
import { scrubError } from "./scrub";

/**
 * Shared error mapping for route handlers. SPEC.md §11, §12.
 *
 * Every message passes through scrubError, so a credential embedded in an
 * upstream error never reaches the browser.
 */

type Octokitish = { status?: number };

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
  if (status === 403) {
    return NextResponse.json(
      { error: "GitHub refused the request. Rate limited, or the token lacks access." },
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
