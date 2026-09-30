"use client";

import ReactMarkdown from "react-markdown";
import { safeUrl } from "@/lib/findings/markdown";

/**
 * Renders a finding body. SPEC.md §12.
 *
 * react-markdown does not render raw HTML unless rehype-raw is supplied, and it
 * is not supplied here or anywhere else in this app. URLs go through safeUrl so
 * a `javascript:` link in model output renders inert.
 */
export default function FindingBody({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-2 text-[13px] leading-relaxed text-ink-muted">
      <ReactMarkdown
        urlTransform={safeUrl}
        components={{
          p: ({ children }) => <p>{children}</p>,
          code: ({ children }) => (
            <code className="rounded bg-raised px-1 py-0.5 font-mono text-[12px] text-ink">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-md border border-line bg-canvas p-3 font-mono text-[12px] text-ink">
              {children}
            </pre>
          ),
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer nofollow"
              className="text-accent underline underline-offset-2"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className="text-ink">{children}</strong>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
