/**
 * CLI harness for the review engine, so the prompt and the checkout can be
 * iterated on without the UI. SPEC.md §15 M3.
 *
 *   npm run review -- owner/repo#42
 */
import { getPullDetail } from "../lib/pulls";
import { getRepo } from "../lib/repos";
import { parseRepoUrl } from "../lib/repo-url";
import { reviewPullRequest } from "../lib/review/engine";

const target = process.argv[2];
if (!target) {
  console.error("usage: review.ts <owner/repo#42 | https://github.com/owner/repo/pull/42>");
  process.exit(2);
}

const hashed = /^(?<rest>.+)#(?<num>\d+)$/.exec(target.trim());
const ref = parseRepoUrl(hashed?.groups ? hashed.groups.rest : target);
const pullNumber = hashed?.groups ? Number(hashed.groups.num) : ref?.pullNumber;

if (!ref || !pullNumber) {
  console.error(`Could not parse "${target}". Try owner/repo#42.`);
  process.exit(2);
}

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

console.log(bold(`${ref.owner}/${ref.repo} #${pullNumber}`));

const [repo, pull] = await Promise.all([
  getRepo(ref.owner, ref.repo),
  getPullDetail(ref.owner, ref.repo, pullNumber),
]);

console.log(dim(`${pull.title}`));
console.log(
  dim(
    `${pull.files.length}/${pull.changedFiles} files reviewable · +${pull.additions}/-${pull.deletions} · head ${pull.headSha.slice(0, 7)}`,
  ),
);
console.log();

const started = Date.now();
const elapsed = () => dim(`${((Date.now() - started) / 1000).toFixed(1)}s`.padStart(7));

for await (const event of reviewPullRequest({
  pull,
  owner: ref.owner,
  repo: ref.repo,
  sizeKb: (repo as { sizeKb?: number }).sizeKb,
})) {
  switch (event.type) {
    case "status":
      console.log(`${elapsed()} ${dim("·")} ${event.phase}${event.detail ? ` ${dim(event.detail)}` : ""}`);
      break;
    case "tool":
      console.log(`${elapsed()} ${dim("→")} ${event.name} ${dim(event.summary)}`);
      break;
    case "message":
      console.log(`${elapsed()} ${dim("—")}`);
      console.log(event.text.replace(/^/gm, "         "));
      break;
    case "done":
      console.log();
      console.log(
        bold(
          `done · ${event.turns} turns · $${event.costUsd.toFixed(4)} · ${(event.durationMs / 1000).toFixed(1)}s` +
            (event.skillUsed ? "" : " · WARNING: code-review skill not found"),
        ),
      );
      break;
    case "error":
      console.error(`\n\x1b[31m${event.partial ? "partial" : "error"}:\x1b[0m ${event.message}`);
      if (!event.partial) process.exitCode = 1;
      break;
  }
}
