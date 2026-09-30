import Link from "next/link";
import { notFound } from "next/navigation";
import DiffSummary from "@/components/DiffSummary";
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

  let pull;
  try {
    pull = await getPullDetail(owner, repo, number);
  } catch (error) {
    if (error instanceof InvalidInputError) notFound();
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <Link href={back} className="text-sm text-black/50 hover:underline dark:text-white/50">
          ← open pull requests
        </Link>
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{scrubError(error)}</p>
      </main>
    );
  }

  const report = await runStartupChecks();
  const reviewBlocker = report.checks.find((c) => !c.ok && c.blocksReviews);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href={back} className="text-sm text-black/50 hover:underline dark:text-white/50">
        ← open pull requests
      </Link>

      <header className="mt-2">
        <h1 className="text-xl font-semibold tracking-tight">
          <span className="font-mono text-black/40 dark:text-white/40">#{pull.number}</span>{" "}
          {pull.title}
        </h1>
        <p className="mt-1 text-sm text-black/50 dark:text-white/50">
          @{pull.author}
          {pull.authoredByViewer && " (you)"} · {pull.headRef} → {pull.baseRef} · updated{" "}
          {relativeTime(pull.updatedAt)} ·{" "}
          <span className="font-mono">{pull.headSha.slice(0, 7)}</span> ·{" "}
          <a href={pull.url} className="hover:underline" target="_blank" rel="noreferrer">
            on GitHub ↗
          </a>
        </p>
      </header>

      <div className="mt-6">
        <button
          type="button"
          disabled
          title={reviewBlocker ? `${reviewBlocker.label}: ${reviewBlocker.problem}` : undefined}
          className="rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-40 dark:border-white/20"
        >
          Review this PR
        </button>
        <span className="ml-3 text-xs text-black/40 dark:text-white/40">
          {reviewBlocker
            ? `Unavailable — ${reviewBlocker.label}: ${reviewBlocker.problem}`
            : "Arrives in M4"}
        </span>
      </div>

      <DiffSummary pull={pull} />
    </main>
  );
}
