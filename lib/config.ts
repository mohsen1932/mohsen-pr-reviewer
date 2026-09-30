import path from "node:path";
import { registerSecret } from "./scrub";

/**
 * Configuration from `.env`. SPEC.md §5, §14.
 *
 * Nothing here throws on a missing credential: the app must boot far enough to
 * render the setup screen that explains what is missing (§14).
 */

const EFFORTS = ["minimal", "low", "medium", "high", "xhigh"] as const;
export type Effort = (typeof EFFORTS)[number];

function effortFromEnv(raw: string | undefined): Effort {
  if (raw && (EFFORTS as readonly string[]).includes(raw)) return raw as Effort;
  return "high";
}

export const config = {
  githubToken: process.env.GITHUB_TOKEN?.trim() || undefined,
  openaiApiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
  reviewModel: process.env.REVIEW_MODEL?.trim() || "gpt-5.4-mini",
  reviewEffort: effortFromEnv(process.env.REVIEW_EFFORT?.trim()),
} as const;

/**
 * Where git checkouts live (SPEC.md §7.2).
 *
 * Resolved lazily: calling process.cwd() at module scope makes the bundler try
 * to trace a dynamic filesystem path at build time.
 */
export function cacheDir(): string {
  const configured = process.env.CACHE_DIR?.trim();
  return configured
    ? path.resolve(configured)
    : path.join(process.cwd(), ".cache", "repos");
}

registerSecret(config.githubToken);
registerSecret(config.openaiApiKey);
