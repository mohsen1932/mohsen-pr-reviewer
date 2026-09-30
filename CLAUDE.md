# Local PR Reviewer

An AI pull-request reviewer that runs on localhost. Sign-in-less, single-user,
no database. Reviews run an agent loop over the OpenAI API against a real checkout of the
PR's repo; findings are triaged by a human and posted back to GitHub as one
review with inline comments.

**Status: M5 complete** — reviews stream in and can be triaged. 587 tests at 95%
coverage. Next: TASKS.md M6 (post approved comments to GitHub).

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
There is no managed harness behind them — this codebase *is* the boundary. If you
find yourself removing one, stop and ask.

1. **`lib/review/agent-tools.ts` is the allowlist.** It defines every capability
   the agent has, and `engine.ts` refuses to dispatch a name that is not in it.
   Adding a tool there grants it; there is no second gate.
2. **No shell, no writes, no network in tools.** Six read-only tools. `search`
   and `list_files` go through `git grep` / `git ls-files` with fixed argument
   lists — never a shell, and never a pattern in flag position.
3. **Every model-supplied path goes through `resolveInside()`.** It rejects
   absolute paths, traversal, NUL bytes, and `.git/`. It is the only thing
   between a model string and the filesystem. (§12)
4. **Nothing in a checkout is ever executed.** No install, no build, no test run.
   The repo is read, never run.
5. **No credential reaches a client component prop, a JSON response, or a log
   line.** Error paths must scrub: an OpenAI 401 renders as "invalid key", never
   by echoing the request.
6. **The GitHub token never lands in `.git/config` or in argv.** Authenticate
   clones with `GIT_CONFIG_*` environment variables (§7.2).
7. **Nothing writes to a repository** except the single `createReview` call.
8. **Findings render as sanitized markdown** — no raw HTML, no `javascript:`.
   Bodies derive from repository content an attacker can influence by opening a
   PR.

## Easy things to get wrong

- The LLM dependency is **`openai`**, used through **`responses.create`** — not
  chat completions, which rejects function tools combined with a reasoning
  effort on these models. The agent loop is ours, in `lib/review/engine.ts`.
- Responses-API tools are **flat** (`{type, name, description, parameters}`),
  not nested under `function` as chat completions requires. Tool results go back
  as `{type: "function_call_output", call_id, output}`, and the whole `output`
  array is echoed into `input` so the model keeps its reasoning chain.
- Default model is **`gpt-5.4-mini`**, overridable via `REVIEW_MODEL`. A model
  missing from `lib/review/pricing.ts` reports a **null** cost — never guess a
  price to fill the gap.
- **Node 22.12.0**, pinned in `.nvmrc`. The system Node is 18.20.3 and will not
  run Next 16 — `nvm use` before anything, or npm scripts fail confusingly.
- **Next 16**, not 15 as originally spec'd: Next 15 bundles a postcss with a
  high-severity advisory fixable only by upgrading. SPEC.md §4 records it.
- `npm run dev` and `npm run start` pass `--hostname 127.0.0.1` deliberately.
  Next otherwise binds 0.0.0.0 and advertises a LAN URL, contradicting
  invariant 5.
- **`git` on `PATH` at ≥ 2.19** — the clone uses `--filter=blob:none`. A
  `--depth` shallow clone would break `git blame`, which is half the reason for
  cloning at all.
- **Two sources of repo data, kept separate.** The GitHub API supplies what the
  PR changed (patches, and therefore line anchoring). The checkout is only what
  the agent explores. Never anchor a finding against the checkout. (§3, §8.5)
- Scripts under `scripts/` are `.mts` and run via `tsx` — the package is CJS, so
  top-level await needs an explicit ESM extension.
- **Cost tracks turns, not diff size.** Every turn re-sends the transcript. When
  a review is expensive, read the cache hit rate on the `done` event first.
- **Never add `rehype-raw` to `FindingBody`.** react-markdown refuses raw HTML
  by default, and finding bodies come from model output derived from a diff an
  attacker can write. URLs go through `safeUrl`.
- The review reducer lives in `lib/review/reducer.ts`, not in the component, so
  its transitions are testable. Same for SSE parsing (`stream.ts`), session
  persistence (`persist.ts`), and the edit rules (`lib/findings/edit.ts`).
- **A human edit is held to the same classification rules as the agent.**
  `applyEdit` re-validates against the schema, so promoting a finding to
  blocking still requires a failure scenario.
- Editing a line re-anchors; editing anything else does not. A finding the user
  deliberately placed must not move because they fixed a typo in the body.

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
