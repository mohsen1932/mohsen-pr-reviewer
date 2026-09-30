/**
 * Which changed files a review looks at, and why some are left out.
 * SPEC.md §11.
 *
 * Every exclusion is recorded and surfaced — the reader must know what was not
 * looked at, so scope reduction is never silent.
 */

export type Limits = {
  maxFiles: number;
  maxTotalPatchBytes: number;
  maxSinglePatchBytes: number;
};

export const LIMITS: Limits = {
  maxFiles: 60,
  maxTotalPatchBytes: 400 * 1024,
  maxSinglePatchBytes: 64 * 1024,
};

export type ChangedFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previousFilename?: string;
};

export type ExclusionReason =
  | "generated"
  | "binary"
  | "file-limit"
  | "byte-budget"
  | "patch-too-large";

export type SelectedFile = ChangedFile & {
  /** Cleared when the file's own patch blows the per-file limit. */
  patch?: string;
  patchOmitted?: boolean;
};

export type Exclusion = { filename: string; reason: ExclusionReason };

export type FileSelection = {
  files: SelectedFile[];
  excluded: Exclusion[];
  totalPatchBytes: number;
};

/** Lockfiles and other machine-authored files, matched on basename. */
const LOCKFILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "npm-shrinkwrap.json",
  "bun.lockb",
  "composer.lock",
  "Gemfile.lock",
  "Cargo.lock",
  "poetry.lock",
  "Pipfile.lock",
  "go.sum",
  "packages.lock.json",
  "pubspec.lock",
  "flake.lock",
]);

const GENERATED_PATH = [
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)vendor\//,
  /(^|\/)node_modules\//,
  /(^|\/)__generated__\//,
  /(^|\/)\.next\//,
  /\.min\.(js|css|mjs|cjs)$/,
  /\.bundle\.(js|css)$/,
  /\.(pb|generated)\.(go|ts|js|py|cs|java)$/,
  /_pb2\.py$/,
  /\.g\.dart$/,
  /\.lock$/,
  /(^|\/)go\.sum$/,
];

const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|svgz|pdf|zip|gz|tgz|bz2|xz|7z|rar|mp[34]|wav|ogg|flac|mov|mp4|avi|webm|woff2?|ttf|otf|eot|so|dylib|dll|exe|bin|dat|class|jar|wasm|db|sqlite3?|psd|ai|sketch)$/i;

export function isGenerated(filename: string): boolean {
  const base = filename.split("/").pop() ?? filename;
  if (LOCKFILES.has(base)) return true;
  return GENERATED_PATH.some((re) => re.test(filename));
}

export function isBinary(file: ChangedFile): boolean {
  if (BINARY_EXT.test(file.filename)) return true;
  // GitHub omits `patch` for binary files; a rename with no content change also
  // has no patch, so only treat it as binary when lines genuinely changed.
  return file.patch === undefined && file.changes > 0 && file.status !== "renamed";
}

const byteLength = (s: string) => Buffer.byteLength(s, "utf8");

/**
 * Drop what cannot be reviewed, then order by signal and truncate to budget.
 *
 * "Largest-signal" is total changed lines descending, after exclusions — not a
 * heuristic about file type, which would be guessing. Ties break on filename so
 * the selection is deterministic and therefore testable.
 */
export function selectFiles(
  changed: ChangedFile[],
  limits: Limits = LIMITS,
): FileSelection {
  const excluded: Exclusion[] = [];
  const candidates: ChangedFile[] = [];

  for (const file of changed) {
    if (isGenerated(file.filename)) {
      excluded.push({ filename: file.filename, reason: "generated" });
    } else if (isBinary(file)) {
      excluded.push({ filename: file.filename, reason: "binary" });
    } else {
      candidates.push(file);
    }
  }

  candidates.sort((a, b) => b.changes - a.changes || a.filename.localeCompare(b.filename));

  const files: SelectedFile[] = [];
  let totalPatchBytes = 0;

  for (const file of candidates) {
    if (files.length >= limits.maxFiles) {
      excluded.push({ filename: file.filename, reason: "file-limit" });
      continue;
    }

    const size = file.patch ? byteLength(file.patch) : 0;

    // Keep the file, drop the patch: that it changed is still worth knowing.
    if (size > limits.maxSinglePatchBytes) {
      files.push({ ...file, patch: undefined, patchOmitted: true });
      excluded.push({ filename: file.filename, reason: "patch-too-large" });
      continue;
    }

    if (totalPatchBytes + size > limits.maxTotalPatchBytes) {
      excluded.push({ filename: file.filename, reason: "byte-budget" });
      continue;
    }

    files.push(file);
    totalPatchBytes += size;
  }

  return { files, excluded, totalPatchBytes };
}

export function summarizeExclusions(excluded: Exclusion[]): string[] {
  const labels: Record<ExclusionReason, string> = {
    generated: "generated or lockfile",
    binary: "binary",
    "file-limit": `beyond the ${LIMITS.maxFiles}-file limit`,
    "byte-budget": "beyond the diff size budget",
    "patch-too-large": "patch omitted (over 64 KB)",
  };
  const counts = new Map<ExclusionReason, number>();
  for (const e of excluded) counts.set(e.reason, (counts.get(e.reason) ?? 0) + 1);
  return [...counts].map(([reason, n]) => `${n} ${labels[reason]}`);
}
