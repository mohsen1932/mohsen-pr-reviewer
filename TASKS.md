# Tasks

Implementation checklist for [SPEC.md](./SPEC.md). Open questions and future
ideas live in [BACKLOG.md](./BACKLOG.md) — nothing here is speculative; every task
below is required by the spec.

Milestones match SPEC.md §15 and are ordered by dependency. Each is independently
runnable: finish one and you have something you can use.

**Assumed setup** (do these once before T1.1, they are not tasks):

- A **fine-grained PAT** with access to **all repositories**, with Contents: Read,
  Pull requests: Read and write (§5)
- An OpenAI API key with a spend limit (§5, §11)
- `git` ≥ 2.19 on `PATH` — needed for `--filter=blob:none` (§7.2)

**Every milestone ships with unit tests** covering the logic it adds — 80%
minimum, enforced by `vitest.config.mts` (§16). `npm run check` runs typecheck,
lint, and the coverage gate; a milestone whose `check` fails is not done.

**Legend:** `§n` = SPEC.md section · ⚠️ = security-critical, do not defer

---

## M1 — Scaffold + credentials

**✅ Complete.** Next 16.3.7 / React 19 / Tailwind 4, Node 22.12.0 (`.nvmrc`).

**Done when:** `.env` is read, startup validation reports precisely what is
missing, and `/repos` shows your GitHub login.

- [x] **T1.1** `create-next-app` — Next.js 15, App Router, TypeScript, Tailwind.
      Node 20+ (§4)
- [x] **T1.2** `.gitignore`: `.env`, `.cache/`, `node_modules` ⚠️ (§12, §14)
- [x] **T1.3** `.env.example` with all five keys and empty values (§14)
- [x] **T1.4** `lib/config.ts` — read and type `GITHUB_TOKEN`, `OPENAI_API_KEY`,
      `REVIEW_MODEL`, `REVIEW_EFFORT`, `CACHE_DIR` with defaults (§14)
- [x] **T1.5** `lib/github.ts` — module-level Octokit from `GITHUB_TOKEN` (§3, §6)
- [x] **T1.6** `lib/startup.ts` — validate on boot: `git` on `PATH`, `GET /user`
      for the token, `GET /v1/models` probe for the OpenAI key (§14)
- [x] **T1.7** `SetupNotice.tsx` — one message per missing or rejected
      credential, plus missing `git` (§14)
- [x] **T1.8** `app/page.tsx` — redirect to `/repos`, or render setup notice
- [x] **T1.9** ⚠️ Credential scrubbing helper — no error path may echo a token or
      key; an OpenAI 401 renders as "invalid key" (§12)
- [x] **T1.11** Vitest + `@vitest/coverage-v8`, 80% thresholds, `npm run check` (§16)
- [x] **T1.12** Unit tests for `scrub`, `config`, `github`, `startup` — including
      negative assertions that a failing check never echoes a credential (§12, §16)
- [x] **T1.10** Bind check: confirm dev server is localhost-only; document it ⚠️ (§12)

---

## M2 — Repo + PR browsing

**✅ Complete.** 266 tests, 99.6% coverage.

**Done when:** you can browse from repo list → open PRs → a PR's diff, for a
private repo.

- [x] **T2.1** `GET /api/repos` — `affiliation=...&visibility=all&sort=pushed`,
      **paginate to completion** (§6)
- [x] **T2.2** `app/repos/page.tsx` — RSC list + client-side filter box
- [x] **T2.3** `RepoList.tsx` — private/public badge, owner login, pushed-at (§6, §10)
- [x] **T2.4** `lib/repo-url.ts` — parse all five URL forms, including
      `/pull/42` deep-link (§6)
- [x] **T2.5** `POST /api/repos/resolve` — validate access, return
      `{owner, repo, pullNumber?}` (§9)
- [x] **T2.6** `GET /api/repos/:owner/:repo/pulls` + `PrList.tsx` (§6, §9)
- [x] **T2.7** `GET /api/repos/:owner/:repo/pulls/:number` — metadata, changed
      files, patches (§6, §9)
- [x] **T2.8** `lib/diff.ts` — parse patches into hunks; the foundation for
      anchoring (§8.5)
- [x] **T2.9** File skip list — lockfiles, minified, `linguist-generated`, binary (§11)
- [x] **T2.10** Size limits — 60 files / ~400 KB / 64 KB per patch, with explicit
      refusal rather than silent truncation (§11)
- [x] **T2.11** ⚠️ Validate `owner`/`repo` against `^[A-Za-z0-9._-]+$` before
      Octokit (§12)
- [x] **T2.12** PR detail page — header, diff summary, changed-file list

- [x] **T2.13** Tests: URL parsing (all five forms), hunk parsing, skip list, size limits (§16)
---

## M3 — Checkout + agent

**✅ Complete.** Rebuilt on the OpenAI API. Verified against a real private repo.

**Done when:** a CLI script clones a PR head and runs `query()` against it,
printing raw SDK messages.

- [x] **T3.1** `lib/checkout.ts` — cache at `.cache/repos/<owner>/<repo>`,
      `git clone --filter=blob:none --no-checkout` (§7.2)
- [x] **T3.2** Fetch `pull/<n>/head` (covers fork PRs), `git checkout --detach <head_sha>` (§7.2)
- [x] **T3.3** ⚠️ Auth clones with per-invocation `http.extraHeader` — the token
      must never land in `.git/config` (§7.2, §12)
- [x] **T3.4** Repo-size guard (2 GB) — refuse rather than fill the disk (§11)
- [x] **T3.5** ⚠️ Confine checkout paths to `CACHE_DIR`, no-`..` check (§12)
- [x] **T3.6** Tool `git_log_for_file` — fixed args, read-only (§7.4)
- [x] **T3.7** Tool `git_blame` — fixed args, read-only (§7.4)
- [x] **T3.8** Tool table + dispatcher, including `read_file` / `search` / `list_files` (§7.4)
- [x] **T3.9** `lib/review/engine.ts` — explicit agent loop over
      `chat.completions` with tools, effort, and bounds (§7.3)
- [x] **T3.10** ⚠️ **`settingSources: []`** — never load `.claude/` from the
      cloned repo. Single most important line in the options (§7.5, §12)
- [x] **T3.11** ⚠️ The loop refuses to dispatch any tool name outside the table —
      the table *is* the allowlist (§7.4, §12)
- [x] **T3.12** Review rubric in `lib/review/instructions.ts`, sent as the system
      message (§7.5)
- [x] **T3.13** Per-model pricing table; an unmodelled model reports a null cost
      rather than a wrong one (§11)
- [x] **T3.14** `scripts/review.ts` — CLI harness taking `owner/repo#n`
- [x] **T3.15** Wall-clock cap (15 min) and `MAX_TURNS`, both ending as partial (§11)

- [x] **T3.16** ⚠️ Tests: path confinement, token absent from `.git/config` and
      from argv, tool argument safety, undispatchable tool names (§12, §16)
---

## M3b — Findings

**✅ Complete.** Rubric tuned against 4 real PRs on the previous engine; the
rubric itself carried over unchanged.

**Done when:** the CLI prints validated, anchored findings as JSON.

- [x] **T3b.1** `lib/findings/schema.ts` — `Disposition`, `Category`,
      `FindingSchema` (§8.1, §8.2)
- [x] **T3b.2** Classification constraints — `style` ⇒ `nitpick`; `security` ⇏
      `nitpick`; `blocking` ⇒ `failureScenario` required (§8.1, §8.2)
- [x] **T3b.3** `report_finding` tool — validate, return an error result with a
      usable message so the agent fixes or downgrades (§7.4)
- [x] **T3b.4** `lib/review/anchor.ts` — file-in-PR check, hunk range check,
      ±3-line snap, `lineValid: false` fallback (§8.5)
- [x] **T3b.5** `ReviewEvent` types + `reviewPullRequest()` async iterable (§3)
- [x] **T3b.6** Map loop events → `status` / `finding` / `done` / `error`,
      including the turn limit and timeout as *partial* results (§7.6, §11)
- [x] **T3b.7** Iterate the rubric against 3–5 real PRs; tune for precision (§7.5)

- [x] **T3b.8** Tests: schema constraints, `report_finding` rejection paths, anchoring (in-hunk / snap / unsnappable / not-in-PR) (§16)
---

## M4 — Review UI

**✅ Complete.** Verified end to end: a real review streams into the panel.

**Done when:** findings stream in, grouped by file, with disposition and
category chips.

- [x] **T4.1** `POST /api/review` — SSE route, Node runtime (§7.6, §9)
- [x] **T4.2** 15s `: heartbeat` comment (§7.6)
- [x] **T4.3** `useReviewStream` hook — parse SSE, handle drops (§10, §11)
- [x] **T4.4** `ReviewPanel.tsx` — `useReducer` + `sessionStorage` mirror (§3, §10)
- [x] **T4.5** `FileGroup.tsx` — collapsible, per-disposition counts in header (§10)
- [x] **T4.6** `FindingCard.tsx` — disposition + category chips, body, action row (§10)
- [x] **T4.7** Grouping and ordering — disposition, then category priority, then
      line; groups by worst disposition (§8.4)
- [x] **T4.8** ⚠️ Markdown renderer with **raw HTML and `javascript:` disabled**.
      Finding bodies derive from attacker-influencable repo content (§12)
- [x] **T4.9** Progress display from `status` and `tool` events, with a bounded
      recent-activity list
- [x] **T4.10** Accessibility: disposition never conveyed by colour alone (§10)

- [x] **T4.11** Tests: SSE parsing, event→state mapping, grouping and ordering (§16)
---

## M5 — Triage

**✅ Complete.** 65 tests across the reducer, edit rules and persistence.

**Done when:** approve / dismiss / delete / edit / add all work and survive a
refresh.

- [x] **T5.1** State machine — `pending` / `approved` / `dismissed` + hard delete (§8.3)
- [x] **T5.2** `FindingEditor.tsx` — body, title, disposition, category, line (§8.3, §10)
- [x] **T5.3** Re-anchor on line edit; inline error when the new line is not in
      the diff (§8.3, §8.5)
- [x] **T5.4** `edited: true` marker on the card (§8.3)
- [x] **T5.5** `DismissedDrawer.tsx` — collapsed, restorable (§8.3, §10)
- [x] **T5.6** Delete + ~10s undo toast — the only destructive action, the only
      undo (§8.3, §10)
- [x] **T5.7** `AddFinding.tsx` — author a finding on any diff line,
      `origin: "user"`, visibly marked (§8.2, §8.3)
- [x] **T5.8** Bulk actions — approve all blocking; per-group approve/dismiss;
      delete all nitpicks (§10)
- [x] **T5.9** `DispositionFilter.tsx` + "hide nitpicks" toggle (§8.4, §10)
- [x] **T5.10** `lib/review/persist.ts` — round-trip verified for edits, triage
      status, and a hostile storage; keyed by head sha so a pushed-to PR starts clean

- [x] **T5.11** Tests: every lifecycle transition incl. delete + undo; reducer extracted to `lib/` to be testable (§8.3, §16)
---

## M6 — Post to GitHub

**Code complete; not yet posted to a real PR.** 47 tests cover rendering, the
posting path and the route. The one thing tests cannot prove is that GitHub
accepts the payload — that needs a live post, which is outward-facing and
awaiting a decision.

**Done when:** one review with inline comments lands on a real PR.

- [x] **T6.1** `lib/findings/render.ts` — Conventional Comments format per
      disposition (§6)
- [x] **T6.2** `POST /api/review/post` (§9)
- [x] **T6.3** ⚠️ Server-side re-validation — anchors, file-in-PR, classification
      well-formed (§8.5, §9, §12)
- [x] **T6.4** Build `comments[]` and call `createReview` **once** with
      `commit_id: headSha` (§6)
- [x] **T6.5** Review body — counts by disposition + a "General" section for
      `lineValid: false` findings (§6, §8.5)
- [x] **T6.6** Event selection — `COMMENT` default; offer `REQUEST_CHANGES` when
      approved findings include `blocking` (§6)
- [x] **T6.7** Hide `REQUEST_CHANGES` when the PR author is the authenticated
      user; handle the 422 with one-click retry as `COMMENT` (§6)
- [x] **T6.8** Confirm dialog — comment count broken down by disposition (§10)
- [x] **T6.9** Head-moved handling — `commit_id` mismatch → offer re-review (§11)
- [x] **T6.10** Post-success lock + link to the review on GitHub (§10)

- [x] **T6.11** Tests: Conventional Comments rendering per disposition, review body assembly, own-PR event selection (§16)
---

## M7 — Polish

**✅ Complete.** Cache control verified live: 40.1 MB reported, cleared, gone.

**Done when:** every row of the §11 failure table has a real UI state.

- [x] **T7.1** GitHub 401 → setup screen (§11)
- [x] **T7.2** GitHub 403 rate-limited → show `x-ratelimit-reset` time (§11)
- [x] **T7.3** GitHub 403/404 on a repo → "no access — check the token covers
      this repo" (§11)
- [x] **T7.4** `git` missing / clone / fetch failures named by step (§11)
- [x] **T7.5** Corrupt cache → delete and re-clone once, then report (§11)
- [x] **T7.6** Turn limit / timeout / cancel → partial review banner, findings kept (§11)
- [x] **T7.7** Cost display — `total_cost_usd`, `num_turns`, `usage` on `done` (§11)
- [x] **T7.8** "Clear cache" action; show `.cache/repos/` size ⚠️ (§12)
- [x] **T7.9** Empty and loading states for every list
- [x] **T7.10** Cancel-review button; aborts the loop and the server run (§11)

---

## M8 — README

**Done when:** someone else could set this up on their machine from the README.

- [ ] **T8.1** Setup: fine-grained PAT with the exact permissions, spend limit,
      `git` requirement (§5, §14)
- [ ] **T8.2** ⚠️ Document that it is **local-only and unauthenticated** — never
      expose the port (§12, §14)
- [ ] **T8.3** ⚠️ Document that private source is sent to the OpenAI API and
      cached in plaintext under `.cache/` (§12)
- [ ] **T8.4** Cost expectations — 2–5 min and tens of cents per review (§11)
- [ ] **T8.5** Screenshot of the review screen

---

## Cross-cutting

Not a milestone; verify these hold at every step.

- [ ] **X.1** ⚠️ No credential ever reaches a client component prop, a JSON
      response, or a log line (§12)
- [ ] **X.2** ⚠️ The agent never gets `Bash`, `Write`, `Edit`, `WebFetch`, or
      `WebSearch` (§7.4, §12)
- [ ] **X.3** ⚠️ Nothing in a checkout is ever executed — no install, build, or
      test run (§12)
- [ ] **X.4** One Zod schema shared by the tool, the API, and the UI — no
      duplicate type definitions (§4, §8.2)
- [ ] **X.5** Nothing writes to a repository except the single `createReview`
      call (§12)
