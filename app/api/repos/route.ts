import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { listRepos } from "@/lib/repos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ repos: await listRepos() });
  } catch (error) {
    return errorResponse(error);
  }
}
