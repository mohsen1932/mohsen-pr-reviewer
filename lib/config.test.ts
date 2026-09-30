import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

const ENV_KEYS = [
  "GITHUB_TOKEN",
  "OPENAI_API_KEY",
  "REVIEW_MODEL",
  "REVIEW_EFFORT",
  "CACHE_DIR",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** config reads env at module load, so each case needs a fresh module. */
async function loadConfig() {
  vi.resetModules();
  return import("./config");
}

describe("credentials", () => {
  it("reads both credentials from env", async () => {
    process.env.GITHUB_TOKEN = "github_pat_11ABCDE0123456789abcdefgh";
    process.env.OPENAI_API_KEY = "sk-proj-abcdefghijklmnopqrst";
    const { config } = await loadConfig();
    expect(config.githubToken).toBe("github_pat_11ABCDE0123456789abcdefgh");
    expect(config.openaiApiKey).toBe("sk-proj-abcdefghijklmnopqrst");
  });

  it("is undefined rather than throwing when unset", async () => {
    const { config } = await loadConfig();
    expect(config.githubToken).toBeUndefined();
    expect(config.openaiApiKey).toBeUndefined();
  });

  it("treats whitespace-only as unset", async () => {
    process.env.GITHUB_TOKEN = "   ";
    const { config } = await loadConfig();
    expect(config.githubToken).toBeUndefined();
  });

  it("trims surrounding whitespace", async () => {
    process.env.GITHUB_TOKEN = "  github_pat_11ABCDE0123456789abcdefgh  ";
    const { config } = await loadConfig();
    expect(config.githubToken).toBe("github_pat_11ABCDE0123456789abcdefgh");
  });

  it("registers both credentials for scrubbing", async () => {
    process.env.GITHUB_TOKEN = "github_pat_11ABCDE0123456789abcdefgh";
    process.env.OPENAI_API_KEY = "sk-proj-abcdefghijklmnopqrst";
    await loadConfig();
    const { scrub } = await import("./scrub");
    expect(scrub("github_pat_11ABCDE0123456789abcdefgh")).toBe("[redacted]");
  });
});

describe("reviewModel", () => {
  it("defaults to gpt-5.4-mini", async () => {
    const { config } = await loadConfig();
    expect(config.reviewModel).toBe("gpt-5.4-mini");
  });

  it("honours an override", async () => {
    process.env.REVIEW_MODEL = "gpt-5.4";
    const { config } = await loadConfig();
    expect(config.reviewModel).toBe("gpt-5.4");
  });
});

describe("reviewEffort", () => {
  it("defaults to high", async () => {
    const { config } = await loadConfig();
    expect(config.reviewEffort).toBe("high");
  });

  it.each(["minimal", "low", "medium", "high", "xhigh"])("accepts %s", async (effort) => {
    process.env.REVIEW_EFFORT = effort;
    const { config } = await loadConfig();
    expect(config.reviewEffort).toBe(effort);
  });

  it("falls back to high on an unrecognized value", async () => {
    process.env.REVIEW_EFFORT = "turbo";
    const { config } = await loadConfig();
    expect(config.reviewEffort).toBe("high");
  });
});

describe("cacheDir", () => {
  it("defaults under the working directory", async () => {
    const { cacheDir } = await loadConfig();
    expect(cacheDir()).toBe(path.join(process.cwd(), ".cache", "repos"));
  });

  it("resolves a relative override to an absolute path", async () => {
    process.env.CACHE_DIR = "tmp/checkouts";
    const { cacheDir } = await loadConfig();
    expect(path.isAbsolute(cacheDir())).toBe(true);
    expect(cacheDir()).toBe(path.resolve("tmp/checkouts"));
  });

  it("passes an absolute override through", async () => {
    process.env.CACHE_DIR = "/var/tmp/checkouts";
    const { cacheDir } = await loadConfig();
    expect(cacheDir()).toBe("/var/tmp/checkouts");
  });

  it("is evaluated lazily, not at module load", async () => {
    const { cacheDir } = await loadConfig();
    process.env.CACHE_DIR = "/changed/after/import";
    expect(cacheDir()).toBe("/changed/after/import");
  });
});
