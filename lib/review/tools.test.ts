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

const reported: unknown[] = [];

async function build(files: unknown[] = []) {
  reported.length = 0;
  const { createReviewTools } = await import("./tools");
  createReviewTools({
    cwd: "/cache/owner/repo",
    files: files as never,
    onFinding: (f) => reported.push(f),
  });
  return captured;
}

const call = async (name: string, args: Record<string, unknown>) =>
  (await captured[name].handler(args, {}));
const gitArgs = () => gitMock.mock.calls.at(-1)![0] as string[];

describe("tool surface", () => {
  it("exposes exactly two git tools and nothing else", async () => {
    const tools = await build();
    expect(Object.keys(tools).sort()).toEqual([
      "git_blame",
      "git_log_for_file",
      "report_finding",
    ]);
  });

  it("marks the git tools read-only so they can run in parallel", async () => {
    const tools = await build();
    for (const name of ["git_log_for_file", "git_blame"]) {
      expect(tools[name].extras).toMatchObject({ annotations: { readOnlyHint: true } });
    }
  });

  it("publishes fully-qualified names matching the server name", async () => {
    const { REVIEW_TOOL_NAMES } = await import("./tools");
    expect(REVIEW_TOOL_NAMES).toEqual([
      "mcp__review__git_log_for_file",
      "mcp__review__git_blame",
      "mcp__review__report_finding",
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

describe("report_finding", () => {
  const PATCH = ["@@ -1,3 +1,4 @@", " a", "+b", "+c", " d"].join("\n");
  const SCENARIO = "A request with an empty token reaches compare() and returns true.";

  async function withFile() {
    const { parsePatch } = await import("../diff");
    return build([{ filename: "src/a.ts", parsed: parsePatch(PATCH) }]);
  }

  const finding = (over: Record<string, unknown> = {}) => ({
    file: "src/a.ts",
    line: 2,
    disposition: "non-blocking",
    category: "correctness",
    title: "Wrong comparison",
    body: "Uses == instead of ===.",
    confidence: "plausible",
    ...over,
  });

  it("records a valid finding and returns machine-readable data", async () => {
    await withFile();
    const result = await call("report_finding", finding());
    expect(result.isError).toBeFalsy();
    expect(reported).toHaveLength(1);
    expect((result as { structuredContent?: Record<string, unknown> }).structuredContent).toMatchObject({
      file: "src/a.ts",
      line: 2,
      lineValid: true,
    });
  });

  it("confirms what it recorded, so the model does not repeat itself", async () => {
    await withFile();
    const result = await call("report_finding", finding());
    expect(result.content[0].text).toContain("Recorded");
    expect(result.content[0].text).toContain("src/a.ts:2");
  });

  it("returns isError for a rejected finding and records nothing", async () => {
    await withFile();
    const result = await call("report_finding", finding({ disposition: "blocking" }));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("failureScenario");
    expect(reported).toHaveLength(0);
  });

  it("rejects a file outside the pull request", async () => {
    await withFile();
    const result = await call("report_finding", finding({ file: "src/elsewhere.ts" }));
    expect(result.isError).toBe(true);
    expect(reported).toHaveLength(0);
  });

  it("accepts blocking once a scenario is supplied", async () => {
    await withFile();
    const result = await call(
      "report_finding",
      finding({ disposition: "blocking", failureScenario: SCENARIO }),
    );
    expect(result.isError).toBeFalsy();
    expect(reported).toHaveLength(1);
  });

  it("mentions the anchoring move when a line was snapped", async () => {
    await withFile();
    const result = await call("report_finding", finding({ line: 6 }));
    expect(result.content[0].text).toContain("nearest changed line");
  });

  it("is not marked read-only — it mutates review state", async () => {
    const tools = await withFile();
    expect(tools.report_finding.extras).toBeUndefined();
  });
});
