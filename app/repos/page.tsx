import RepoList from "@/components/RepoList";
import RepoUrlInput from "@/components/RepoUrlInput";
import SetupNotice from "@/components/SetupNotice";
import { listRepos } from "@/lib/repos";
import { scrubError } from "@/lib/scrub";
import { runStartupChecks } from "@/lib/startup";

export const dynamic = "force-dynamic";

export default async function ReposPage() {
  const report = await runStartupChecks();
  if (!report.canBrowse) return <SetupNotice report={report} />;

  const blocked = report.checks.filter((c) => !c.ok);

  let repos;
  try {
    repos = await listRepos();
  } catch (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-xl font-semibold">Local PR Reviewer</h1>
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">
          Could not list repositories: {scrubError(error)}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-xl font-semibold tracking-tight">Local PR Reviewer</h1>

      {blocked.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Reviews are unavailable:{" "}
          {blocked.map((c) => `${c.label} — ${c.problem}`).join("; ")}
        </div>
      )}

      <RepoUrlInput />

      <div className="mt-8">
        <RepoList repos={repos} />
      </div>
    </main>
  );
}
