import Link from "next/link";
import type { PullSummary } from "@/lib/pulls";
import { relativeTime } from "@/lib/format";

export default function PrList({
  owner,
  repo,
  pulls,
}: {
  owner: string;
  repo: string;
  pulls: PullSummary[];
}) {
  if (pulls.length === 0) {
    return (
      <p className="py-8 text-sm text-black/50 dark:text-white/50">
        No open pull requests.
      </p>
    );
  }

  return (
    <ul className="mt-2">
      {pulls.map((pr) => (
        <li key={pr.number} className="border-b border-black/10 dark:border-white/10">
          <Link
            href={`/repos/${owner}/${repo}/pulls/${pr.number}`}
            className="block py-3 hover:bg-black/[.03] dark:hover:bg-white/[.04]"
          >
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-xs text-black/40 dark:text-white/40">
                #{pr.number}
              </span>
              <span className="font-medium">{pr.title}</span>
              {pr.draft && (
                <span className="rounded border border-black/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-black/50 dark:border-white/25 dark:text-white/50">
                  draft
                </span>
              )}
              <span className="ml-auto text-xs text-black/40 dark:text-white/40">
                updated {relativeTime(pr.updatedAt)}
              </span>
            </div>
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">
              @{pr.author} · {pr.headRef} → {pr.baseRef}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
