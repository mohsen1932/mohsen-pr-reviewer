# Local PR Reviewer

AI pull-request review that runs on your machine. Pick a repo, pick an open PR,
let Claude review it, triage the findings, and post the approved ones back to
GitHub as a single review with inline comments.

Reviews run an agent loop over the OpenAI API against a real checkout, so the
agent can follow call sites and read git history — not just the diff.

> **Local-only and unauthenticated.** It runs with your credentials and has no
> login. Anyone who can reach the port can read your private repositories and
> spend your OpenAI balance. `npm run dev` binds to `127.0.0.1`; keep it there.

## Setup

```bash
nvm use                      # Node 22.12.0 — the system Node is too old for Next 16
npm install
cp .env.example .env         # then fill in the two credentials
npm run dev                  # http://127.0.0.1:3000
```

You need:

- A **fine-grained GitHub PAT** with access to all repositories —
  Contents: Read, Pull requests: Read and write
- An **OpenAI API key** from [platform.openai.com] — set a spend limit, this app
  is its only consumer
- **git ≥ 2.19** on `PATH`

The app validates all three at startup and tells you exactly what is missing.

## Development

```bash
npm run check        # typecheck + lint + coverage gate — run before committing
npm run test:watch   # vitest in watch mode
```

Logic ships with unit tests at a minimum of 80% coverage, enforced in
`vitest.config.mts`. Tests mock every external boundary, so they run offline with
no credentials.

## Status

**M6 of 8 code complete** — browse repos and PRs, run a review, triage the
findings, and post the approved ones back to GitHub (616 tests, 95.7% coverage).
Posting has not yet been exercised against a real pull request. Only polish and the README remain. See [TASKS.md].

## Documentation

| File | Contents |
|---|---|
| [SPEC.md] | Architecture and behavior — the source of truth |
| [TASKS.md] | Implementation checklist, M1–M8 |
| [BACKLOG.md] | Decisions with rationale, deferred ideas, ruled-out list |
| [CLAUDE.md] | Orientation and security invariants for AI agents |

[platform.openai.com]: https://platform.openai.com
[SPEC.md]: ./SPEC.md
[TASKS.md]: ./TASKS.md
[BACKLOG.md]: ./BACKLOG.md
[CLAUDE.md]: ./CLAUDE.md
