import Link from "next/link";
import type { PullSummary } from "@/lib/pulls";
import { relativeTime } from "@/lib/format";
import { Badge } from "./ui";

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
      <div className="rounded-lg border border-line bg-surface px-4 py-14 text-center text-[13px] text-ink-subtle">
        No open pull requests.
      </div>
    );
  }

  return (
    <ul className="overflow-hidden rounded-lg border border-line bg-surface">
      {pulls.map((pr) => (
        <li key={pr.number} className="not-last:border-b not-last:border-line">
          <Link
            href={`/repos/${owner}/${repo}/pulls/${pr.number}`}
            className="group flex gap-3.5 px-4 py-3.5 transition-colors hover:bg-hover"
          >
            <span className="mt-px shrink-0 font-mono text-xs tabular-nums text-ink-subtle">
              #{pr.number}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-ink group-hover:text-accent">
                  {pr.title}
                </span>
                {pr.draft && <Badge>draft</Badge>}
              </div>
              <p className="mt-1 truncate font-mono text-[11px] text-ink-subtle">
                @{pr.author} · {pr.headRef} → {pr.baseRef}
              </p>
            </div>
            <span className="shrink-0 self-center font-mono text-[11px] tabular-nums text-ink-subtle">
              {relativeTime(pr.updatedAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
