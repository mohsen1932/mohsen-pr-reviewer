import Link from "next/link";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import PrList from "@/components/PrList";
import { Notice, PageTitle } from "@/components/ui";
import { getAuthenticatedUser } from "@/lib/github";
import { listOpenPulls } from "@/lib/pulls";
import { scrubError } from "@/lib/scrub";
import { InvalidInputError } from "@/lib/validate";

export const dynamic = "force-dynamic";

export default async function PullsPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  const user = await getAuthenticatedUser().catch(() => null);

  let pulls;
  try {
    pulls = await listOpenPulls(owner, repo);
  } catch (error) {
    if (error instanceof InvalidInputError) notFound();
    return (
      <AppShell user={user}>
        <Link href="/repos" className="text-[13px] text-ink-subtle hover:text-ink">
          ← repositories
        </Link>
        <div className="mt-4">
          <Notice tone="del" title={`${owner}/${repo}`}>
            {scrubError(error)}
          </Notice>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell user={user}>
      <Link href="/repos" className="text-[13px] text-ink-subtle hover:text-ink">
        ← repositories
      </Link>

      <div className="mt-3">
        <PageTitle eyebrow={owner}>{repo}</PageTitle>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          {pulls.length} open pull request{pulls.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="mt-6">
        <PrList owner={owner} repo={repo} pulls={pulls} />
      </div>
    </AppShell>
  );
}
