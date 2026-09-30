/**
 * Credential scrubbing. SPEC.md §12: no credential may reach a client component
 * prop, a JSON response, or a log line.
 *
 * Everything that crosses the server→browser boundary, and every log line,
 * passes through `scrub()`. It redacts both the configured secrets (exact match)
 * and anything that merely looks like a credential, so a token leaked from a
 * third-party error string is caught too.
 */

const TOKEN_PATTERNS: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g, // classic PAT / OAuth / server / refresh
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g, // fine-grained PAT
  /\bsk-ant-[A-Za-z0-9_-]{16,}/g, // Anthropic API key
  /\bsk-proj-[A-Za-z0-9_-]{16,}/g, // OpenAI project key
  /\bsk-svcacct-[A-Za-z0-9_-]{16,}/g, // OpenAI service account key
  /\bsk-[A-Za-z0-9]{20,}/g, // OpenAI legacy key
];

const REDACTED = "[redacted]";

/** Secrets registered at startup, redacted by exact match. */
const knownSecrets = new Set<string>();

export function registerSecret(value: string | undefined): void {
  // Short values would match too much; a real credential is never this short.
  if (value && value.length >= 12) knownSecrets.add(value);
}

export function scrub(input: string): string {
  let out = input;
  for (const secret of knownSecrets) out = out.split(secret).join(REDACTED);
  for (const pattern of TOKEN_PATTERNS) out = out.replace(pattern, REDACTED);
  return out;
}

/**
 * Turn an unknown thrown value into a message safe to log or return.
 * Never returns a stack trace — stacks routinely embed request URLs.
 */
export function scrubError(error: unknown): string {
  if (error instanceof Error) return scrub(error.message);
  if (typeof error === "string") return scrub(error);
  try {
    return scrub(JSON.stringify(error));
  } catch {
    return "Unknown error";
  }
}
