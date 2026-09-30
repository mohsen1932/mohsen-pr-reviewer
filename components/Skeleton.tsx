/** Placeholder rows, so a slow GitHub call does not render as a blank page. */
export default function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5 not-last:border-b not-last:border-line">
          <div className="h-3 w-1/3 animate-pulse rounded bg-hover" />
          <div className="ml-auto h-3 w-16 animate-pulse rounded bg-hover" />
        </div>
      ))}
    </div>
  );
}
