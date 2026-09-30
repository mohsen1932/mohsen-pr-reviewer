# Backlog & open decisions

Companion to [SPEC.md](./SPEC.md) — a **local-only** tool — which describes only
what the app is and how it is built. This file holds everything that is a judgement call, a deferred
idea, or an explicit decision not to build something.

---

## Open decisions

### D1. Review engine — **decided: own agent loop over the OpenAI API**

Third position on this question, each driven by a changed premise.

1. Claude Messages API, diff-only — chosen while the target was Vercel.
2. Claude Agent SDK — chosen once the app became local-only, since a clone and a
   long-running process became possible. Built and measured against four real
   PRs: 5 findings, no false positives.
3. **OpenAI `chat.completions` with an agent loop of our own** — chosen for cost.
   `gpt-5.4-mini` is $0.75/$4.50 per MTok against Claude Sonnet 5's $2/$10.

What the move cost, recorded so it is a known trade rather than a surprise: the
Claude Code harness is gone, so the loop, the six tools, the path confinement and
the allowlist are all code in this repo. The `settingSources` hazard disappeared
with it — there is no settings loading to misconfigure — but `resolveInside()`
replaced it as the single guard between a model string and the filesystem, and
it carries more weight than any one line did before.

What did not change: the rubric, the finding schema, anchoring, the streaming
contract, and every consumer above `reviewPullRequest()`.

**Worth measuring, not assumed:** the four-PR evaluation was run on the previous
engine. Review quality on `gpt-5.4-mini` with hand-built tools is unverified —
re-running that evaluation is the first thing to do with the new engine, and the
prior numbers in SPEC.md §11 are the baseline to beat.

### D2. GitHub token type — **decided: fine-grained, all repositories**

Fine-grained with access to all repositories. Private repos are first-class, and
"all repositories" means no token edit every time you point the app at something
new. Scoping to selected repos would bound the blast radius of a prompt injection
(SPEC.md §12), but costs a token edit per repo — the wrong trade for a local
single-user tool.

Fallback, if an organization disallows fine-grained tokens: a classic PAT with
`repo`, SSO-authorized for that org. SPEC.md §5 carries it as troubleshooting,
not as a supported configuration.

### D6. Model and effort — **superseded by D1**

Measured on the *previous* engine (Claude Sonnet 5), kept because the shape of
the trade carries over:

| effort | Time | Cost | Findings |
|---|---|---|---|
| high | 278s | $0.49 | 1 — a real gap the PR's own fix missed |
| medium | 179s | $0.33 | 0 |

Medium was a third cheaper and lost the finding. `high` remains the default on
the OpenAI engine for the same reason, though the numbers above have not been
re-measured there. `REVIEW_MODEL` and `REVIEW_EFFORT` make both a per-run choice.

### D3. Nitpicks — **decided: removed entirely**

The original question was whether to hide nitpicks by default or show them with
a filter. Neither: the disposition is gone from the vocabulary, and the `style`
category with it — by its own definition `style` only ever meant "preference".

Removing rather than filtering matters. A filter still costs the agent turns and
tokens to produce findings nobody reads, and it invites the failure mode where a
preference is relabelled `non-blocking` to survive the filter. The rubric names
that explicitly: if the only honest label is "preference", say nothing.

Measured on `colinhacks/zod#5995`, which previously returned one non-blocking
performance finding plus one maintainability nitpick: the run now returns a
single **blocking correctness** finding about stale `lastIndex` with custom regex
testers — a deeper issue than either of the originals.

Open, and now more visible: **there is no way to record a low-priority
observation.** If that turns out to matter, the answer is a per-category mute
(B14) rather than reinstating the disposition.

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
  do for a local app). Also the right shape for the gap D3 left: a way to say
  "less of this" without reintroducing a disposition for preferences.
- **B16. Per-PR effort heuristic.** Cost tracked investigation depth, not diff
  size — a 17-line change was the most expensive of four. A first cheap pass that
  escalates only when it finds something would likely beat a fixed effort level.
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
