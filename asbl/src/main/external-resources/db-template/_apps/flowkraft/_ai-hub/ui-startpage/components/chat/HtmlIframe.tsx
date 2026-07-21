"use client";

import { useEffect, useRef } from "react";
import { withAutoResize } from "@/lib/chat/kroki";
import { useDebouncedValue } from "@/lib/chat/useDebouncedValue";

/** Auto-resizing, SANDBOXED iframe for self-contained HTML content (mockups, Mermaid,
 *  Chart.js, D3…). `sandbox="allow-scripts"` (deliberately no allow-same-origin) lets the
 *  CDN JS run but blocks the frame from touching the parent page / cookies. Runs entirely
 *  client-side. Streaming-safe: the srcDoc is debounced so a fence still being streamed
 *  reloads the frame at most ~2×/s, not once per token delta. */
export function HtmlIframe({
  content,
  label,
  onFullScreen,
  fullScreenButtonId,
}: {
  content: string;
  label: string;
  onFullScreen: () => void;
  fullScreenButtonId?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const settled = useDebouncedValue(content, 450);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "iframe-resize" && iframeRef.current && e.source === iframeRef.current.contentWindow) {
        iframeRef.current.style.height = `${e.data.height}px`;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex justify-between items-center px-3 py-1.5 text-xs text-base-content/60 border-b bg-base-200/50">
        <span>{label}</span>
        <button
          id={fullScreenButtonId}
          onClick={onFullScreen}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors hover:bg-base-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-3 w-3"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg> View Full Screen
        </button>
      </div>
      <iframe
        ref={iframeRef}
        srcDoc={withAutoResize(settled)}
        sandbox="allow-scripts"
        className="w-full border-0 bg-white"
        style={{ minHeight: "200px" }}
      />
    </div>
  );
}
