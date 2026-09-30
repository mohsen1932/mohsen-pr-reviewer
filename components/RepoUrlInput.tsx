"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
    <form onSubmit={submit}>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="owner/repo, or paste any github.com link"
          aria-label="Repository or pull request URL"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-line-strong focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="shrink-0 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-25"
        >
          {busy ? "Opening…" : "Open"}
        </button>
      </div>
      {error && <p className="mt-2 text-[13px] text-del">{error}</p>}
    </form>
  );
}
