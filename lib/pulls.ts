import { github } from "./github";
import { parsePatch, type ParsedPatch } from "./diff";
import { selectFiles, type ChangedFile, type Exclusion, type SelectedFile } from "./pr-files";
import { assertRepoRef, parsePullNumber } from "./validate";

/** SPEC.md §6. */
export type PullSummary = {
  number: number;
  title: string;
  author: string;
  authorAvatar: string;
  draft: boolean;
  createdAt: string;
  updatedAt: string;
  headSha: string;
  baseRef: string;
  headRef: string;
  url: string;
};

export type PullFile = SelectedFile & {
  parsed: ParsedPatch;
};

export type PullDetail = PullSummary & {
  body: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  /** True when the PR author is the token's own user — REQUEST_CHANGES is
   *  rejected by GitHub on your own PR (§6). */
  authoredByViewer: boolean;
  files: PullFile[];
  excluded: Exclusion[];
  totalPatchBytes: number;
};

type ApiPull = {
  number: number;
  title: string;
  draft?: boolean;
  created_at: string;
  updated_at: string;
  html_url: string;
  user: { login: string; avatar_url: string } | null;
  head: { sha: string; ref: string };
  base: { ref: string };
};

function toSummary(p: ApiPull): PullSummary {
  return {
    number: p.number,
    title: p.title,
    author: p.user?.login ?? "unknown",
    authorAvatar: p.user?.avatar_url ?? "",
    draft: p.draft ?? false,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    headSha: p.head.sha,
    baseRef: p.base.ref,
    headRef: p.head.ref,
    url: p.html_url,
  };
}

export async function listOpenPulls(owner: string, repo: string): Promise<PullSummary[]> {
  assertRepoRef(owner, repo);
  const gh = github();
  const pulls = await gh.paginate(gh.rest.pulls.list, {
    owner,
    repo,
    state: "open",
    sort: "updated",
    direction: "desc",
    per_page: 100,
  });
  return (pulls as ApiPull[]).map(toSummary);
}

export async function getPullDetail(
  owner: string,
  repo: string,
  pullNumber: number | string,
): Promise<PullDetail> {
  assertRepoRef(owner, repo);
  const number = parsePullNumber(pullNumber);
  const gh = github();

  const [{ data: pull }, changed, { data: viewer }] = await Promise.all([
    gh.rest.pulls.get({ owner, repo, pull_number: number }),
    gh.paginate(gh.rest.pulls.listFiles, { owner, repo, pull_number: number, per_page: 100 }),
    gh.rest.users.getAuthenticated(),
  ]);

  const selection = selectFiles(
    (changed as ChangedFile[]).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      patch: f.patch,
      previousFilename: f.previousFilename,
    })),
  );

  return {
    ...toSummary(pull as unknown as ApiPull),
    body: pull.body ?? null,
    additions: pull.additions,
    deletions: pull.deletions,
    changedFiles: pull.changed_files,
    authoredByViewer: pull.user?.login === viewer.login,
    files: selection.files.map((f) => ({ ...f, parsed: parsePatch(f.patch) })),
    excluded: selection.excluded,
    totalPatchBytes: selection.totalPatchBytes,
  };
}
