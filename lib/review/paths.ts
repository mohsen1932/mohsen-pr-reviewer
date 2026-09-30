import path from "node:path";

/**
 * Containment for the agent's file tools. SPEC.md §12.
 *
 * Nothing else stops a tool from reading outside the checkout — every path the
 * model supplies passes through here, and the tools have no other way to touch
 * the filesystem.
 */

export class PathEscapeError extends Error {
  readonly requested: string;

  constructor(requested: string) {
    super(`Refused: "${requested}" is outside the checkout.`);
    this.name = "PathEscapeError";
    this.requested = requested;
  }
}

/**
 * Resolve a model-supplied path against the checkout root and prove it stayed
 * inside. Rejects absolute paths, traversal, and symlink-shaped inputs before
 * resolution rather than trusting the result.
 */
export function resolveInside(root: string, requested: string): string {
  if (!requested || requested.includes("\0")) throw new PathEscapeError(requested);
  if (path.isAbsolute(requested) || /^[A-Za-z]:/.test(requested)) {
    throw new PathEscapeError(requested);
  }

  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, requested);
  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;

  if (target !== resolvedRoot && !target.startsWith(rootWithSep)) {
    throw new PathEscapeError(requested);
  }
  // .git holds the credential helper config and the object store; the review
  // has no reason to read it, and git tools reach history through git itself.
  const relative = path.relative(resolvedRoot, target);
  if (relative === ".git" || relative.startsWith(`.git${path.sep}`)) {
    throw new PathEscapeError(requested);
  }
  return target;
}

/** Repo-relative form, for display and for passing back to git. */
export function toRepoRelative(root: string, absolute: string): string {
  return path.relative(path.resolve(root), absolute).split(path.sep).join("/");
}
