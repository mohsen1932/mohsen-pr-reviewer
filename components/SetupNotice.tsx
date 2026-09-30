import type { Check, StartupReport } from "@/lib/startup";

/** Shown when startup validation fails. Never renders a credential. */

function Row({ check }: { check: Check }) {
  return (
    <li className="flex gap-3.5 px-4 py-3.5 not-last:border-b not-last:border-line">
      <span
        aria-hidden
        className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
          check.ok ? "bg-add shadow-[0_0_8px] shadow-add/50" : "bg-del shadow-[0_0_8px] shadow-del/50"
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <code className="font-mono text-[13px] text-ink">{check.label}</code>
          <span className={`text-xs ${check.ok ? "text-ink-subtle" : "text-del"}`}>
            {check.ok ? check.detail : check.problem}
          </span>
        </div>
        {!check.ok && check.fix && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{check.fix}</p>
        )}
      </div>
    </li>
  );
}

export default function SetupNotice({ report }: { report: StartupReport }) {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Setup incomplete</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Copy <code className="font-mono text-ink">.env.example</code> to{" "}
        <code className="font-mono text-ink">.env</code>, fill it in, and restart.
      </p>

      <ul className="mt-7 overflow-hidden rounded-lg border border-line bg-surface">
        {report.checks.map((check) => (
          <Row key={check.id} check={check} />
        ))}
      </ul>

      <p className="mt-7 text-xs leading-relaxed text-ink-subtle">
        This runs on your machine with your credentials and has no authentication.
        Keep it on localhost — anyone who can reach the port can read your private
        repositories and spend your Anthropic balance.
      </p>
    </div>
  );
}
