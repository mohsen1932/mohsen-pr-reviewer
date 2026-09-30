"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RepoSummary } from "@/lib/repos";
import { relativeTime } from "@/lib/format";

/** Client-side filter over the already-fetched list. SPEC.md §10. */
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
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter repositories…"
          aria-label="Filter repositories"
          className="min-w-0 flex-1 rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        />
        <label className="flex shrink-0 items-center gap-2 text-sm text-black/70 dark:text-white/70">
          <input
            type="checkbox"
            checked={privateOnly}
            onChange={(e) => setPrivateOnly(e.target.checked)}
          />
          Private only
        </label>
      </div>

      <p className="mt-3 text-xs text-black/50 dark:text-white/50">
        {filtered.length} of {repos.length} repositories
      </p>

      <ul className="mt-2">
        {filtered.map((repo) => (
          <li key={repo.fullName} className="border-b border-black/10 dark:border-white/10">
            <Link
              href={`/repos/${repo.owner}/${repo.name}/pulls`}
              className="block py-3 hover:bg-black/[.03] dark:hover:bg-white/[.04]"
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{repo.fullName}</span>
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                    repo.private
                      ? "border-amber-600/40 text-amber-700 dark:text-amber-400"
                      : "border-black/20 text-black/50 dark:border-white/25 dark:text-white/50"
                  }`}
                >
                  {repo.private ? "private" : "public"}
                </span>
                {repo.language && (
                  <span className="text-xs text-black/50 dark:text-white/50">
                    {repo.language}
                  </span>
                )}
                <span className="ml-auto text-xs text-black/40 dark:text-white/40">
                  pushed {relativeTime(repo.pushedAt)}
                </span>
              </div>
              {repo.description && (
                <p className="mt-1 line-clamp-1 text-sm text-black/60 dark:text-white/60">
                  {repo.description}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="py-8 text-sm text-black/50 dark:text-white/50">
          No repositories match. Fine-grained tokens only list repositories they
          were granted — check the token&rsquo;s repository access.
        </p>
      )}
    </div>
  );
}
