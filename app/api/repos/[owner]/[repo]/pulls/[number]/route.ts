import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getPullDetail } from "@/lib/pulls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
) {
  try {
    const { owner, repo, number } = await params;
    return NextResponse.json(await getPullDetail(owner, repo, number));
  } catch (error) {
    return errorResponse(error);
  }
}
