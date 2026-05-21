"use client";

import { useState, useCallback } from "react";
// lucide-react removed
import dynamic from "next/dynamic";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror").then((m) => m.default), { ssr: false });

const EXAMPLE_TITLES: Record<string, string> = {
  tabulator:     "Table DSL Example",
  chart:         "Chart DSL Example",
  pivot:         "Pivot DSL Example",
  "filter-pane": "Filter Pane DSL Example",
  "filter-bar":  "Parameters DSL Example",
  number:        "Number (rb-value) — No DSL Needed",
};

export interface DslExampleDialogProps {
  open: boolean;
  onClose: () => void;
  componentType: string;
  example: string;
}

export function DslExampleDialog({ open, onClose, componentType, example }: DslExampleDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(example);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [example]);

  if (!open) return null;

  const title = EXAMPLE_TITLES[componentType] ?? `${componentType} DSL Example`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="relative w-full max-w-2xl bg-base-100 border border-base-300 rounded-xl shadow-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-base-300 shrink-0">
          <span className="font-semibold text-sm text-base-content">{title}</span>
          <button
            onClick={onClose}
            className="text-base-content/60 hover:text-base-content transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Code editor — read-only, Groovy DSL */}
        <div className="flex-1 overflow-hidden p-4">
          <div className="border border-base-300 rounded-md overflow-hidden">
            {CodeMirror && (
              <CodeMirror
                value={example}
                readOnly
                height="420px"
                theme="dark"
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: false,
                  autocompletion: false,
                }}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-base-300 shrink-0">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors"
          >
            {copied
              ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
              : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
            }
            {copied ? "Copied!" : "Copy to Clipboard"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-xs font-medium border border-base-300 bg-base-100 hover:bg-base-200 text-base-content transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
