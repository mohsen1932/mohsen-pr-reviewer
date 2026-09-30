import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

const gitMock = vi.fn();
const fsMock = { stat: vi.fn(), readFile: vi.fn() };

vi.mock("./git", () => ({ git: gitMock }));
vi.mock("node:fs/promises", () => ({ default: fsMock, ...fsMock }));

const CWD = "/cache/repos/owner/repo";
const findings: unknown[] = [];

beforeEach(() => {
  vi.resetModules();
  gitMock.mockReset().mockResolvedValue("output");
  fsMock.stat.mockReset().mockResolvedValue({ isFile: () => true, size: 100 });
  fsMock.readFile.mockReset().mockResolvedValue("one\ntwo\nthree\nfour");
  findings.length = 0;
});

async function load(files: unknown[] = []) {
  const mod = await import("./agent-tools");
  const ctx = { cwd: CWD, files: files as never, onFinding: (f: unknown) => findings.push(f) };
  return { ...mod, ctx };
}
const gitArgs = () => gitMock.mock.calls.at(-1)![0] as string[];

describe("tool surface", () => {
  it("offers exactly the read-only tools and nothing that writes or shells out", async () => {
    const { TOOL_NAMES } = await load();
    expect([...TOOL_NAMES].sort()).toEqual([
      "git_blame",
      "git_log_for_file",
      "list_files",
      "read_file",
      "report_finding",
      "search",
    ]);
    // The allowlist is this table — there is no bash, write, edit or fetch.
    for (const forbidden of ["bash", "shell", "write_file", "edit", "fetch", "run"]) {
      expect(TOOL_NAMES).not.toContain(forbidden);
    }
  });

  it("declares strict object schemas so the model cannot smuggle extra fields", async () => {
    const { TOOL_DEFINITIONS } = await load();
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.parameters.additionalProperties).toBe(false);
      expect(tool.parameters.type).toBe("object");
    }
  });

  it("refuses a tool name it does not define", async () => {
    const { runTool, ctx } = await load();
    const result = await runTool("bash", { command: "rm -rf /" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("No tool named");
    expect(gitMock).not.toHaveBeenCalled();
  });
});

describe("path confinement", () => {
  const ESCAPES = ["../../etc/passwd", "/etc/passwd", "src/../../x", ".git/config"];

  it.each(ESCAPES)("read_file refuses %s", async (p) => {
    const { runTool, ctx } = await load();
    const result = await runTool("read_file", { path: p }, ctx);
    expect(result.isError).toBe(true);
    expect(fsMock.readFile).not.toHaveBeenCalled();
  });

  it.each(ESCAPES)("git_log_for_file refuses %s", async (p) => {
    const { runTool, ctx } = await load();
    expect((await runTool("git_log_for_file", { path: p }, ctx)).isError).toBe(true);
    expect(gitMock).not.toHaveBeenCalled();
  });

  it.each(ESCAPES)("git_blame refuses %s", async (p) => {
    const { runTool, ctx } = await load();
    const r = await runTool("git_blame", { path: p, startLine: 1, endLine: 2 }, ctx);
    expect(r.isError).toBe(true);
    expect(gitMock).not.toHaveBeenCalled();
  });

  it("search refuses an out-of-tree scope", async () => {
    const { runTool, ctx } = await load();
    expect((await runTool("search", { pattern: "x", path: "../../etc" }, ctx)).isError).toBe(true);
    expect(gitMock).not.toHaveBeenCalled();
  });
});

describe("read_file", () => {
  it("returns line-numbered content", async () => {
    const { runTool, ctx } = await load();
    const result = await runTool("read_file", { path: "src/a.ts" }, ctx);
    expect(result.text).toContain("1  one");
    expect(result.text).toContain("4  four");
    expect(fsMock.readFile).toHaveBeenCalledWith(path.resolve(CWD, "src/a.ts"), "utf8");
  });

  it("honours a line range", async () => {
    const { runTool, ctx } = await load();
    const result = await runTool("read_file", { path: "a.ts", startLine: 2, endLine: 3 }, ctx);
    expect(result.text).toBe("2  two\n3  three");
  });

  it("rejects an inverted range", async () => {
    const { runTool, ctx } = await load();
    expect((await runTool("read_file", { path: "a.ts", startLine: 3, endLine: 1 }, ctx)).isError).toBe(true);
  });

  it("refuses a file too large to be worth loading", async () => {
    fsMock.stat.mockResolvedValue({ isFile: () => true, size: 999_999 });
    const { runTool, ctx } = await load();
    const result = await runTool("read_file", { path: "big.ts" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("line range");
  });

  it("refuses a directory", async () => {
    fsMock.stat.mockResolvedValue({ isFile: () => false, size: 0 });
    const { runTool, ctx } = await load();
    expect((await runTool("read_file", { path: "src" }, ctx)).isError).toBe(true);
  });

  it("reports a missing file as a tool error rather than throwing", async () => {
    fsMock.stat.mockRejectedValue(new Error("ENOENT"));
    const { runTool, ctx } = await load();
    const result = await runTool("read_file", { path: "gone.ts" }, ctx);
    expect(result.isError).toBe(true);
  });
});

describe("search", () => {
  it("passes the pattern after -e so it cannot be read as a flag", async () => {
    const { runTool, ctx } = await load();
    await runTool("search", { pattern: "--version" }, ctx);
    const args = gitArgs();
    expect(args[0]).toBe("grep");
    expect(args[args.indexOf("-e") + 1]).toBe("--version");
  });

  it("scopes to a path after --", async () => {
    const { runTool, ctx } = await load();
    await runTool("search", { pattern: "x", path: "src" }, ctx);
    expect(gitArgs().at(-2)).toBe("--");
    expect(gitArgs().at(-1)).toBe("src");
  });

  it("reports no matches rather than an error when git grep exits non-zero", async () => {
    gitMock.mockRejectedValue(new Error("exit 1"));
    const { runTool, ctx } = await load();
    const result = await runTool("search", { pattern: "nothing" }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain("no matches");
  });

  it("requires a pattern", async () => {
    const { runTool, ctx } = await load();
    expect((await runTool("search", {}, ctx)).isError).toBe(true);
  });
});

describe("list_files", () => {
  it("uses git ls-files with the glob as a pathspec", async () => {
    gitMock.mockResolvedValue("src/a.ts\nsrc/b.ts");
    const { runTool, ctx } = await load();
    const result = await runTool("list_files", { glob: "src/**/*.ts" }, ctx);
    expect(gitArgs()).toEqual(["ls-files", "--", "src/**/*.ts"]);
    expect(result.text).toContain("src/a.ts");
  });

  it("says so when nothing matches", async () => {
    gitMock.mockResolvedValue("");
    const { runTool, ctx } = await load();
    expect((await runTool("list_files", { glob: "*.zzz" }, ctx)).text).toContain("no files match");
  });
});

describe("git_blame", () => {
  it("caps a huge range", async () => {
    const { runTool, ctx } = await load();
    await runTool("git_blame", { path: "a.ts", startLine: 1, endLine: 99999 }, ctx);
    expect(gitArgs()[2]).toBe("1,201");
  });

  it("rejects an inverted range without calling git", async () => {
    const { runTool, ctx } = await load();
    expect((await runTool("git_blame", { path: "a.ts", startLine: 9, endLine: 2 }, ctx)).isError).toBe(true);
    expect(gitMock).not.toHaveBeenCalled();
  });
});

describe("report_finding", () => {
  async function withFile() {
    const { parsePatch } = await import("../diff");
    return load([{ filename: "src/a.ts", parsed: parsePatch("@@ -1,2 +1,3 @@\n a\n+b\n+c") }]);
  }
  const finding = (over = {}) => ({
    file: "src/a.ts",
    line: 2,
    disposition: "non-blocking",
    category: "correctness",
    title: "Wrong",
    body: "Because.",
    confidence: "plausible",
    ...over,
  });

  it("records a valid finding", async () => {
    const { runTool, ctx } = await withFile();
    const result = await runTool("report_finding", finding(), ctx);
    expect(result.isError).toBeFalsy();
    expect(findings).toHaveLength(1);
  });

  it("rejects a blocking finding with no scenario and records nothing", async () => {
    const { runTool, ctx } = await withFile();
    const result = await runTool("report_finding", finding({ disposition: "blocking" }), ctx);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("failureScenario");
    expect(findings).toHaveLength(0);
  });

  it("rejects a file outside the pull request", async () => {
    const { runTool, ctx } = await withFile();
    expect((await runTool("report_finding", finding({ file: "other.ts" }), ctx)).isError).toBe(true);
    expect(findings).toHaveLength(0);
  });
});
