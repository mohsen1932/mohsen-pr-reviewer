import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { parseRepoUrl } from "@/lib/repo-url";
import { getRepo } from "@/lib/repos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolve a pasted URL to a repo we can actually reach. SPEC.md §6, §9. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
    if (typeof body?.url !== "string") {
      return NextResponse.json({ error: "Expected a JSON body with a url string." }, { status: 400 });
    }

    const ref = parseRepoUrl(body.url);
    if (!ref) {
      return NextResponse.json(
        { error: "Not a GitHub repository URL. Try owner/repo or a github.com link." },
        { status: 400 },
      );
    }

    // Confirms the token can actually see it — a parse success is not access.
    // Named `repository`, not `repo`: `ref.repo` is the repo *name*, and
    // spreading the summary over it would replace the name with an object.
    const repository = await getRepo(ref.owner, ref.repo);
    return NextResponse.json({ ...ref, repository });
  } catch (error) {
    return errorResponse(error);
  }
}
