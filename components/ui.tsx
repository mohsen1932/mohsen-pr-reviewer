import type { ReactNode } from "react";

/** Shared primitives, so one visual language is defined in one place. */

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "warn" | "add" | "del";
}) {
  const tones = {
    neutral: "border-line-strong text-ink-subtle",
    accent: "border-accent/30 text-accent",
    warn: "border-warn/30 text-warn",
    add: "border-add/30 text-add",
    del: "border-del/30 text-del",
  } as const;
  return (
    <span
      className={`rounded border px-1.5 py-px text-[10px] font-medium uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-line bg-surface ${className}`}>{children}</div>
  );
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[0.85em] ${className}`}>{children}</span>;
}

export function DiffStat({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="font-mono text-xs tabular-nums">
      <span className="text-add">+{additions.toLocaleString()}</span>{" "}
      <span className="text-del">−{deletions.toLocaleString()}</span>
    </span>
  );
}

export function PageTitle({ children, eyebrow }: { children: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div>
      {eyebrow && <div className="mb-1 text-xs text-ink-subtle">{eyebrow}</div>}
      <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">{children}</h1>
    </div>
  );
}

export function Notice({
  tone = "warn",
  title,
  children,
}: {
  tone?: "warn" | "del" | "neutral";
  title?: ReactNode;
  children: ReactNode;
}) {
  const tones = {
    warn: "border-warn/25 bg-warn/[0.06] text-warn",
    del: "border-del/25 bg-del/[0.06] text-del",
    neutral: "border-line bg-raised text-ink-muted",
  } as const;
  return (
    <div className={`rounded-lg border px-3.5 py-3 text-sm ${tones[tone]}`}>
      {title && <p className="font-medium">{title}</p>}
      <div className={title ? "mt-1 text-ink-muted" : "text-ink-muted"}>{children}</div>
    </div>
  );
}
