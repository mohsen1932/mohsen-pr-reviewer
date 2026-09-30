import AppShell from "@/components/AppShell";
import Skeleton from "@/components/Skeleton";
import { PageTitle } from "@/components/ui";

export default function Loading() {
  return (
    <AppShell>
      <PageTitle eyebrow="Repositories">Pick a repository</PageTitle>
      <div className="mt-8">
        <Skeleton rows={8} />
      </div>
    </AppShell>
  );
}
