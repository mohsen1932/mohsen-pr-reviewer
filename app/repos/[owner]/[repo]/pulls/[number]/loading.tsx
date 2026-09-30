import AppShell from "@/components/AppShell";
import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <AppShell>
      <div className="h-4 w-32 animate-pulse rounded bg-hover" aria-hidden />
      <div className="mt-4 h-6 w-2/3 animate-pulse rounded bg-hover" aria-hidden />
      <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-hover" aria-hidden />
      <div className="mt-8">
        <Skeleton rows={4} />
      </div>
    </AppShell>
  );
}
