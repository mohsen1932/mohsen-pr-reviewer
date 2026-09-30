import AppShell from "@/components/AppShell";
import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <AppShell>
      <div className="h-4 w-24 animate-pulse rounded bg-hover" aria-hidden />
      <div className="mt-4 h-6 w-48 animate-pulse rounded bg-hover" aria-hidden />
      <div className="mt-6">
        <Skeleton rows={5} />
      </div>
    </AppShell>
  );
}
