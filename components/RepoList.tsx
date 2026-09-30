"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RepoSummary } from "@/lib/repos";
import { relativeTime } from "@/lib/format";
import { Badge } from "./ui";

export default function RepoList({ repos }: { repos: RepoSummary[] }) {
  const [query, setQuery] = useState("");
  const [privateOnly, setPrivateOnly] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return repos.filter((r) => {
      if (privateOnly && !r.private) return false;
      if (!q) return true;
      return (
        r.fullName.toLowerCase().includes(q) ||
        (r.description?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [repos, query, privateOnly]);

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter repositories…"
          aria-label="Filter repositories"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-line-strong focus:outline-none"
        />
        <label className="flex shrink-0 cursor-pointer select-none items-center gap-2 text-[13px] text-ink-muted">
          <input
            type="checkbox"
            checked={privateOnly}
            onChange={(e) => setPrivateOnly(e.target.checked)}
            className="accent-accent"
          />
          Private only
        </label>
        <span className="shrink-0 font-mono text-xs tabular-nums text-ink-subtle">
          {filtered.length}/{repos.length}
        </span>
      </div>

      <ul className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
        {filtered.map((repo) => (
          <li key={repo.fullName} className="not-last:border-b not-last:border-line">
            <Link
              href={`/repos/${repo.owner}/${repo.name}/pulls`}
              className="group block px-4 py-3.5 transition-colors hover:bg-hover"
            >
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="text-sm text-ink-subtle">{repo.owner}/</span>
                <span className="-ml-2 text-sm font-medium text-ink group-hover:text-accent">
                  {repo.name}
                </span>
                {repo.private && <Badge tone="warn">private</Badge>}
                {repo.language && (
                  <span className="text-xs text-ink-subtle">{repo.language}</span>
                )}
                <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-ink-subtle">
                  {relativeTime(repo.pushedAt)}
                </span>
              </div>
              {repo.description && (
                <p className="mt-1 line-clamp-1 text-[13px] text-ink-muted">
                  {repo.description}
                </p>
              )}
            </Link>
          </li>
        ))}

        {filtered.length === 0 && (
          <li className="px-4 py-10 text-center text-[13px] text-ink-subtle">
            {repos.length === 0
              ? "No repositories. Fine-grained tokens only list repositories they were granted."
              : "No repositories match that filter."}
          </li>
        )}
      </ul>
    </section>
  );
}
