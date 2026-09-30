import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Cb = (err: Error | null, out?: { stdout: string; stderr: string }) => void;
const execFileMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: (cmd: string, args: string[], opts: unknown, cb: Cb) =>
    execFileMock(cmd, args, opts, cb),
}));

const TOKEN = "github_pat_11ABCDE0123456789abcdefgh";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = TOKEN;
  execFileMock.mockReset();
  execFileMock.mockImplementation((_c, _a, _o, cb: Cb) =>
    cb(null, { stdout: "ok", stderr: "" }),
  );
});

afterEach(() => {
  if (saved === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = saved;
});

async function load() {
  vi.resetModules();
  return import("./git");
}

const lastCall = () => execFileMock.mock.calls.at(-1)!;
const lastArgs = () => lastCall()[1] as string[];
const lastEnv = () => (lastCall()[2] as { env: Record<string, string> }).env;

describe("argument safety", () => {
  it("invokes the git binary with an argument array, never a shell string", async () => {
    const { git } = await load();
    await git(["log", "--oneline"], { step: "log" });
    expect(lastCall()[0]).toBe("git");
    expect(Array.isArray(lastArgs())).toBe(true);
    // No shell means nothing in a path can be interpreted as a command.
    expect(lastCall()[2]).not.toHaveProperty("shell", true);
  });

  it("passes arguments through unmodified", async () => {
    const { git } = await load();
    await git(["blame", "-L", "1,20", "--", "src/a b;rm -rf /.ts"], { step: "blame" });
    expect(lastArgs()).toEqual(["blame", "-L", "1,20", "--", "src/a b;rm -rf /.ts"]);
  });
});

describe("credential handling", () => {
  it("never puts the token in argv, where ps would expose it", async () => {
    const { git } = await load();
    await git(["clone", "https://github.com/o/r.git", "/tmp/x"], {
      step: "clone",
      authenticated: true,
    });
    expect(lastArgs().join(" ")).not.toContain(TOKEN);
    expect(lastArgs().some((a) => a.startsWith("-c"))).toBe(false);
  });

  it("supplies the credential as a git config env var", async () => {
    const { git } = await load();
    await git(["fetch"], { step: "fetch", authenticated: true });
    const env = lastEnv();
    expect(env.GIT_CONFIG_COUNT).toBe("1");
    expect(env.GIT_CONFIG_KEY_0).toBe("http.extraHeader");
    const expected = Buffer.from(`x-access-token:${TOKEN}`).toString("base64");
    expect(env.GIT_CONFIG_VALUE_0).toBe(`Authorization: Basic ${expected}`);
  });

  it("omits the credential entirely for local operations", async () => {
    const { git } = await load();
    await git(["log"], { step: "log" });
    const env = lastEnv();
    expect(env.GIT_CONFIG_COUNT).toBeUndefined();
    expect(JSON.stringify(env)).not.toContain(TOKEN);
  });

  it("never embeds the token in the clone URL", async () => {
    const { cloneUrl } = await load();
    const url = cloneUrl("owner", "repo");
    // A credential in the URL would be written into .git/config and outlive
    // the review (SPEC.md §7.2).
    expect(url).toBe("https://github.com/owner/repo.git");
    expect(url).not.toContain("@");
  });

  it("disables interactive credential prompts so a failure cannot hang", async () => {
    const { git } = await load();
    await git(["fetch"], { step: "fetch", authenticated: true });
    expect(lastEnv().GIT_TERMINAL_PROMPT).toBe("0");
  });
});

describe("failures", () => {
  it("reports stderr and names the step", async () => {
    execFileMock.mockImplementation((_c, _a, _o, cb: Cb) =>
      cb(Object.assign(new Error("exit 128"), { stderr: "fatal: repository not found" })),
    );
    const { git, GitError } = await load();
    await expect(git(["clone"], { step: "clone" })).rejects.toBeInstanceOf(GitError);
    await expect(git(["clone"], { step: "clone" })).rejects.toMatchObject({
      step: "clone",
      message: "fatal: repository not found",
    });
  });

  it("truncates a long stderr to the first lines", async () => {
    execFileMock.mockImplementation((_c, _a, _o, cb: Cb) =>
      cb(Object.assign(new Error("x"), { stderr: "l1\nl2\nl3\nl4\nl5" })),
    );
    const { git } = await load();
    await expect(git(["fetch"], { step: "fetch" })).rejects.toThrow("l1 l2 l3");
  });

  it("falls back to the error message when stderr is empty", async () => {
    execFileMock.mockImplementation((_c, _a, _o, cb: Cb) => cb(new Error("spawn ENOENT")));
    const { git } = await load();
    await expect(git(["log"], { step: "log" })).rejects.toThrow("spawn ENOENT");
  });
});
