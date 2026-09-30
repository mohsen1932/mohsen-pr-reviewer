# Local PR Reviewer

An AI pull-request reviewer that runs on localhost. Sign-in-less, single-user,
no database. Reviews run the Claude Code harness (Agent SDK) against a real
checkout of the PR's repo; findings are triaged by a human and posted back to
GitHub as one review with inline comments.

**Status: M3 complete** — scaffold, credentials, browsing, checkout + agent engine.
340 tests at 97% coverage. Next: TASKS.md M3b (findings).

## Where things are decided

Read these before proposing anything structural — the decisions in them are made,
with reasons, and re-litigating them wastes a turn:

| File | Holds |
|---|---|
| `SPEC.md` | Architecture and behavior. The source of truth. |
| `TASKS.md` | The implementation checklist, M1–M8, each task citing a `§`. |
| `BACKLOG.md` | Decisions with their rationale (`D1`–`D5`), deferred ideas, and an explicit "ruled out" list. |

If a change contradicts one of these, say so and update the doc in the same
change. Don't silently diverge.

## Invariants — do not break these

These are security-critical and easy to "helpfully" undo while refactoring.
Every one has a comment at its call site; if you find yourself removing one,
stop and ask.

1. **`settingSources: []`** in the Agent SDK query. `cwd` is a checkout of
   someone else's repository. With `'project'`, the SDK would load that repo's
   `.claude/` — and a skill there can run shell commands via `` !`cmd` `` before
   Claude reads it. This is the difference between prompt injection and remote
   code execution. (SPEC.md §7.5, §12)
2. **The agent never gets `Bash`, `Write`, `Edit`, `WebFetch`, or `WebSearch`.**
   Availability is `Read`, `Grep`, `Glob`, `Skill`. Git access goes through
   fixed-argument custom MCP tools, never a shell — scoped `Bash(git log:*)`
   rules were considered and rejected as too easy to slip past. (§7.4)
3. **Nothing in a checkout is ever executed.** No install, no build, no test run.
   The repo is read, never run. (§12)
4. **No credential reaches a client component prop, a JSON response, or a log
   line.** Error paths must scrub: an Anthropic 401 renders as "invalid key",
   never by echoing the request. (§12)
5. **The GitHub token never lands in `.git/config`.** Authenticate clones with a
   per-invocation `http.extraHeader`, never `https://token@github.com/...`. (§7.2)
6. **Nothing writes to a repository** except the single `createReview` call. (§12)
7. **Findings render as sanitized markdown** — no raw HTML, no `javascript:`.
   Bodies derive from repo content an attacker can influence by opening a PR. (§12)

## Easy things to get wrong

- The LLM dependency is **`@anthropic-ai/claude-agent-sdk`**, not
  `@anthropic-ai/sdk`. This app drives the Claude Code harness, not the Messages
  API. A diff-only Messages API implementation is the documented fallback
  (BACKLOG D1), not the current design.
- Default model is **`claude-sonnet-5`**, overridable via `REVIEW_MODEL`.
- **Node 22.12.0**, pinned in `.nvmrc`. The system Node is 18.20.3 and will not
  run Next 16 — `nvm use` before anything, or npm scripts fail confusingly.
- **Next 16**, not 15 as originally spec'd: Next 15 bundles a postcss with a
  high-severity advisory fixable only by upgrading. SPEC.md §4 records the
  change.
- `npm run dev` and `npm run start` pass `--hostname 127.0.0.1` deliberately.
  Next otherwise binds 0.0.0.0 and advertises a LAN URL, which contradicts
  invariant 4 above.
- `git` must be on `PATH` at **≥ 2.19** — the clone uses `--filter=blob:none`.
  A `--depth` shallow clone would break `git blame`, which is half the reason for
  cloning at all.
- **Two sources of repo data, kept separate.** The GitHub API supplies what the
  PR changed (patches, and therefore line anchoring). The checkout is only what
  the agent explores. Never anchor a finding against the checkout. (§3, §8.5)
- Project review instructions live in **`lib/review/instructions.ts`**, appended
  to the Claude Code preset. Deliberately not `.claude/skills/`, which would be
  confused with configuration for Claude Code sessions in this repo.
- **Never set `allowedTools`** on the review query. A bare name there
  auto-approves the call before `canUseTool` runs, silently disabling the guard.
- Scripts under `scripts/` are `.mts` and run via `tsx` — the package is CJS, so
  top-level await needs an explicit ESM extension.

## Conventions

- **Logic ships with tests.** Vitest, 80% minimum on statements/branches/
  functions/lines, enforced in `vitest.config.mts` — not a convention you can
  forget. Run `npm run check` (typecheck + lint + coverage) before committing.
  Coverage scope is `lib/**` and `app/api/**`; if logic would otherwise live in a
  React component, extract it to `lib/` so it can be tested. SPEC.md §16.
- **Security invariants get negative tests** — assert the token is *absent* from
  the error, that the out-of-cache path is *rejected*. Those are what a refactor
  breaks silently.

- One Zod schema per concept, shared by the MCP tool, the API route, and the UI.
  Don't define a parallel TypeScript interface for something Zod already types.
- Findings carry two axes — `disposition` (blocking / non-blocking / nitpick) and
  `category`. They are independent; don't collapse them into a severity scale.
- `.env` and `.cache/` are gitignored and must stay that way. `.cache/repos/`
  holds private source in plaintext.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
