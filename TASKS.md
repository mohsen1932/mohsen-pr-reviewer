# Tasks

Implementation checklist for [SPEC.md](./SPEC.md). Open questions and future
ideas live in [BACKLOG.md](./BACKLOG.md) — nothing here is speculative; every task
below is required by the spec.

Milestones match SPEC.md §15 and are ordered by dependency. Each is independently
runnable: finish one and you have something you can use.

**Assumed setup** (do these once before T1.1, they are not tasks):

- A **fine-grained PAT** with access to **all repositories**, with Contents: Read,
  Pull requests: Read and write (§5)
- An Anthropic API key with a spend limit (§5, §11)
- `git` ≥ 2.19 on `PATH` — needed for `--filter=blob:none` (§7.2)

**Legend:** `§n` = SPEC.md section · ⚠️ = security-critical, do not defer

---

## M1 — Scaffold + credentials

**Done when:** `.env` is read, startup validation reports precisely what is
missing, and `/repos` shows your GitHub login.

- [ ] **T1.1** `create-next-app` — Next.js 15, App Router, TypeScript, Tailwind.
      Node 20+ (§4)
- [ ] **T1.2** `.gitignore`: `.env`, `.cache/`, `node_modules` ⚠️ (§12, §14)
- [ ] **T1.3** `.env.example` with all five keys and empty values (§14)
- [ ] **T1.4** `lib/config.ts` — read and type `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`,
      `REVIEW_MODEL`, `REVIEW_EFFORT`, `CACHE_DIR` with defaults (§14)
- [ ] **T1.5** `lib/github.ts` — module-level Octokit from `GITHUB_TOKEN` (§3, §6)
- [ ] **T1.6** `lib/startup.ts` — validate on boot: `git` on `PATH`, `GET /user`
      for the token, one-turn probe for the Anthropic key (§14)
- [ ] **T1.7** `SetupNotice.tsx` — one message per missing or rejected
      credential, plus missing `git` (§14)
- [ ] **T1.8** `app/page.tsx` — redirect to `/repos`, or render setup notice
- [ ] **T1.9** ⚠️ Credential scrubbing helper — no error path may echo a token or
      key; an Anthropic 401 renders as "invalid key" (§12)
- [ ] **T1.10** Bind check: confirm dev server is localhost-only; document it ⚠️ (§12)

---

## M2 — Repo + PR browsing

**Done when:** you can browse from repo list → open PRs → a PR's diff, for a
private repo.

- [ ] **T2.1** `GET /api/repos` — `affiliation=...&visibility=all&sort=pushed`,
      **paginate to completion** (§6)
- [ ] **T2.2** `app/repos/page.tsx` — RSC list + client-side filter box
- [ ] **T2.3** `RepoList.tsx` — private/public badge, owner login, pushed-at (§6, §10)
- [ ] **T2.4** `lib/repo-url.ts` — parse all five URL forms, including
      `/pull/42` deep-link (§6)
- [ ] **T2.5** `POST /api/repos/resolve` — validate access, return
      `{owner, repo, pullNumber?}` (§9)
- [ ] **T2.6** `GET /api/repos/:owner/:repo/pulls` + `PrList.tsx` (§6, §9)
- [ ] **T2.7** `GET /api/repos/:owner/:repo/pulls/:number` — metadata, changed
      files, patches (§6, §9)
- [ ] **T2.8** `lib/diff.ts` — parse patches into hunks; the foundation for
      anchoring (§8.5)
- [ ] **T2.9** File skip list — lockfiles, minified, `linguist-generated`, binary (§11)
- [ ] **T2.10** Size limits — 60 files / ~400 KB / 64 KB per patch, with explicit
      refusal rather than silent truncation (§11)
- [ ] **T2.11** ⚠️ Validate `owner`/`repo` against `^[A-Za-z0-9._-]+$` before
      Octokit (§12)
- [ ] **T2.12** PR detail page — header, diff summary, changed-file list

---

## M3 — Checkout + agent

**Done when:** a CLI script clones a PR head and runs `query()` against it,
printing raw SDK messages.

- [ ] **T3.1** `lib/checkout.ts` — cache at `.cache/repos/<owner>/<repo>`,
      `git clone --filter=blob:none --no-checkout` (§7.2)
- [ ] **T3.2** Fetch `pull/<n>/head` (covers fork PRs), `git checkout --detach <head_sha>` (§7.2)
- [ ] **T3.3** ⚠️ Auth clones with per-invocation `http.extraHeader` — the token
      must never land in `.git/config` (§7.2, §12)
- [ ] **T3.4** Repo-size guard (2 GB) — refuse rather than fill the disk (§11)
- [ ] **T3.5** ⚠️ Confine checkout paths to `CACHE_DIR`, no-`..` check (§12)
- [ ] **T3.6** Custom tool `git_log_for_file` — fixed args, `readOnlyHint` (§7.4)
- [ ] **T3.7** Custom tool `git_blame` — fixed args, `readOnlyHint` (§7.4)
- [ ] **T3.8** `createSdkMcpServer({ name: "review", ... })` wiring (§7.3, §7.4)
- [ ] **T3.9** `lib/review/engine.ts` — `query()` with `model`, `effort`, `cwd`,
      `tools`, `mcpServers`, `allowedTools`, `maxTurns` (§7.3)
- [ ] **T3.10** ⚠️ **`settingSources: []`** — never load `.claude/` from the
      cloned repo. Single most important line in the options (§7.5, §12)
- [ ] **T3.11** ⚠️ `canUseTool` denying anything outside the allowlist (§7.3, §12)
- [ ] **T3.12** Project review skill in `lib/review/skills/` + `plugins` option
      (not `.claude/skills/` — see CLAUDE.md) (§7.5)
- [ ] **T3.13** Verify the bundled `code-review` skill is present — read
      `slash_commands` on the `system`/`init` message. **If absent, move the
      rubric into the app's own skill** (§7.5)
- [ ] **T3.14** `scripts/review.ts` — CLI harness taking `owner/repo#n`
- [ ] **T3.15** Wall-clock cap (15 min) via `q.interrupt()` (§11)

---

## M3b — Findings

**Done when:** the CLI prints validated, anchored findings as JSON.

- [ ] **T3b.1** `lib/findings/schema.ts` — `Disposition`, `Category`,
      `FindingSchema` (§8.1, §8.2)
- [ ] **T3b.2** Classification constraints — `style` ⇒ `nitpick`; `security` ⇏
      `nitpick`; `blocking` ⇒ `failureScenario` required (§8.1, §8.2)
- [ ] **T3b.3** `report_finding` tool — validate, return `isError` with a usable
      message so the agent fixes or downgrades, emit `structuredContent` (§7.4)
- [ ] **T3b.4** `lib/review/anchor.ts` — file-in-PR check, hunk range check,
      ±3-line snap, `lineValid: false` fallback (§8.5)
- [ ] **T3b.5** `ReviewEvent` types + `reviewPullRequest()` async iterable (§3)
- [ ] **T3b.6** Map SDK messages → `status` / `finding` / `done` / `error`,
      including `error_max_turns` as a *partial* result (§7.6, §11)
- [ ] **T3b.7** Iterate the rubric against 3–5 real PRs; tune for precision (§7.5)

---

## M4 — Review UI

**Done when:** findings stream in, grouped by file, with disposition and
category chips.

- [ ] **T4.1** `POST /api/review` — SSE route, Node runtime (§7.6, §9)
- [ ] **T4.2** 15s `: heartbeat` comment (§7.6)
- [ ] **T4.3** `useReviewStream` hook — parse SSE, handle drops (§10, §11)
- [ ] **T4.4** `ReviewPanel.tsx` — `useReducer` + `sessionStorage` mirror (§3, §10)
- [ ] **T4.5** `FileGroup.tsx` — collapsible, per-disposition counts in header (§10)
- [ ] **T4.6** `FindingCard.tsx` — disposition + category chips, body, action row (§10)
- [ ] **T4.7** Grouping and ordering — disposition, then category priority, then
      line; groups by worst disposition (§8.4)
- [ ] **T4.8** ⚠️ Markdown renderer with **raw HTML and `javascript:` disabled**.
      Finding bodies derive from attacker-influencable repo content (§12)
- [ ] **T4.9** Progress display from `status` events (cloning / reading / grepping)
- [ ] **T4.10** Accessibility: disposition never conveyed by colour alone (§10)

---

## M5 — Triage

**Done when:** approve / dismiss / delete / edit / add all work and survive a
refresh.

- [ ] **T5.1** State machine — `pending` / `approved` / `dismissed` + hard delete (§8.3)
- [ ] **T5.2** `FindingEditor.tsx` — body, title, disposition, category, line (§8.3, §10)
- [ ] **T5.3** Re-anchor on line edit; inline error when the new line is not in
      the diff (§8.3, §8.5)
- [ ] **T5.4** `edited: true` marker on the card (§8.3)
- [ ] **T5.5** `DismissedDrawer.tsx` — collapsed, restorable (§8.3, §10)
- [ ] **T5.6** Delete + ~10s undo toast — the only destructive action, the only
      undo (§8.3, §10)
- [ ] **T5.7** `AddFinding.tsx` — author a finding on any diff line,
      `origin: "user"`, visibly marked (§8.2, §8.3)
- [ ] **T5.8** Bulk actions — approve all blocking; per-group approve/dismiss;
      delete all nitpicks (§10)
- [ ] **T5.9** `DispositionFilter.tsx` + "hide nitpicks" toggle (§8.4, §10)
- [ ] **T5.10** Verify `sessionStorage` round-trip preserves edits and statuses

---

## M6 — Post to GitHub

**Done when:** one review with inline comments lands on a real PR.

- [ ] **T6.1** `lib/findings/render.ts` — Conventional Comments format per
      disposition (§6)
- [ ] **T6.2** `POST /api/review/post` (§9)
- [ ] **T6.3** ⚠️ Server-side re-validation — anchors, file-in-PR, classification
      well-formed (§8.5, §9, §12)
- [ ] **T6.4** Build `comments[]` and call `createReview` **once** with
      `commit_id: headSha` (§6)
- [ ] **T6.5** Review body — counts by disposition + a "General" section for
      `lineValid: false` findings (§6, §8.5)
- [ ] **T6.6** Event selection — `COMMENT` default; offer `REQUEST_CHANGES` when
      approved findings include `blocking` (§6)
- [ ] **T6.7** Hide `REQUEST_CHANGES` when the PR author is the authenticated
      user; handle the 422 with one-click retry as `COMMENT` (§6)
- [ ] **T6.8** Confirm dialog — comment count broken down by disposition (§10)
- [ ] **T6.9** Head-moved handling — `commit_id` mismatch → offer re-review (§11)
- [ ] **T6.10** Post-success lock + link to the review on GitHub (§10)

---

## M7 — Polish

**Done when:** every row of the §11 failure table has a real UI state.

- [ ] **T7.1** GitHub 401 → setup screen (§11)
- [ ] **T7.2** GitHub 403 rate-limited → show `x-ratelimit-reset` time (§11)
- [ ] **T7.3** GitHub 403/404 on a repo → "no access — check the token covers
      this repo" (§11)
- [ ] **T7.4** `git` missing / clone / fetch failures named by step (§11)
- [ ] **T7.5** Corrupt cache → delete and re-clone once, then report (§11)
- [ ] **T7.6** `error_max_turns` → partial review banner, keep findings (§11)
- [ ] **T7.7** Cost display — `total_cost_usd`, `num_turns`, `usage` on `done` (§11)
- [ ] **T7.8** "Clear cache" action; show `.cache/repos/` size ⚠️ (§12)
- [ ] **T7.9** Empty and loading states for every list
- [ ] **T7.10** Cancel-review button wired to `q.interrupt()` (§11)

---

## M8 — README

**Done when:** someone else could set this up on their machine from the README.

- [ ] **T8.1** Setup: fine-grained PAT with the exact permissions, spend limit,
      `git` requirement (§5, §14)
- [ ] **T8.2** ⚠️ Document that it is **local-only and unauthenticated** — never
      expose the port (§12, §14)
- [ ] **T8.3** ⚠️ Document that private source is sent to the Anthropic API and
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
