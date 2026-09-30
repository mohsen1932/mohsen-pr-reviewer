import Link from "next/link";
import type { ReactNode } from "react";

/** Fixed chrome: brand mark, the "local" signal, and the signed-in user. */
export default function AppShell({
  user,
  children,
}: {
  user?: { login: string; avatarUrl: string } | null;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-10 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-5">
          <Link href="/repos" className="flex items-center gap-2.5 text-sm font-medium">
            <span
              aria-hidden
              className="grid size-6 place-items-center rounded-md bg-accent/15 text-[11px] font-bold text-accent"
            >
              PR
            </span>
            <span className="text-ink">PR Reviewer</span>
          </Link>

          <span className="rounded border border-line-strong px-1.5 py-px text-[10px] font-medium uppercase tracking-wider text-ink-subtle">
            local
          </span>

          {user && (
            <div className="ml-auto flex items-center gap-2 text-xs text-ink-muted">
              {user.avatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt=""
                  width={20}
                  height={20}
                  className="size-5 rounded-full ring-1 ring-line-strong"
                />
              )}
              <span>@{user.login}</span>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-10">{children}</div>
    </div>
  );
}
