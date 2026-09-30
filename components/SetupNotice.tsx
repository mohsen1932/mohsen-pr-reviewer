import type { Check, StartupReport } from "@/lib/startup";

/**
 * Shown when startup validation fails. SPEC.md §14.
 *
 * One row per check, with the problem and the fix. Never renders a credential —
 * `detail` and `problem` come from lib/startup.ts, which scrubs.
 */

function Row({ check }: { check: Check }) {
  return (
    <li className="flex gap-3 border-b border-black/10 py-4 last:border-0 dark:border-white/15">
      <span
        aria-hidden
        className={`mt-1 size-2 shrink-0 rounded-full ${
          check.ok ? "bg-emerald-500" : "bg-red-500"
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <code className="font-mono text-sm font-medium">{check.label}</code>
          <span className="text-xs text-black/50 dark:text-white/50">
            {check.ok ? `ok — ${check.detail}` : check.problem}
          </span>
        </div>
        {!check.ok && check.fix && (
          <p className="mt-1 text-sm text-black/70 dark:text-white/70">{check.fix}</p>
        )}
      </div>
    </li>
  );
}

export default function SetupNotice({ report }: { report: StartupReport }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Local PR Reviewer</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Setup is incomplete. Copy <code className="font-mono">.env.example</code> to{" "}
        <code className="font-mono">.env</code>, fill it in, and restart.
      </p>

      <ul className="mt-8">
        {report.checks.map((check) => (
          <Row key={check.id} check={check} />
        ))}
      </ul>

      <p className="mt-8 text-xs leading-relaxed text-black/50 dark:text-white/50">
        This app runs on your machine with your credentials and has no
        authentication. Keep it on localhost — anyone who can reach the port can
        read your private repositories and spend your Anthropic balance.
      </p>
    </main>
  );
}
