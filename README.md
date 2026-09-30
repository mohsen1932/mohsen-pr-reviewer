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
                        GitHub API
                       ↗          ↘
              PR metadata          PR review
              + patches            + inline comments
                   ↓                     ↑
              Next.js server  ───────────┘
                   ↓
              review agent loop          ← bounded: 20 turns, 15 min
             ↙     ↓      ↘
        search   git     files           ← read-only tools, confined
                   ↓                       to the checkout
                 OpenAI
                   ↓
               findings                  ← validated + anchored to the diff
                   ↓
          human review / edit            ← approve · dismiss · edit · delete
                   ↓
              GitHub review              ← one review, inline comments
```

The agent works against a **real checkout** of the PR head, not just the diff,
so it can grep for a changed function's call sites and read `git log` and
`git blame`. In a four-PR evaluation, three of four findings depended on reading
a file that was not in the diff at all.

Two sources of repository data are kept separate on purpose: the **GitHub API**
supplies what the PR changed — the patches, and therefore which lines a comment
may target — while the **checkout** is only what the agent explores. A finding is
always anchored against the patch, never against the working tree.

Findings carry two independent axes — **disposition** (blocking or non-blocking)
and **category** (correctness, security, performance, …) — because *how urgent*
and *what kind* are different questions.

There is deliberately no "nitpick" disposition. A preference is not worth a
comment on someone's pull request, so the agent is told not to report one at
all — rather than reporting it and having you filter it out.

Comments post in [Conventional Comments](https://conventionalcomments.org/) form:

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
│ │ [ Review again ]           5 turns · $0.0071 · 40s · cache 81%      │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│ Findings   1 blocking · 0 non-blocking               [Approve blocking] │
│                                                                          │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ ▾ src/hooks/usePeople.js                              1 blocking     │ │
│ ├──────────────────────────────────────────────────────────────────────┤ │
│ │ ● blocking   correctness                                        :7   │ │
│ │                                                                      │ │
│ │ staleTime does not keep people queries cached for 30 minutes         │ │
│ │ ┌──────────────────────────────────────────────────────────────────┐ │ │
│ │ │    5     refetchOnWindowFocus: false,                            │ │ │
│ │ │ ▎  7 +   staleTime: 30 * 60 * 1000,                              │ │ │
│ │ │    8   });                                                       │ │ │
│ │ └──────────────────────────────────────────────────────────────────┘ │ │
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
│ ▸ Dismissed  2                                                           │
│                                                                          │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ 1 finding approved   1B · 0N                   [ Post 1 comment ]    │ │
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

### 5. Use it

1. **Pick a repository.** The list shows everything your token can reach, most
   recently pushed first, with private ones badged. You can also paste any
   `github.com` URL — including a link straight to a pull request.
2. **Pick an open pull request.**
3. **Review this PR.** Progress streams as the agent works: cloning, then each
   file it reads or searches. Findings appear as it discovers them, so the panel
   is usable before the run finishes. Expect seconds to a couple of minutes.
4. **Triage.** Each finding shows the diff lines it is about. Approve, dismiss,
   edit, or delete — and nothing is sent until you approve it.
5. **Post.** A confirm dialog shows the count by disposition and the target PR.
   One GitHub review is created, with your approved findings as inline comments.
   The panel then locks: posted findings are a record of what was sent, so
   further comments mean a new review.

Reviews survive a page refresh but not a closed tab — see
[Persistence](./SPEC.md#13-persistence-and-what-it-costs).

### The CLI

The fastest way to iterate on the rubric, since it skips the browser entirely:

```bash
npm run review -- owner/repo#42
```

It prints the same events the UI consumes — progress, each tool call, findings
with their classification, and a summary line with turns, cost and cache hit
rate.

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

## Evaluating review quality

There is no automated eval harness. Review quality is judged by running the
agent against real pull requests and reading what comes back — which is the only
method that tests the thing that matters, since a synthetic fixture cannot tell
you whether a finding is *worth a reviewer's time*.

### The method

```bash
npm run review -- owner/repo#42
```

Pick pull requests that span the shapes you care about — a small bugfix, a
security-adjacent change, a medium feature, a large one — and judge each finding
on three things:

| Question | What a good answer looks like |
|---|---|
| **Is it real?** | You can follow the reasoning to the code and agree |
| **Is it classified honestly?** | `blocking` carries a failure scenario you could reproduce |
| **Would you have posted it?** | Precision is the metric; one plausible finding beats five hedged ones |

A run that reports **nothing** on a correct change is a good outcome, not a
failed test. The agent refusing to invent a finding is exactly the behaviour
worth preserving.

### What was measured

Four public pull requests, chosen for variety rather than convenience:

| Pull request | Shape | Findings | Verdict |
|---|---|---|---|
| A one-line config change | 2 lines | 1 | Real — a cache-semantics bug the diff alone would not show |
| `expressjs/express#7479` | 33 lines, parser fix | 1 | Real — escaped-backslash parity in a new helper |
| `axios/axios#11134` | 17 lines, header handling | 0 → 1 | Correctly found nothing, then a real gap after rubric tuning |
| `colinhacks/zod#5995` | 58 lines, 4 files | 2 | Both real |

**Five findings, no false positives.** Three of the four depended on reading a
file that was not in the diff, which is the case for having a checkout at all.

> [!NOTE]
> Those numbers were measured on an earlier engine. The current one
> (`gpt-5.4-mini` with hand-built tools) has been spot-checked on two of the four
> and found the same bugs — `expressjs/express#7479` in 9 turns for $0.063 — but
> the full evaluation has not been re-run. Treat the table as a baseline to beat,
> not a current claim.

### What tuning looked like

Two changes came out of running it, neither of which a unit test would have
caught:

- **Proportionality.** Cost tracked investigation depth, not diff size: a
  17-line change was the most expensive of the four because verifying it meant
  tracing every write path. Telling the agent to match effort to the change cut
  that review from 483s to 278s *and* found one more real issue.
- **Excluded files.** A review of a dependabot PR burned all 20 turns hunting
  for a `package-lock.json` that the file selection deliberately excludes. Naming
  exclusions to the agent took the same PR from 20 fruitless turns to a finding
  in 11.

## Security

### Local-only by design

- **Credentials are server-side environment variables** and are never exposed to
  browser or client code. No client component imports the config module, there
  are no `NEXT_PUBLIC_` variables, and neither credential appears in the built
  client bundle.
- **The application binds to `127.0.0.1` by default.** Both `npm run dev` and
  `npm run start` pass `--hostname 127.0.0.1` explicitly, because Next otherwise
  binds `0.0.0.0` and advertises a LAN URL.
- **There is no authentication**, and that is why the two points above matter.
  The running server hands its credentials to anyone who can reach it. Do not
  pass `--hostname 0.0.0.0`, and do not put it behind a tunnel. Making this
  multi-user means real per-user auth — a different application.

### The agent reviews code someone else wrote

Its entire capability surface is six read-only tools: `read_file`, `search`,
`list_files`, `git_log_for_file`, `git_blame`, `report_finding`. No shell, no
writes, no network. The tool table *is* the allowlist — the loop refuses to
dispatch a name that is not in it.

Every path the agent names passes through `resolveInside()`, which rejects
absolute paths, traversal, NUL bytes, and anything resolving outside the
checkout — including `.git/`, which holds credential configuration. Nothing in a
checkout is ever executed: no install, no build, no test run.

A pull request can contain text shaped like instructions. The tool surface bounds
what that can do, and the real backstop is that **no comment reaches GitHub
without you approving it**.

### Two things to be deliberate about

**Your private source leaves your machine.** A review sends the diff, and any
file the agent opens, to the OpenAI API. That is inherent to the design, not a
leak — but it is a decision to make knowingly for proprietary or client code, and
it may be governed by your employer's policy on third-party AI services.

**`.cache/repos/` holds private source in plaintext.** It persists between runs
so `git log` and `git blame` keep working, and it accumulates every repository
you have reviewed. It is gitignored but not encrypted beyond whatever full-disk
encryption you already have. The repo list shows its size with a **Clear cache**
button.

### Other measures

- The GitHub token never reaches `git`'s argv or `.git/config`. It is passed as
  git config through the environment, so `ps` cannot see it, and both credentials
  are stripped from the git subprocess entirely.
- Finding bodies are model output derived from a diff an attacker can write, so
  they render without raw HTML and every URL is checked against a scheme
  allowlist.
- Scope the token: a fine-grained PAT limited to the repos you actually review
  bounds what a bug or a prompt injection can reach.

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
