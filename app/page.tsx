import { redirect } from "next/navigation";
import SetupNotice from "@/components/SetupNotice";
import { runStartupChecks } from "@/lib/startup";

export const dynamic = "force-dynamic";

export default async function Home() {
  const report = await runStartupChecks();

  // Browsing only needs GitHub; a missing Anthropic key gates reviews, not
  // navigation (SPEC.md §14).
  if (report.canBrowse) redirect("/repos");

  return <SetupNotice report={report} />;
}
