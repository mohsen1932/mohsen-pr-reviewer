import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import SetupNotice from "@/components/SetupNotice";
import { runStartupChecks } from "@/lib/startup";

export const dynamic = "force-dynamic";

export default async function Home() {
  const report = await runStartupChecks();

  // Browsing only needs GitHub; a missing OpenAI key gates reviews, not
  // navigation.
  if (report.canBrowse) redirect("/repos");

  return (
    <AppShell>
      <SetupNotice report={report} />
    </AppShell>
  );
}
