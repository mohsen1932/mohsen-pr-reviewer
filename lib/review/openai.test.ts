import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OpenAICtor = vi.fn(function OpenAI(this: Record<string, unknown>, opts: unknown) {
  return { opts };
});
vi.mock("openai", () => ({ default: OpenAICtor }));

let saved: string | undefined;

beforeEach(() => {
  saved = process.env.OPENAI_API_KEY;
  OpenAICtor.mockClear();
});

afterEach(() => {
  if (saved === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = saved;
});

async function load(key?: string) {
  if (key === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = key;
  vi.resetModules();
  return import("./openai");
}

const KEY = "sk-proj-abcdefghijklmnopqrst";

describe("openai()", () => {
  it("throws when the key is absent", async () => {
    const { openai } = await load(undefined);
    expect(() => openai()).toThrow("OPENAI_API_KEY is not set");
  });

  it("constructs the client with the key and bounded retries", async () => {
    const { openai } = await load(KEY);
    openai();
    expect(OpenAICtor).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: KEY, maxRetries: 2 }),
    );
  });

  it("returns a singleton — one client for the process", async () => {
    const { openai } = await load(KEY);
    expect(openai()).toBe(openai());
    expect(OpenAICtor).toHaveBeenCalledTimes(1);
  });

  it("can be reset for tests", async () => {
    const { openai, __setClient } = await load(KEY);
    const first = openai();
    __setClient(undefined);
    expect(openai()).not.toBe(first);
    expect(OpenAICtor).toHaveBeenCalledTimes(2);
  });
});
