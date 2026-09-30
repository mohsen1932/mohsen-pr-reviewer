# Local PR Reviewer

An AI pull-request reviewer that runs on your own machine. Pick a repository,
pick an open PR, let an agent review it, triage what it found, and post the
comments you approve back to GitHub as a single review.

Reviews run an agent loop against a **real checkout** of the PR head, so the
agent can grep for a changed function's call sites and read `git log` and
`git blame` — not just the diff. That is where most of the findings come from:
in a four-PR evaluation, three of four findings depended on reading a file that
was not in the diff at all.

> [!WARNING]
> **This is a local-only tool with no authentication.** It runs with your GitHub
> token and your OpenAI key, and anyone who can reach the port has both. See
> [Security](#security) before running it anywhere but your own machine.

---

## How it works

```
  browse repos ──▶ open PRs ──▶ pick a PR
                                    │
                                    ▼
        ┌───────────────────────────────────────────────┐
        │  shallow-ish clone of the PR head              │
        │  agent loop: read_file · search · list_files   │
        │              git_log · git_blame               │
        │              report_finding                    │
        └───────────────────────────────────────────────┘
                                    │
                    findings stream in, grouped by file
                                    ▼
        approve · dismiss · edit · delete · add your own
                                    ▼
              one GitHub review, with inline comments
```

Findings carry two independent axes — **disposition** (blocking / non-blocking /
nitpick) and **category** (correctness, security, performance, …) — because *how
urgent* and *what kind* are different questions. Comments post in
[Conventional Comments](https://conventionalcomments.org/) form:

```
**issue (blocking):** Session token compared with ==

`compareTokens()` is not constant-time, so response timing leaks the token
prefix byte by byte.

*Failure:* 256 guesses per byte position recovers the token in ~8k requests.
```

Nothing is posted without you approving it, one finding at a time.

### The review screen

<!-- TODO: replace with a screenshot — see TASKS.md T8.5 -->

```
┌──────────────────────────────────────────────────────────────────────────┐
│ PR  PR Reviewer   local                                      @mohsen1932 │
├──────────────────────────────────────────────────────────────────────────┤
│ ← mohsen1932/r-query-starwars                                            │
│                                                                          │
│ #1  Use staleTime for the people query                                   │
│ @SirwanAfifi · enable-30-mins-cache → main · 91f73d3 · GitHub ↗           │
│                                                                          │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ [ Review again ]   5 turns · $0.0071 · 40s · cache 81%    ☐ Hide nits│ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│ Findings   1 blocking · 0 non-blocking · 0 nitpick    [Approve blocking] │
│                                                                          │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ ▾ src/hooks/usePeople.js                              1 blocking     │ │
│ ├──────────────────────────────────────────────────────────────────────┤ │
│ │ ● blocking   correctness                                        :7   │ │
│ │                                                                      │ │
│ │ staleTime does not keep people queries cached for 30 minutes         │ │
│ │                                                                      │ │
│ │ staleTime only controls freshness; it does not keep inactive         │ │
│ │ queries in the cache. The query still uses the default 5-minute      │ │
│ │ cacheTime, so data is evicted well before the intended window.       │ │
│ │                                                                      │ │
│ │ │ Failure: a user opens a movie page, leaves for 6 minutes and       │ │
│ │ │ returns; the people data has already been evicted, so the UI       │ │
│ │ │ refetches instead of rendering from cache.                         │ │
│ │                                                                      │ │
│ │ [ Approve ] [ Dismiss ] [ Edit ]                          [ Delete ] │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│ ▸ Dismissed  2                            + Add your own finding         │
│                                                                          │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ 1 finding approved   1B · 0N · 0n              [ Post 1 comment ]    │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

Dark theme throughout. The disposition dot is the only colour-coded element and
never carries meaning alone — the word sits next to it.

---

## Setup

### 1. Requirements

- **Node 20+** — `.nvmrc` pins 22.12.0, so `nvm use` is enough
- **git ≥ 2.19** on `PATH` — the clone uses `--filter=blob:none`
- Disk space for `.cache/repos/`, which holds one checkout per repo reviewed

### 2. GitHub token

Create a **fine-grained personal access token** at
[github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new):

| Setting | Value |
|---|---|
| Repository access | **All repositories** |
| Contents | Read-only |
| **Pull requests** | **Read and write** |
| Metadata | Read-only *(automatic)* |

`Pull requests: write` is the one people miss — read-only lets you browse
everything and then fails at the very last step, when posting.

> **If an organization's repos are missing**, that is org policy, not the token.
> Many orgs require an owner to approve fine-grained tokens, and until they do
> those repos return **404, not 403** — indistinguishable from a typo. The
> fallback is a classic PAT with the `repo` scope, authorized for that org under
> Configure SSO.

### 3. OpenAI key

From [platform.openai.com](https://platform.openai.com). **Set a spend limit** —
this app is the key's only consumer, and a runaway review loop spends real money.

### 4. Run it

```bash
nvm use
npm install
cp .env.example .env    # then fill in the two credentials
npm run dev             # http://127.0.0.1:3000
```

The app validates git, the GitHub token and the OpenAI key at startup and tells
you exactly which one is missing or rejected.

There is also a CLI, which is the fastest way to iterate on the prompt:

```bash
npm run review -- owner/repo#42
```

---

## Configuration

Everything but the two credentials is optional.

```bash
GITHUB_TOKEN=github_pat_...   # fine-grained PAT, see above
OPENAI_API_KEY=sk-proj-...    # set a spend limit

REVIEW_MODEL=gpt-5.4-mini     # default
REVIEW_EFFORT=high            # minimal | low | medium | high | xhigh
CACHE_DIR=./.cache/repos      # where checkouts live
```

---

## What a review costs

Measured on real pull requests with `gpt-5.4-mini` at `effort: high`:

| Pull request | Turns | Time | Cost | Cache hit |
|---|---|---|---|---|
| 2-line config change | 5 | 40s | $0.007 | 81% |
| Same PR, cold clone | 8 | 69s | $0.021 | 82% |
| Dependabot bump, larger repo | 11 | 105s | $0.043 | 85% |

**Cost tracks investigation depth, not diff size.** A small change that needs
careful verification costs more than a large one that does not. Every turn
re-sends the accumulated transcript, which is why the cache hit rate is reported
on every run — it is the first number to look at when a review seems expensive,
and the only lever that reduces cost without trading quality.

`reasoning_effort` is the other lever, and it is not free: on an earlier engine,
the same PR at `medium` ran a third cheaper and **missed a real finding**. Bounds
are 20 turns and 15 minutes; both end the run as a *partial* review with the
findings so far kept, never discarded.

---

## Security

This is a single-user local tool, which removes most of a web app's threat
model. What remains is worth being deliberate about.

**It has no authentication.** The running server hands its credentials to
anyone who can reach it. `npm run dev` binds to `127.0.0.1` on purpose — do not
pass `--hostname 0.0.0.0`, and do not put it behind a tunnel. Making this
multi-user means real per-user auth, which is a different application.

**Your private source leaves your machine.** A review sends the diff, and any
file the agent opens, to the OpenAI API. That is inherent to the design, not a
leak — but it is a decision to make knowingly for proprietary or client code, and
it may be governed by your employer's policy on third-party AI services.

**`.cache/repos/` holds private source in plaintext.** It persists between runs
by design, so `git log` and `git blame` keep working, and it accumulates every
repository you have ever reviewed. It is gitignored but not encrypted beyond
whatever full-disk encryption you already have. The repo list shows its size
with a **Clear cache** button.

**The agent reviews code someone else wrote.** Its entire capability surface is
six read-only tools — no shell, no writes, no network — and every path it names
is confined to the checkout, including a refusal to read `.git/`. A pull request
can contain text shaped like instructions; the real backstop is that nothing
reaches GitHub without you approving it.

**Scope the token.** A fine-grained PAT limited to the repos you actually review
bounds what a bug or a prompt injection can reach.

---

## Development

```bash
npm run check        # typecheck + lint + coverage gate — before every commit
npm run test:watch   # vitest in watch mode
npm run review -- owner/repo#42
```

Logic ships with unit tests at a minimum of 80% coverage, enforced in
`vitest.config.mts`. Every external boundary — GitHub, git, the OpenAI API — is
mocked, so the suite runs offline with no credentials.

Security invariants are tested **negatively**: that the token is absent from
argv and from the git subprocess environment, that an out-of-tree path is
refused, that a `javascript:` URL renders inert. Those are the cases a refactor
breaks silently.

## Status

All eight milestones are done — browse, review, triage, post — verified end to
end against a real pull request. 631 tests, 95.4% coverage.

What is deliberately not here: no database, so a review cannot be resumed after
a refresh and there is no history. No webhooks, no automatic review on PR open,
no suggested-change patches. [BACKLOG.md](./BACKLOG.md) has the open decisions
and the ideas that were ruled out, with reasons.

## Documentation

| File | Contents |
|---|---|
| [SPEC.md](./SPEC.md) | Architecture and behaviour — the source of truth |
| [TASKS.md](./TASKS.md) | Implementation checklist, M1–M8 |
| [BACKLOG.md](./BACKLOG.md) | Decisions with their rationale, deferred ideas, ruled-out list |
| [CLAUDE.md](./CLAUDE.md) | Orientation and security invariants for AI agents |
