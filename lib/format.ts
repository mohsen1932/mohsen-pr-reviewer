/** Small display helpers shared by the list views. */

export function relativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";

  const seconds = Math.round((now.getTime() - then) / 1000);
  if (seconds < 0) return "just now";

  const units: [limit: number, size: number, name: string][] = [
    [60, 1, "second"],
    [3600, 60, "minute"],
    [86400, 3600, "hour"],
    [2592000, 86400, "day"],
    [31536000, 2592000, "month"],
    [Infinity, 31536000, "year"],
  ];

  for (const [limit, size, name] of units) {
    if (seconds < limit) {
      const n = Math.floor(seconds / size);
      if (name === "second" && n < 10) return "just now";
      return `${n} ${name}${n === 1 ? "" : "s"} ago`;
    }
  }
  return "unknown";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
