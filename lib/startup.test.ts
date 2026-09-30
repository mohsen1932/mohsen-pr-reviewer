import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ExecCb = (err: Error | null, out?: { stdout: string; stderr: string }) => void;

const execFileMock = vi.fn();
const getAuthenticatedUser = vi.fn();

// promisify resolves with the first callback value, so the mock yields the
// { stdout, stderr } object real execFile produces.
vi.mock("node:child_process", () => ({
  execFile: (cmd: string, args: string[], cb: ExecCb) => execFileMock(cmd, args, cb),
}));
vi.mock("./github", () => ({ getAuthenticatedUser }));

const gitOk = (version = "git version 2.54.0") => {
  execFileMock.mockImplementation((_c: string, _a: string[], cb: ExecCb) =>
    cb(null, { stdout: version, stderr: "" }),
  );
};
const gitMissing = () => {
  execFileMock.mockImplementation((_c: string, _a: string[], cb: ExecCb) =>
    cb(new Error("spawn git ENOENT")),
  );
};

const ENV = ["GITHUB_TOKEN", "OPENAI_API_KEY"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  execFileMock.mockReset();
  getAuthenticatedUser.mockReset();
  gitOk();
  getAuthenticatedUser.mockResolvedValue({ login: "octocat", name: null, avatarUrl: "" });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.unstubAllGlobals();
});

async function report(env: { github?: string; openai?: string } = {}) {
  if (env.github === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = env.github;
  if (env.openai === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = env.openai;
  vi.resetModules();
  const { runStartupChecks } = await import("./startup");
  return runStartupChecks();
}

const ALL = { github: "github_pat_11ABCDE0123456789abcdefgh", openai: "sk-proj-abcdefghijklmnopqrst" };
const check = (r: Awaited<ReturnType<typeof report>>, id: string) =>
  r.checks.find((c) => c.id === id)!;

describe("git check", () => {
  it("passes on a recent version", async () => {
    const r = await report(ALL);
    expect(check(r, "git")).toMatchObject({ ok: true, detail: "2.54" });
  });

  it("passes at exactly the 2.19 minimum", async () => {
    gitOk("git version 2.19.0");
    expect(check(await report(ALL), "git").ok).toBe(true);
  });

  it("fails below the minimum because --filter=blob:none needs it", async () => {
    gitOk("git version 2.18.5");
    const c = check(await report(ALL), "git");
    expect(c.ok).toBe(false);
    expect(c.fix).toContain("--filter=blob:none");
  });

  it("fails on an older major version", async () => {
    gitOk("git version 1.9.1");
    expect(check(await report(ALL), "git").ok).toBe(false);
  });

  it("reports unparseable output rather than assuming", async () => {
    gitOk("not a version string");
    const c = check(await report(ALL), "git");
    expect(c.ok).toBe(false);
    expect(c.problem).toContain("Unrecognized");
  });

  it("reports a missing binary", async () => {
    gitMissing();
    const c = check(await report(ALL), "git");
    expect(c).toMatchObject({ ok: false, problem: "Not found on PATH" });
  });
});

describe("GitHub check", () => {
  it("reports the login on success", async () => {
    const c = check(await report(ALL), "github");
    expect(c).toMatchObject({ ok: true, detail: "@octocat" });
  });

  it("explains how to create a token when unset", async () => {
    const c = check(await report({ openai: ALL.openai }), "github");
    expect(c).toMatchObject({ ok: false, problem: "Not set" });
    expect(c.fix).toContain("fine-grained");
  });

  it("distinguishes a rejected token from other failures", async () => {
    getAuthenticatedUser.mockRejectedValue(new Error("HttpError: Bad credentials"));
    const c = check(await report(ALL), "github");
    expect(c).toMatchObject({ ok: false, problem: "Rejected by GitHub" });
  });

  it("treats a 401 as a rejection", async () => {
    getAuthenticatedUser.mockRejectedValue(new Error("HttpError: 401"));
    expect(check(await report(ALL), "github").problem).toBe("Rejected by GitHub");
  });

  it("surfaces a network failure as itself, with no fix", async () => {
    getAuthenticatedUser.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    const c = check(await report(ALL), "github");
    expect(c.problem).toContain("ENOTFOUND");
    expect(c.fix).toBeUndefined();
  });

  it("never echoes the token in an error", async () => {
    getAuthenticatedUser.mockRejectedValue(new Error(`bad token ${ALL.github}`));
    const c = check(await report(ALL), "github");
    expect(JSON.stringify(c)).not.toContain(ALL.github);
  });
});

describe("OpenAI check", () => {
  it("probes with the key and reports the model", async () => {
    const c = check(await report(ALL), "openai");
    expect(c).toMatchObject({ ok: true, detail: "model: gpt-5.4-mini" });
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/models");
    expect((init.headers as Record<string, string>).authorization).toContain(ALL.openai);
  });

  it("explains how to create a key when unset", async () => {
    const c = check(await report({ github: ALL.github }), "openai");
    expect(c).toMatchObject({ ok: false, problem: "Not set" });
    expect(c.fix).toContain("spend limit");
  });

  it.each([401, 403])("reports %i as a rejected key", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status })));
    const c = check(await report(ALL), "openai");
    expect(c).toMatchObject({ ok: false, problem: "Rejected by OpenAI" });
  });

  it("reports other non-OK statuses with the code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    expect(check(await report(ALL), "openai").problem).toContain("500");
  });

  it("reports a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("fetch failed"); }));
    expect(check(await report(ALL), "openai").problem).toBe("fetch failed");
  });
});

describe("aggregate", () => {
  it("is ready when every check passes", async () => {
    const r = await report(ALL);
    expect(r).toMatchObject({ ready: true, canBrowse: true });
  });

  it("allows browsing without an OpenAI key, but is not ready", async () => {
    const r = await report({ github: ALL.github });
    expect(r).toMatchObject({ ready: false, canBrowse: true });
  });

  it("blocks browsing without a GitHub token", async () => {
    const r = await report({ openai: ALL.openai });
    expect(r).toMatchObject({ ready: false, canBrowse: false });
  });

  it("runs every check even when an earlier one fails", async () => {
    gitMissing();
    const r = await report({});
    expect(r.checks.map((c) => c.id).sort()).toEqual(["git", "github", "openai"]);
    expect(r.checks.every((c) => !c.ok)).toBe(true);
  });

  it("marks all three as blocking reviews", async () => {
    const r = await report(ALL);
    expect(r.checks.every((c) => c.blocksReviews)).toBe(true);
  });
});
