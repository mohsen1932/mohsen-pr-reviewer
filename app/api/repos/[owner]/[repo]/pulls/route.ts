import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { listOpenPulls } from "@/lib/pulls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    const { owner, repo } = await params;
    return NextResponse.json({ pulls: await listOpenPulls(owner, repo) });
  } catch (error) {
    return errorResponse(error);
  }
}
