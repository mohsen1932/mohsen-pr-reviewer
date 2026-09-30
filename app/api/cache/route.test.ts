import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheSizeBytes = vi.fn();
const clearCheckout = vi.fn();

vi.mock("@/lib/review/checkout", () => ({ cacheSizeBytes, clearCheckout }));

beforeEach(() => {
  vi.resetModules();
  cacheSizeBytes.mockReset().mockResolvedValue(2_097_152);
  clearCheckout.mockReset().mockResolvedValue(undefined);
});

describe("GET /api/cache", () => {
  it("reports the cache size", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ bytes: 2_097_152 });
  });

  it("reports a failure rather than pretending the cache is empty", async () => {
    cacheSizeBytes.mockRejectedValue(new Error("EACCES"));
    const { GET } = await import("./route");
    expect((await GET()).status).toBe(500);
  });
});

describe("DELETE /api/cache", () => {
  it("clears every cached clone and reports zero", async () => {
    const { DELETE } = await import("./route");
    const res = await DELETE();
    expect(clearCheckout).toHaveBeenCalledWith();
    await expect(res.json()).resolves.toEqual({ bytes: 0 });
  });

  it("does not claim success when the clear failed", async () => {
    clearCheckout.mockRejectedValue(new Error("EBUSY"));
    const { DELETE } = await import("./route");
    expect((await DELETE()).status).toBe(500);
  });

  it("never leaks a credential from a filesystem error", async () => {
    clearCheckout.mockRejectedValue(new Error("failed near github_pat_11ABCDE0123456789abcdefgh"));
    const { DELETE } = await import("./route");
    const res = await DELETE();
    expect(JSON.stringify(await res.json())).not.toContain("github_pat_");
  });
});
