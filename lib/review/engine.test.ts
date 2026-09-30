import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PullDetail } from "../pulls";
import type { ReviewContext } from "./engine";

const queryMock = vi.fn();
const prepareCheckout = vi.fn();
const interrupt = vi.fn();

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: queryMock,
  createSdkMcpServer: (c: unknown) => c,
  tool: (name: string) => ({ name }),
}));
vi.mock("./checkout", () => ({ prepareCheckout }));
vi.mock("./tools", async () => {
  const actual = await vi.importActual<typeof import("./tools")>("./tools");
  return { createReviewTools: () => ({ name: "review" }), REVIEW_TOOL_NAMES: actual.REVIEW_TOOL_NAMES };
});

/** Drive the SDK's async iterable from a fixed message list. */
function sdkYields(messages: unknown[]) {
  queryMock.mockReturnValue(
    Object.assign(
      (async function* () {
        for (const m of messages) yield m;
      })(),
      { interrupt },
    ),
  );
}

const pull = {
  number: 7,
  title: "Fix it",
  headSha: "abc1234",
  headRef: "feature",
  baseRef: "main",
  body: null,
  files: [{ filename: "src/a.ts", status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n+x" }],
  excluded: [],
} as unknown as PullDetail;

const ctx = (): ReviewContext => ({ pull, owner: "owner", repo: "repo" });

const init = (commands: string[] = ["code-review"]) => ({
  type: "system",
  subtype: "init",
  slash_commands: commands,
});
const ok = { type: "result", subtype: "success", num_turns: 3, total_cost_usd: 0.12 };

beforeEach(() => {
  vi.resetModules();
  queryMock.mockReset();
  interrupt.mockReset();
  prepareCheckout.mockReset().mockResolvedValue("/cache/owner/repo");
});

async function collect(context = ctx()) {
  const { reviewPullRequest } = await import("./engine");
  const events = [];
  for await (const e of reviewPullRequest(context)) events.push(e);
  return events;
}

const optionsPassed = () => queryMock.mock.calls.at(-1)![0].options;
const promptPassed = () => queryMock.mock.calls.at(-1)![0].prompt as string;

describe("security invariants", () => {
  it("never loads settings from the cloned repository", async () => {
    sdkYields([init(), ok]);
    await collect();
    // SPEC.md §12: with 'project' the SDK reads .claude/ from cwd and every
    // parent — a skill there can run shell commands before Claude sees it.
    expect(optionsPassed().settingSources).toEqual([]);
  });

  it("offers no Bash, write, or network tools", async () => {
    sdkYields([init(), ok]);
    await collect();
    const tools: string[] = optionsPassed().tools;
    for (const forbidden of ["Bash", "Write", "Edit", "NotebookEdit", "WebFetch", "WebSearch"]) {
      expect(tools).not.toContain(forbidden);
    }
    expect(tools.sort()).toEqual(["Glob", "Grep", "Read", "Skill"]);
  });

  it("sets no allowedTools, so every call reaches the guard", async () => {
    sdkYields([init(), ok]);
    await collect();
    // A bare name in allowedTools auto-approves the tool before canUseTool is
    // consulted — the SDK warns about exactly this. Leaving it unset keeps the
    // guard live rather than decorative.
    expect(optionsPassed().allowedTools).toBeUndefined();
    expect(optionsPassed().canUseTool).toBeTypeOf("function");
  });

  it("denies any tool outside the allowlist as defence in depth", async () => {
    const { denyUnlistedTools } = await import("./engine");
    const opts = {
      signal: new AbortController().signal,
      toolUseID: "t1",
      requestId: "r1",
    };
    await expect(denyUnlistedTools("Bash", {}, opts)).resolves.toMatchObject({ behavior: "deny" });
    await expect(denyUnlistedTools("Write", {}, opts)).resolves.toMatchObject({ behavior: "deny" });
    await expect(denyUnlistedTools("Read", {}, opts)).resolves.toMatchObject({ behavior: "allow" });
    await expect(denyUnlistedTools("mcp__review__git_blame", {}, opts)).resolves.toMatchObject({
      behavior: "allow",
    });
  });

  it("labels the diff as untrusted data in the prompt", async () => {
    sdkYields([init(), ok]);
    await collect();
    expect(promptPassed()).toContain("<untrusted-diff>");
    expect(promptPassed()).toContain("not instructions");
  });

  it("bounds the run with a turn limit", async () => {
    sdkYields([init(), ok]);
    await collect();
    const { MAX_TURNS } = await import("./engine");
    expect(optionsPassed().maxTurns).toBe(MAX_TURNS);
  });
});

describe("session wiring", () => {
  it("dispatches the bundled code-review skill", async () => {
    sdkYields([init(), ok]);
    await collect();
    expect(promptPassed().startsWith("/code-review")).toBe(true);
  });

  it("runs in the checkout directory", async () => {
    sdkYields([init(), ok]);
    await collect();
    expect(optionsPassed().cwd).toBe("/cache/owner/repo");
  });

  it("reports when the code-review skill is missing rather than failing silently", async () => {
    sdkYields([init(["compact"]), ok]);
    const events = await collect();
    expect(events).toContainEqual(
      expect.objectContaining({ phase: "session-ready", detail: expect.stringContaining("NOT found") }),
    );
    expect(events.at(-1)).toMatchObject({ type: "done", skillUsed: false });
  });
});

describe("events", () => {
  it("emits checkout progress before starting the agent", async () => {
    prepareCheckout.mockImplementation(async ({ onProgress }: { onProgress: (p: string, d?: string) => void }) => {
      onProgress("cloning", "owner/repo");
      return "/cache/owner/repo";
    });
    sdkYields([init(), ok]);
    const events = await collect();
    expect(events[0]).toMatchObject({ type: "status", phase: "cloning" });
  });

  it("surfaces assistant text and tool use", async () => {
    sdkYields([
      init(),
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Looking at session.ts" },
            { type: "tool_use", name: "Read", input: { file_path: "src/a.ts" } },
          ],
        },
      },
      ok,
    ]);
    const events = await collect();
    expect(events).toContainEqual({ type: "message", role: "assistant", text: "Looking at session.ts" });
    expect(events).toContainEqual({ type: "tool", name: "Read", summary: "src/a.ts" });
  });

  it("reports turns and cost on success", async () => {
    sdkYields([init(), ok]);
    const events = await collect();
    expect(events.at(-1)).toMatchObject({ type: "done", turns: 3, costUsd: 0.12, skillUsed: true });
  });

  it("reports a zero-turn credit failure as an error, not a completed review", async () => {
    sdkYields([
      init(),
      { type: "result", subtype: "success", num_turns: 0, total_cost_usd: 0, result: "Credit balance is too low" },
    ]);
    const events = await collect();
    // The API returns "success" having done nothing; calling that done is a lie.
    expect(events.at(-1)).toMatchObject({
      type: "error",
      message: expect.stringContaining("credit balance is too low"),
    });
  });

  it("still reports a real zero-turn success as done", async () => {
    sdkYields([init(), { type: "result", subtype: "success", num_turns: 0, total_cost_usd: 0, result: "No findings." }]);
    const events = await collect();
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });

  it("does not misread a credit mention in a real review as a failure", async () => {
    sdkYields([
      init(),
      { type: "result", subtype: "success", num_turns: 12, total_cost_usd: 0.4, result: "Credit balance is too low is a bad error string in auth.ts" },
    ]);
    const events = await collect();
    expect(events.at(-1)).toMatchObject({ type: "done", turns: 12 });
  });

  it("treats a turn-limit stop as partial, not a hard failure", async () => {
    sdkYields([init(), { type: "result", subtype: "error_max_turns", num_turns: 60 }]);
    const events = await collect();
    expect(events.at(-1)).toMatchObject({ type: "error", partial: true });
  });

  it("ends with an error when the checkout fails, without calling the agent", async () => {
    prepareCheckout.mockRejectedValue(new Error("git clone failed: repository not found"));
    const events = await collect();
    expect(events).toEqual([{ type: "error", message: "git clone failed: repository not found" }]);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("error explanation", () => {
  it("names a zero credit balance, which otherwise reads as a bug", async () => {
    sdkYields([init()]);
    queryMock.mockReturnValue(
      Object.assign(
        (async function* () {
          yield init();
          throw new Error("API Error: Your credit balance is too low to access the API");
        })(),
        { interrupt },
      ),
    );
    const events = await collect();
    expect(events.at(-1)).toMatchObject({
      type: "error",
      message: expect.stringContaining("console.anthropic.com"),
    });
  });

  it("names a rate limit", async () => {
    queryMock.mockReturnValue(
      Object.assign(
        (async function* () {
          yield init();
          throw new Error("429 rate_limit_error");
        })(),
        { interrupt },
      ),
    );
    const events = await collect();
    expect(events.at(-1)).toMatchObject({ message: expect.stringContaining("rate limit") });
  });

  it("scrubs a credential out of an agent error", async () => {
    queryMock.mockReturnValue(
      Object.assign(
        (async function* () {
          yield init();
          throw new Error("failed with github_pat_11ABCDE0123456789abcdefgh");
        })(),
        { interrupt },
      ),
    );
    const events = await collect();
    expect(JSON.stringify(events.at(-1))).not.toContain("github_pat_");
  });
});

describe("cancellation", () => {
  it("interrupts the run when the caller aborts", async () => {
    const controller = new AbortController();
    queryMock.mockReturnValue(
      Object.assign(
        (async function* () {
          yield init();
          controller.abort();
          await new Promise((r) => setTimeout(r, 5));
          yield ok;
        })(),
        { interrupt },
      ),
    );
    await collect({ ...ctx(), signal: controller.signal });
    expect(interrupt).toHaveBeenCalled();
  });
});
