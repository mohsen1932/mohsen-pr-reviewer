import { beforeEach, describe, expect, it, vi } from "vitest";

const gitMock = vi.fn();
vi.mock("./git", () => ({ git: gitMock }));

/** Capture the tool definitions the SDK is handed. */
const captured: Record<string, { description: string; handler: Handler; extras?: unknown }> = {};
type Handler = (args: Record<string, unknown>, extra: unknown) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  tool: (name: string, description: string, _schema: unknown, handler: Handler, extras?: unknown) => {
    captured[name] = { description, handler, extras };
    return { name };
  },
  createSdkMcpServer: (cfg: unknown) => cfg,
}));

beforeEach(() => {
  gitMock.mockReset().mockResolvedValue("output");
  for (const k of Object.keys(captured)) delete captured[k];
});

async function build() {
  const { createReviewTools } = await import("./tools");
  createReviewTools("/cache/owner/repo");
  return captured;
}

const call = async (name: string, args: Record<string, unknown>) =>
  (await captured[name].handler(args, {}));
const gitArgs = () => gitMock.mock.calls.at(-1)![0] as string[];

describe("tool surface", () => {
  it("exposes exactly two git tools and nothing else", async () => {
    const tools = await build();
    expect(Object.keys(tools).sort()).toEqual(["git_blame", "git_log_for_file"]);
  });

  it("marks both read-only so they can run in parallel", async () => {
    const tools = await build();
    for (const t of Object.values(tools)) {
      expect(t.extras).toMatchObject({ annotations: { readOnlyHint: true } });
    }
  });

  it("publishes fully-qualified names matching the server name", async () => {
    const { REVIEW_TOOL_NAMES } = await import("./tools");
    expect(REVIEW_TOOL_NAMES).toEqual([
      "mcp__review__git_log_for_file",
      "mcp__review__git_blame",
    ]);
  });
});

describe("git_log_for_file", () => {
  it("runs a fixed argument list with the path after --", async () => {
    await build();
    await call("git_log_for_file", { path: "src/a.ts" });
    const args = gitArgs();
    expect(args[0]).toBe("log");
    // The path sits last, after `--`, so a filename can never be read as a flag.
    expect(args.at(-2)).toBe("--");
    expect(args.at(-1)).toBe("src/a.ts");
  });

  it("defaults to 20 commits and honours an override", async () => {
    await build();
    await call("git_log_for_file", { path: "a.ts" });
    expect(gitArgs()).toContain("20");
    await call("git_log_for_file", { path: "a.ts", limit: 5 });
    expect(gitArgs()).toContain("5");
  });

  it.each(["../../etc/passwd", "/etc/passwd", "src/../../x", "a\0b", ""])(
    "refuses unsafe path %j without invoking git",
    async (p) => {
      await build();
      const result = await call("git_log_for_file", { path: p });
      expect(result.isError).toBe(true);
      expect(gitMock).not.toHaveBeenCalled();
    },
  );

  it("reports a git failure as a tool error rather than throwing", async () => {
    await build();
    gitMock.mockRejectedValue(new Error("fatal: no such path"));
    const result = await call("git_log_for_file", { path: "a.ts" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("no such path");
  });
});

describe("git_blame", () => {
  it("passes an -L range and the path after --", async () => {
    await build();
    await call("git_blame", { path: "src/a.ts", startLine: 10, endLine: 20 });
    const args = gitArgs();
    expect(args.slice(0, 3)).toEqual(["blame", "-L", "10,20"]);
    expect(args.at(-2)).toBe("--");
    expect(args.at(-1)).toBe("src/a.ts");
  });

  it("caps a huge range so it cannot flood the context", async () => {
    await build();
    await call("git_blame", { path: "a.ts", startLine: 1, endLine: 100000 });
    expect(gitArgs()[2]).toBe("1,201");
  });

  it("rejects an inverted range", async () => {
    await build();
    const result = await call("git_blame", { path: "a.ts", startLine: 20, endLine: 10 });
    expect(result.isError).toBe(true);
    expect(gitMock).not.toHaveBeenCalled();
  });

  it("refuses an unsafe path", async () => {
    await build();
    const result = await call("git_blame", { path: "../secrets", startLine: 1, endLine: 2 });
    expect(result.isError).toBe(true);
    expect(gitMock).not.toHaveBeenCalled();
  });
});

describe("output handling", () => {
  it("truncates very long output", async () => {
    await build();
    gitMock.mockResolvedValue("x".repeat(80_000));
    const result = await call("git_log_for_file", { path: "a.ts" });
    expect(result.content[0].text.length).toBeLessThan(80_000);
    expect(result.content[0].text).toContain("truncated");
  });

  it("reports empty output explicitly rather than as a blank result", async () => {
    await build();
    gitMock.mockResolvedValue("   ");
    const result = await call("git_log_for_file", { path: "a.ts" });
    expect(result.content[0].text).toBe("(no output)");
  });
});
