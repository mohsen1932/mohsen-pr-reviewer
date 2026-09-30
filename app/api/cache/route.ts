import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { cacheSizeBytes, clearCheckout } from "@/lib/review/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Size of the checkout cache, so it does not grow unnoticed (SPEC.md §12). */
export async function GET() {
  try {
    return NextResponse.json({ bytes: await cacheSizeBytes() });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Clears every cached clone. The cache holds private source in plaintext, so
 * removing it is something the user must be able to do without a terminal.
 */
export async function DELETE() {
  try {
    await clearCheckout();
    return NextResponse.json({ bytes: 0 });
  } catch (error) {
    return errorResponse(error);
  }
}
