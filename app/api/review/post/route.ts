import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { postReview, PostError, type ReviewEventKind } from "@/lib/review/post";
import type { Finding } from "@/lib/findings/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENTS: ReviewEventKind[] = ["COMMENT", "REQUEST_CHANGES"];

type Body = {
  owner?: unknown;
  repo?: unknown;
  number?: unknown;
  headSha?: unknown;
  event?: unknown;
  findings?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Body | null;

    const event = EVENTS.includes(body?.event as ReviewEventKind)
      ? (body!.event as ReviewEventKind)
      : "COMMENT";

    if (!Array.isArray(body?.findings)) {
      return NextResponse.json({ error: "Expected a findings array." }, { status: 400 });
    }
    if (typeof body?.headSha !== "string" || !/^[0-9a-f]{7,40}$/i.test(body.headSha)) {
      return NextResponse.json({ error: "Expected the reviewed head sha." }, { status: 400 });
    }

    const result = await postReview({
      owner: String(body?.owner ?? ""),
      repo: String(body?.repo ?? ""),
      number: String(body?.number ?? ""),
      headSha: body.headSha,
      event,
      findings: body.findings as Finding[],
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PostError || (error as Error)?.name === "PostError") {
      const posted = error as PostError;
      return NextResponse.json(
        { error: posted.message, kind: posted.kind, detail: posted.detail },
        // A stale head or an own-PR request-changes is the caller's to fix, so
        // 409 rather than 500 — the UI branches on `kind`.
        { status: posted.kind === "github" ? 502 : 409 },
      );
    }
    return errorResponse(error);
  }
}
