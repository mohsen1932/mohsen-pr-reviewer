import Link from "next/link";
import { notFound } from "next/navigation";
import PrList from "@/components/PrList";
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

  let pulls;
  try {
    pulls = await listOpenPulls(owner, repo);
  } catch (error) {
    if (error instanceof InvalidInputError) notFound();
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <Link href="/repos" className="text-sm text-black/50 hover:underline dark:text-white/50">
          ← repositories
        </Link>
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{scrubError(error)}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/repos" className="text-sm text-black/50 hover:underline dark:text-white/50">
        ← repositories
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">
        {owner}/{repo}
      </h1>
      <p className="mt-1 text-sm text-black/50 dark:text-white/50">
        {pulls.length} open pull request{pulls.length === 1 ? "" : "s"}
      </p>
      <PrList owner={owner} repo={repo} pulls={pulls} />
    </main>
  );
}
