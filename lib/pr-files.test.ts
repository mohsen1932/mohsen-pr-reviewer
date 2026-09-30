import { describe, expect, it } from "vitest";
import {
  type ChangedFile,
  isBinary,
  isGenerated,
  LIMITS,
  selectFiles,
  summarizeExclusions,
} from "./pr-files";

function file(partial: Partial<ChangedFile> & { filename: string }): ChangedFile {
  const additions = partial.additions ?? 1;
  const deletions = partial.deletions ?? 0;
  return {
    status: "modified",
    additions,
    deletions,
    changes: partial.changes ?? additions + deletions,
    patch: "@@ -1,1 +1,1 @@\n+x",
    ...partial,
  };
}

describe("isGenerated", () => {
  it.each([
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "Cargo.lock",
    "go.sum",
    "Gemfile.lock",
    "poetry.lock",
    "flake.lock",
  ])("skips lockfile %s", (name) => {
    expect(isGenerated(name)).toBe(true);
  });

  it("matches a lockfile in a subdirectory", () => {
    expect(isGenerated("apps/web/package-lock.json")).toBe(true);
  });

  it.each([
    "dist/app.js",
    "build/main.css",
    "vendor/lib.go",
    "node_modules/x/index.js",
    "src/__generated__/types.ts",
    "public/app.min.js",
    "public/app.bundle.css",
    "api/service.pb.go",
    "proto/thing_pb2.py",
    "lib/model.g.dart",
  ])("skips generated path %s", (name) => {
    expect(isGenerated(name)).toBe(true);
  });

  it.each(["src/index.ts", "README.md", "app/dist-report.ts", "lib/building.ts"])(
    "keeps source file %s",
    (name) => {
      expect(isGenerated(name)).toBe(false);
    },
  );
});

describe("isBinary", () => {
  it.each(["logo.png", "doc.pdf", "font.woff2", "archive.tar.gz", "app.wasm"])(
    "detects %s by extension",
    (name) => {
      expect(isBinary(file({ filename: name }))).toBe(true);
    },
  );

  it("detects a missing patch with changed lines as binary", () => {
    expect(isBinary(file({ filename: "mystery", patch: undefined, changes: 4 }))).toBe(true);
  });

  it("does not call a pure rename binary", () => {
    const renamed = file({
      filename: "b.ts",
      status: "renamed",
      patch: undefined,
      changes: 0,
      previousFilename: "a.ts",
    });
    expect(isBinary(renamed)).toBe(false);
  });

  it("does not call an empty-change file binary", () => {
    expect(isBinary(file({ filename: "x.ts", patch: undefined, changes: 0 }))).toBe(false);
  });

  it("is case-insensitive on extensions", () => {
    expect(isBinary(file({ filename: "IMAGE.PNG" }))).toBe(true);
  });
});

describe("selectFiles", () => {
  it("keeps ordinary source files", () => {
    const { files, excluded } = selectFiles([file({ filename: "src/a.ts" })]);
    expect(files.map((f) => f.filename)).toEqual(["src/a.ts"]);
    expect(excluded).toEqual([]);
  });

  it("excludes generated and binary files with a recorded reason", () => {
    const { files, excluded } = selectFiles([
      file({ filename: "src/a.ts" }),
      file({ filename: "yarn.lock" }),
      file({ filename: "logo.png" }),
    ]);
    expect(files.map((f) => f.filename)).toEqual(["src/a.ts"]);
    expect(excluded).toEqual([
      { filename: "yarn.lock", reason: "generated" },
      { filename: "logo.png", reason: "binary" },
    ]);
  });

  it("orders by changed lines descending — largest signal first", () => {
    const { files } = selectFiles([
      file({ filename: "small.ts", changes: 2 }),
      file({ filename: "big.ts", changes: 90 }),
      file({ filename: "mid.ts", changes: 30 }),
    ]);
    expect(files.map((f) => f.filename)).toEqual(["big.ts", "mid.ts", "small.ts"]);
  });

  it("breaks ties on filename so selection is deterministic", () => {
    const { files } = selectFiles([
      file({ filename: "b.ts", changes: 5 }),
      file({ filename: "a.ts", changes: 5 }),
    ]);
    expect(files.map((f) => f.filename)).toEqual(["a.ts", "b.ts"]);
  });

  it("truncates at the file limit and records the rest", () => {
    const many = Array.from({ length: LIMITS.maxFiles + 5 }, (_, i) =>
      file({ filename: `src/f${String(i).padStart(3, "0")}.ts`, changes: 100 - i }),
    );
    const { files, excluded } = selectFiles(many);
    expect(files).toHaveLength(LIMITS.maxFiles);
    expect(excluded.filter((e) => e.reason === "file-limit")).toHaveLength(5);
  });

  it("keeps a file whose own patch is too large, but drops its patch", () => {
    const huge = "@@ -1,1 +1,1 @@\n" + "+x".repeat(LIMITS.maxSinglePatchBytes);
    const { files, excluded } = selectFiles([file({ filename: "huge.ts", patch: huge })]);
    expect(files[0]).toMatchObject({
      filename: "huge.ts",
      patch: undefined,
      patchOmitted: true,
    });
    expect(excluded).toEqual([{ filename: "huge.ts", reason: "patch-too-large" }]);
  });

  it("stops adding patches once the byte budget is spent", () => {
    const big = "@@ -1,1 +1,1 @@\n" + "+y".repeat(30 * 1024);
    const files = Array.from({ length: 12 }, (_, i) =>
      file({ filename: `src/f${i}.ts`, patch: big, changes: 100 - i }),
    );
    const selection = selectFiles(files);
    expect(selection.totalPatchBytes).toBeLessThanOrEqual(LIMITS.maxTotalPatchBytes);
    expect(selection.excluded.some((e) => e.reason === "byte-budget")).toBe(true);
  });

  it("counts bytes, not characters, so multi-byte content is budgeted correctly", () => {
    const { totalPatchBytes } = selectFiles([file({ filename: "a.ts", patch: "é" })]);
    expect(totalPatchBytes).toBe(2);
  });

  it("handles an empty changed-file list", () => {
    expect(selectFiles([])).toEqual({ files: [], excluded: [], totalPatchBytes: 0 });
  });

  it("honours injected limits", () => {
    const { files, excluded } = selectFiles(
      [file({ filename: "a.ts", changes: 9 }), file({ filename: "b.ts", changes: 1 })],
      { maxFiles: 1, maxTotalPatchBytes: 1024, maxSinglePatchBytes: 512 },
    );
    expect(files.map((f) => f.filename)).toEqual(["a.ts"]);
    expect(excluded).toEqual([{ filename: "b.ts", reason: "file-limit" }]);
  });
});

describe("summarizeExclusions", () => {
  it("groups by reason with counts", () => {
    const summary = summarizeExclusions([
      { filename: "a.lock", reason: "generated" },
      { filename: "b.lock", reason: "generated" },
      { filename: "c.png", reason: "binary" },
    ]);
    expect(summary).toEqual(["2 generated or lockfile", "1 binary"]);
  });

  it("is empty when nothing was excluded", () => {
    expect(summarizeExclusions([])).toEqual([]);
  });
});
