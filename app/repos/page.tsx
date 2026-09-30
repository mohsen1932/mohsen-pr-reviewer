import AppShell from "@/components/AppShell";
import CacheControl from "@/components/CacheControl";
import RepoList from "@/components/RepoList";
import RepoUrlInput from "@/components/RepoUrlInput";
import SetupNotice from "@/components/SetupNotice";
import { Notice, PageTitle } from "@/components/ui";
import { getAuthenticatedUser } from "@/lib/github";
import { listRepos } from "@/lib/repos";
import { cacheSizeBytes } from "@/lib/review/checkout";
import { scrubError } from "@/lib/scrub";
import { runStartupChecks } from "@/lib/startup";

export const dynamic = "force-dynamic";

export default async function ReposPage() {
  const report = await runStartupChecks();
  if (!report.canBrowse) {
    return (
      <AppShell>
        <SetupNotice report={report} />
      </AppShell>
    );
  }

  const blocked = report.checks.filter((c) => !c.ok);
  const [user, repos, cacheBytes] = await Promise.all([
    getAuthenticatedUser().catch(() => null),
    listRepos().catch((error: unknown) => scrubError(error)),
    cacheSizeBytes().catch(() => 0),
  ]);

  return (
    <AppShell user={user}>
      <PageTitle eyebrow="Repositories">Pick a repository</PageTitle>

      <div className="mt-6">
        <RepoUrlInput />
      </div>

      {blocked.length > 0 && (
        <div className="mt-5">
          <Notice title="Reviews are unavailable">
            {blocked.map((c) => `${c.label} — ${c.problem}`).join("; ")}
          </Notice>
        </div>
      )}

      <div className="mt-8">
        {typeof repos === "string" ? (
          <Notice tone="del" title="Could not list repositories">
            {repos}
          </Notice>
        ) : (
          <RepoList repos={repos} />
        )}
      </div>

      <CacheControl initialBytes={cacheBytes} />
    </AppShell>
  );
}
