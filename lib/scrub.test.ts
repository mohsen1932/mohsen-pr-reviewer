import { beforeEach, describe, expect, it, vi } from "vitest";

/** scrub keeps module-level state, so each test gets a fresh module. */
async function freshScrub() {
  vi.resetModules();
  return import("./scrub");
}

describe("registerSecret", () => {
  it("redacts a registered secret by exact match", async () => {
    const { registerSecret, scrub } = await freshScrub();
    registerSecret("supersecretvalue123");
    expect(scrub("token=supersecretvalue123 end")).toBe("token=[redacted] end");
  });

  it("redacts every occurrence, not just the first", async () => {
    const { registerSecret, scrub } = await freshScrub();
    registerSecret("supersecretvalue123");
    const out = scrub("a supersecretvalue123 b supersecretvalue123");
    expect(out).toBe("a [redacted] b [redacted]");
  });

  it("ignores undefined", async () => {
    const { registerSecret, scrub } = await freshScrub();
    registerSecret(undefined);
    expect(scrub("nothing to redact")).toBe("nothing to redact");
  });

  it("ignores short values that would over-match", async () => {
    const { registerSecret, scrub } = await freshScrub();
    registerSecret("abc");
    expect(scrub("abc appears in abcdef")).toBe("abc appears in abcdef");
  });
});

describe("scrub patterns", () => {
  it.each([
    ["classic PAT", "ghp_0123456789abcdefghij"],
    ["oauth token", "gho_0123456789abcdefghij"],
    ["server token", "ghs_0123456789abcdefghij"],
    ["fine-grained PAT", "github_pat_11ABCDE0123456789abcdefgh"],
    ["anthropic key", "sk-ant-api03-abcdefghijklmnop"],
  ])("redacts an unregistered %s", async (_label, token) => {
    const { scrub } = await freshScrub();
    expect(scrub(`Authorization: ${token}`)).toBe("Authorization: [redacted]");
  });

  it("leaves ordinary text alone", async () => {
    const { scrub } = await freshScrub();
    const text = "Repository github.com/owner/repo returned 404";
    expect(scrub(text)).toBe(text);
  });

  it("redacts a credential embedded in a URL", async () => {
    const { scrub } = await freshScrub();
    const out = scrub("https://x-access-token:ghp_0123456789abcdefghij@github.com/o/r");
    expect(out).not.toContain("ghp_");
    expect(out).toContain("[redacted]");
  });
});

describe("scrubError", () => {
  it("returns a scrubbed Error message", async () => {
    const { scrubError } = await freshScrub();
    const error = new Error("bad token ghp_0123456789abcdefghij");
    expect(scrubError(error)).toBe("bad token [redacted]");
  });

  it("never leaks a stack trace", async () => {
    const { scrubError } = await freshScrub();
    expect(scrubError(new Error("boom"))).toBe("boom");
  });

  it("scrubs a thrown string", async () => {
    const { scrubError } = await freshScrub();
    expect(scrubError("key sk-ant-api03-abcdefghijklmnop")).toBe("key [redacted]");
  });

  it("serializes a thrown object", async () => {
    const { scrubError } = await freshScrub();
    expect(scrubError({ status: 404 })).toBe('{"status":404}');
  });

  it("falls back when a value cannot be serialized", async () => {
    const { scrubError } = await freshScrub();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(scrubError(circular)).toBe("Unknown error");
  });
});
