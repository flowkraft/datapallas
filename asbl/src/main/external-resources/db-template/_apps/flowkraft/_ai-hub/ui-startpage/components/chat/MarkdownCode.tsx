"use client";

import React from "react";
import Prism from "prismjs";
import "@/lib/chat/prism-setup";
import { krokiUrl, openHtmlInBrowser } from "@/lib/chat/kroki";
import { PlantUmlDiagram } from "./PlantUmlDiagram";
import { HtmlIframe } from "./HtmlIframe";

/**
 * A fenced code block with its own Copy button — so a user can lift a single snippet
 * (a SQL query, a Groovy script) straight out, instead of copying the whole reply.
 * The button stays visible at low opacity (so it's tappable on touch, no hover needed)
 * and brightens on hover. Pass `highlightedHtml` for a Prism-highlighted block, or omit
 * it for a plain block — either way the raw `code` is what gets copied.
 */
function CodeBlock({ code, highlightedHtml }: { code: string; highlightedHtml?: string }) {
  const [copied, setCopied] = React.useState(false);
  const onCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="group relative my-2">
      <button
        onClick={onCopy}
        title="Copy code"
        aria-label={copied ? "Copied" : "Copy code"}
        className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/30 px-2 py-1 text-xs text-white/80 opacity-60 backdrop-blur-sm transition-opacity hover:bg-black/50 hover:opacity-100 focus:opacity-100"
      >
        {copied ? (
          <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-3 w-3"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg> Copied</>
        ) : (
          <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-3 w-3"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg> Copy</>
        )}
      </button>
      <pre className="overflow-x-auto rounded-lg bg-code-bg text-code-fg p-4 text-xs" style={{ margin: 0 }}>
        {highlightedHtml !== undefined
          ? <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
          : <code>{code}</code>}
      </pre>
    </div>
  );
}

/**
 * Code renderer for ReactMarkdown (react-markdown v10 — block-vs-inline via the language-
 * className, not the removed `inline` prop). This is the SUPERSET renderer shared by every
 * agent, so any of them can render diagrams straight from a fenced block in its reply:
 *   - ```plantuml → Kroki SVG diagram (robust fetch + source fallback), with Full Screen
 *   - ```html     → self-contained page (Mermaid / Chart.js / D3 / mockups) in a sandboxed iframe
 *   - ```svg      → inline SVG (SMIL/CSS/JS animations play) inside a sandboxed iframe
 *   - a recognized language → Prism syntax highlighting
 *   - any other fenced block → plain dark code block
 *   - inline code → styled inline
 *
 * chat2db/Athena's SQL and Python charts arrive as structured content_segments instead
 * (executed server-side), so they never reach here — but her narrative CAN carry a ```svg,
 * and now renders it, for free.
 */
export function MarkdownCode({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
  const match = /language-(\w+)/.exec(className || "");
  const lang = match ? match[1] : "";
  const code = String(children).replace(/\n$/, "");

  if (lang === "plantuml") {
    return (
      <div className="my-2 overflow-hidden rounded-xl border">
        <div className="flex items-center justify-between border-b bg-base-200/50 px-3 py-1.5 text-xs text-base-content/60">
          <span>PlantUML Diagram</span>
          <button
            onClick={() => window.open(krokiUrl("plantuml", code), "_blank")}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors hover:bg-base-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-3 w-3"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg> View Full Screen
          </button>
        </div>
        <div className="flex justify-center bg-base-100 p-4">
          <PlantUmlDiagram source={code} />
        </div>
      </div>
    );
  }

  // Self-contained ```html page (Mermaid / Chart.js / D3 / mockups) → sandboxed iframe.
  if (lang === "html") {
    return <HtmlIframe content={code} label="Diagram / HTML" onFullScreen={() => openHtmlInBrowser(code)} />;
  }

  // Ad-hoc ```svg → render INLINE as an image (not code) inside the sandboxed iframe, so SMIL/CSS/JS
  // animations play and any script is contained. Lets an agent sketch or animate a concept on the fly.
  if (lang === "svg") {
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:8px;display:flex;justify-content:center;background:#fff}svg{max-width:100%;height:auto}</style></head><body>${code}</body></html>`;
    return <HtmlIframe content={doc} label="SVG" onFullScreen={() => openHtmlInBrowser(doc)} />;
  }

  if (lang && Prism.languages[lang]) {
    const highlighted = Prism.highlight(code, Prism.languages[lang], lang);
    return <CodeBlock code={code} highlightedHtml={highlighted} />;
  }

  // Fenced block without recognized language — dark code block, no highlighting.
  if (className?.startsWith("language-")) {
    return <CodeBlock code={code} />;
  }

  // Inline code.
  return <code className="rounded bg-base-200 px-1.5 py-0.5 text-xs" {...props}>{children}</code>;
}

/** Shared markdown components — links open in a new tab; code via the superset renderer;
 *  `pre` is a passthrough so the block components above aren't double-wrapped. */
export const markdownComponents = {
  a: (props: any) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-primary underline" />,
  code: MarkdownCode,
  pre: ({ children }: React.HTMLAttributes<HTMLPreElement>) => <>{children}</>,
};
