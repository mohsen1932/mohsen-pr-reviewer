import SetupNotice from "@/components/SetupNotice";
import { getAuthenticatedUser } from "@/lib/github";
import { runStartupChecks } from "@/lib/startup";

export const dynamic = "force-dynamic";

// Placeholder until M2 (T2.1-T2.3) replaces this with the real repo list.
export default async function ReposPage() {
  const report = await runStartupChecks();
  if (!report.canBrowse) return <SetupNotice report={report} />;

  const user = await getAuthenticatedUser();
  const blocked = report.checks.filter((c) => !c.ok && c.blocksReviews);

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Local PR Reviewer</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Signed in as <span className="font-medium">@{user.login}</span>
        {user.name ? ` (${user.name})` : ""}
      </p>

      {blocked.length > 0 && (
        <div className="mt-6 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium">Reviews are unavailable</p>
          <ul className="mt-2 space-y-1 text-black/70 dark:text-white/70">
            {blocked.map((c) => (
              <li key={c.id}>
                <code className="font-mono text-xs">{c.label}</code> — {c.problem}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-10 text-sm text-black/50 dark:text-white/50">
        Repository list arrives in M2.
      </p>
    </main>
  );
}
