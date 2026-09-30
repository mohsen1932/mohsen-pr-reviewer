import { Octokit } from "@octokit/rest";
import { config } from "./config";

/**
 * Octokit built from GITHUB_TOKEN. SPEC.md §3, §6.
 *
 * The process serves exactly one user, so a module-level singleton is correct —
 * there is no per-request identity to thread through.
 */

let client: Octokit | undefined;

/** Throws if the token is absent; callers past the setup gate can assume it. */
export function github(): Octokit {
  if (!config.githubToken) {
    throw new Error("GITHUB_TOKEN is not set");
  }
  client ??= new Octokit({
    auth: config.githubToken,
    userAgent: "local-pr-reviewer",
  });
  return client;
}

export type GitHubUser = {
  login: string;
  name: string | null;
  avatarUrl: string;
};

export async function getAuthenticatedUser(): Promise<GitHubUser> {
  const { data } = await github().rest.users.getAuthenticated();
  return { login: data.login, name: data.name ?? null, avatarUrl: data.avatar_url };
}
