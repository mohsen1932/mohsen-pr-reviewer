"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Paste a repo or PR URL and go straight there. SPEC.md §6. */
export default function RepoUrlInput() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/repos/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not resolve that URL.");
        return;
      }
      // A pasted PR link goes straight to the PR, not the list.
      router.push(
        data.pullNumber
          ? `/repos/${data.owner}/${data.repo}/pulls/${data.pullNumber}`
          : `/repos/${data.owner}/${data.repo}/pulls`,
      );
    } catch {
      setError("Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="owner/repo, or paste a github.com URL"
          aria-label="Repository URL"
          className="min-w-0 flex-1 rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        />
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="shrink-0 rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-40 dark:border-white/20"
        >
          {busy ? "Opening…" : "Open"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
