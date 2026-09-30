# Backlog & open decisions

Companion to [SPEC.md](./SPEC.md) — a **local-only** tool — which describes only
what the app is and how it is built. This file holds everything that is a judgement call, a deferred
idea, or an explicit decision not to build something.

---

## Open decisions

### D1. Claude API vs. `@anthropic-ai/claude-agent-sdk` — **decided: Agent SDK**

Closed once the target settled as local-only. The objections that had ruled it out
on Vercel — no writable filesystem, no process outliving a request, no place to
put a clone — do not apply to `npm run dev` on a laptop.

What it buys (SPEC.md §7): grep over a real checkout to find the call sites of a
changed function, `git log`/`git blame` on the surrounding code, and Claude Code's
bundled `code-review` skill instead of a hand-written rubric string.

What it costs, accepted: 2–5 minute reviews instead of ~30s, roughly 5–10× the
tokens (tens of cents rather than a few cents per review), a git dependency, a
growing `.cache/repos/`, and a security surface that did not exist before — the
agent reads a repository written by someone else. SPEC.md §12 is largely about
that, and `settingSources: []` is the load-bearing line.

The `reviewPullRequest()` seam in SPEC.md §3 stays, so a diff-only Messages API
implementation remains the fallback if agent reviews prove too slow or costly in
practice.

### D2. GitHub token type — **decided: fine-grained, all repositories**

Fine-grained with access to all repositories. Private repos are first-class, and
"all repositories" means no token edit every time you point the app at something
new. Scoping to selected repos would bound the blast radius of a prompt injection
(SPEC.md §12), but costs a token edit per repo — the wrong trade for a local
single-user tool.

Fallback, if an organization disallows fine-grained tokens: a classic PAT with
`repo`, SSO-authorized for that org. SPEC.md §5 carries it as troubleshooting,
not as a supported configuration.

### D3. Default triage state

Spec'd as: everything starts `pending`, with one-click "approve all blocking".
The alternative is auto-approving `blocking` findings on arrival. Leaning toward
keeping everything pending — the human gate is the product, and blocking is
exactly the category you least want posted unreviewed.

Related, and genuinely open: should `nitpick` findings be **hidden by default**
rather than shown and filtered? Hiding them makes the first screen better and
risks the agent's nitpick budget being spent invisibly. Decide after seeing real
output on real PRs.

### D4. One review vs. one comment per finding — **decided: one review**

`POST /pulls/{n}/reviews` with a `comments[]` array (SPEC.md §6). The
alternative, individual `POST /pulls/{n}/comments` calls, gives partial success
on a 422 but clutters the PR with N separate threads. Sticking with one review;
the line validation in §8.3 is what makes the all-or-nothing failure safe.

### D5. Where the Anthropic API key lives — **moot**

Settled by going local-only: the key is a line in `.env` (SPEC.md §5). The
earlier comparison of httpOnly cookie vs. `localStorage` vs. browser-direct calls
only mattered when strangers were pasting keys into a hosted app. If this is ever
hosted again, that question comes back and `localStorage` loses to an httpOnly
cookie — a cookie is browser storage too, so it stores the key in the same place
while staying unreadable by page scripts, which matters because the app renders
LLM-authored markdown derived from PR diffs (SPEC.md §12).

---

## Cheap wins

Small, high-value, none of them architectural.

- **B1. Deep-link PR URLs.** Pasting `github.com/owner/repo/pull/42` should jump
  straight to the review screen. Trivial, and it becomes the way you actually
  use the tool.
- **B2. Show the diff hunk inline in each finding card.** You can't judge a
  finding without seeing the code, and the patch is already client-side.
- **B3. Dry-run mode.** Render exactly what will be posted, as markdown, before
  posting. Builds trust in the tool fast.
- **B4. Keyboard shortcuts** on the review screen — `j`/`k` navigate, `a`
  approve, `d` dismiss, `e` edit, `x` delete. It's a triage queue.
- **B15. Multiple tokens.** One `GITHUB_TOKEN` cannot be both a narrow
  fine-grained token for personal repos and a classic token for an org that
  disallows fine-grained PATs (D2). A token-per-owner map would fix it.
- **B14. Per-category mute.** "Never show me `docs` findings" as a persisted
  preference, so the agent's output narrows to what you act on. Needs somewhere
  to persist, so it collides with the no-DB constraint (a local JSON file would
  do for a local app).
- **B5. Re-review button** that sends the previous findings back as context with
  "these were already raised; only report what's new." Wanted as soon as a PR
  you're reviewing gets pushed to twice.

---

## Deferred

- **B6. Subagents for large PRs.** The SDK's `agents` option could fan a review
  out per-file or per-concern. Worth trying only once single-agent reviews are
  good enough to have a baseline to beat.
- **B7. Cache reviews by `(repo, PR, head_sha)`.** The first thing you'll want a
  database for, because re-running a review after an accidental refresh is the
  most annoying part of the no-DB design (SPEC.md §13).
- **B11. Repo-specific review rules.** The obvious version — let the agent read
  the target repo's own `CLAUDE.md` — is exactly the remote-code-execution path
  closed in SPEC.md §12. A safe version reads the file's *text* through the
  GitHub API and passes it as clearly-labelled untrusted context, never through
  `settingSources`.
- **B12. Cache management.** `.cache/repos/` grows per repo reviewed. v1 exposes
  "clear cache"; an LRU eviction by size would be better.
- **B13. Warm the clone on PR select**, so the clone happens while the user is
  reading the diff rather than after they click Review.
- **B9. `gh auth token` instead of a PAT.** One line in the setup docs
  (SPEC.md §5) and no token to create or rotate, at the cost of depending on
  another tool's login state.
- **B10. `effort` as a UI control.** Currently `high` by default via
  `REVIEW_EFFORT`. A per-review selector would let you spend more on a PR that
  matters and less on a typo fix.

---

## Ruled out

- **Using a GitHub SSH key for auth.** An SSH key authenticates git transport
  only; the GitHub REST API — every operation this app performs — needs a token.
  No configuration makes an SSH key work here (SPEC.md §5).
- **"Sign in with your Claude account."** Moot for a local app (the key is in
  `.env`), and prohibited anyway: Anthropic bars third-party applications from
  offering Claude.ai login or routing requests with Free / Pro / Max subscription
  credentials. Reverse-engineered subscription-OAuth clients exist and are exactly
  what that policy targets.
- **Deploying this as-is.** No auth layer; the server hands its credentials to
  anyone who reaches it. Multi-user means real per-user auth and per-user
  credentials — a different application (SPEC.md §14).

## Not doing

- **Giving the agent `Bash` or write tools.** The checkout is someone else's code
  (SPEC.md §12). Git access goes through fixed-argument custom tools instead.
- **Loading the cloned repo's `.claude/` settings.** `settingSources: []` is a
  security control; a skill in a hostile repo can execute commands before Claude
  reads it.

- **Auto-post without review.** The human approval step is both the product and
  the prompt-injection backstop (SPEC.md §12). A PR diff can contain "ignore
  previous instructions"; the only reason that's harmless is that the model has
  no write tools and a human sees every comment before it posts.
- **Reviewing unbounded diffs.** A 5,000-line PR produces a bad review at real
  cost. Refuse above the SPEC.md §11 limits with a clear message rather than
  degrading silently.
