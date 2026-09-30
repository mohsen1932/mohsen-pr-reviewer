/**
 * URL policy for rendered finding bodies. SPEC.md §12.
 *
 * Finding bodies are written by the model from repository content an attacker
 * can influence by opening a pull request, so the renderer must not execute
 * anything it is handed. react-markdown already refuses raw HTML unless
 * rehype-raw is added — which this app never does — leaving link and image URLs
 * as the remaining surface.
 */

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/** Control characters are used to smuggle a scheme past a naive check. */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Returns the URL if it is safe to render, or an empty string, which renders as
 * an inert link. Relative URLs are allowed; anything with an unexpected scheme
 * is not.
 */
export function safeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (hasControlCharacter(trimmed)) return "";

  // A relative URL has no scheme to check. Scheme-relative ("//host") is
  // rejected: it inherits the page protocol and points off-origin.
  if (!SCHEME.test(trimmed)) {
    return trimmed.startsWith("//") ? "" : trimmed;
  }

  try {
    const parsed = new URL(trimmed, "https://example.invalid");
    return SAFE_PROTOCOLS.has(parsed.protocol) ? trimmed : "";
  } catch {
    return "";
  }
}
