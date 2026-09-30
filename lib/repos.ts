import { github } from "./github";
import { assertRepoRef } from "./validate";

/** SPEC.md §6. */
export type RepoSummary = {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  description: string | null;
  defaultBranch: string;
  pushedAt: string | null;
  language: string | null;
  openIssues: number;
  /** Repository size in KB, from GitHub. Guards the clone (§11). */
  sizeKb: number;
};

type ApiRepo = {
  name: string;
  full_name: string;
  private: boolean;
  description?: string | null;
  default_branch?: string;
  pushed_at?: string | null;
  language?: string | null;
  open_issues_count?: number;
  size?: number;
  owner: { login: string } | null;
};

function toSummary(r: ApiRepo): RepoSummary {
  return {
    owner: r.owner?.login ?? r.full_name.split("/")[0],
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    description: r.description ?? null,
    defaultBranch: r.default_branch ?? "main",
    pushedAt: r.pushed_at ?? null,
    language: r.language ?? null,
    openIssues: r.open_issues_count ?? 0,
    sizeKb: r.size ?? 0,
  };
}

/**
 * Every repo the token can reach, most recently pushed first.
 *
 * `visibility: all` is explicit rather than relying on the default, and the
 * endpoint is paginated to completion — a truncated list reads as "my repo is
 * not there", which is indistinguishable from a permissions problem (§6).
 */
export async function listRepos(): Promise<RepoSummary[]> {
  const gh = github();
  const repos = await gh.paginate(gh.rest.repos.listForAuthenticatedUser, {
    affiliation: "owner,collaborator,organization_member",
    visibility: "all",
    sort: "pushed",
    direction: "desc",
    per_page: 100,
  });
  return (repos as ApiRepo[]).map(toSummary);
}

export async function getRepo(owner: string, repo: string): Promise<RepoSummary> {
  assertRepoRef(owner, repo);
  const { data } = await github().rest.repos.get({ owner, repo });
  return toSummary(data as unknown as ApiRepo);
}
