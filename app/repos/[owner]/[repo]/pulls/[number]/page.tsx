import Link from "next/link";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import DiffSummary from "@/components/DiffSummary";
import { Badge, Notice } from "@/components/ui";
import { getAuthenticatedUser } from "@/lib/github";
import { getPullDetail } from "@/lib/pulls";
import { relativeTime } from "@/lib/format";
import { scrubError } from "@/lib/scrub";
import { runStartupChecks } from "@/lib/startup";
import { InvalidInputError } from "@/lib/validate";

export const dynamic = "force-dynamic";

export default async function PullPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; number: string }>;
}) {
  const { owner, repo, number } = await params;
  const back = `/repos/${owner}/${repo}/pulls`;
  const user = await getAuthenticatedUser().catch(() => null);

  let pull;
  try {
    pull = await getPullDetail(owner, repo, number);
  } catch (error) {
    if (error instanceof InvalidInputError) notFound();
    return (
      <AppShell user={user}>
        <Link href={back} className="text-[13px] text-ink-subtle hover:text-ink">
          ← open pull requests
        </Link>
        <div className="mt-4">
          <Notice tone="del" title="Could not load this pull request">
            {scrubError(error)}
          </Notice>
        </div>
      </AppShell>
    );
  }

  const report = await runStartupChecks();
  const blocker = report.checks.find((c) => !c.ok && c.blocksReviews);

  return (
    <AppShell user={user}>
      <Link href={back} className="text-[13px] text-ink-subtle hover:text-ink">
        ← {owner}/{repo}
      </Link>

      <header className="mt-3">
        <div className="flex items-start gap-3">
          <span className="mt-1 font-mono text-sm tabular-nums text-ink-subtle">
            #{pull.number}
          </span>
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">
            {pull.title}
          </h1>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-xs text-ink-muted">
          <span>@{pull.author}</span>
          {pull.authoredByViewer && <Badge tone="accent">yours</Badge>}
          {pull.draft && <Badge>draft</Badge>}
          <span className="text-ink-subtle">·</span>
          <span className="font-mono text-ink-subtle">
            {pull.headRef} → {pull.baseRef}
          </span>
          <span className="text-ink-subtle">·</span>
          <span className="font-mono text-ink-subtle">{pull.headSha.slice(0, 7)}</span>
          <span className="text-ink-subtle">·</span>
          <span>updated {relativeTime(pull.updatedAt)}</span>
          <a
            href={pull.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-ink-subtle hover:text-accent"
          >
            GitHub ↗
          </a>
        </div>
      </header>

      <div className="mt-7 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3.5">
        <button
          type="button"
          disabled
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:cursor-not-allowed disabled:opacity-25"
        >
          Review this PR
        </button>
        <span className="text-xs text-ink-subtle">
          {blocker ? `Unavailable — ${blocker.label}: ${blocker.problem}` : "Arrives in M4"}
        </span>
      </div>

      <DiffSummary pull={pull} />
    </AppShell>
  );
}
