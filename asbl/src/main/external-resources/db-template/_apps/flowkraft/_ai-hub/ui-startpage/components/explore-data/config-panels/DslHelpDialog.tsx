"use client";

import { useState, useCallback, useEffect } from "react";
// lucide-react removed
import type { ColumnSchema } from "@/lib/explore-data/types";
import { buildDslAiPrompt } from "@/lib/explore-data/ai-prompt-builder";
import { fetchCopilotUrl } from "@/lib/explore-data/rb-api";

const DIALOG_TITLES: Record<string, string> = {
  tabulator:     "Hey AI, Help Me Configure This Tabulator Table\u2026",
  chart:         "Hey AI, Help Me Configure This Chart\u2026",
  pivot:         "Hey AI, Help Me Configure This Pivot Table\u2026",
  "filter-pane": "Hey AI, Help Me Configure This Filter Pane\u2026",
  "filter-bar":  "Hey AI, Help Me Configure Dashboard Filters\u2026",
};

export interface DslHelpDialogProps {
  open: boolean;
  onClose: () => void;
  componentType: string;
  currentDsl: string;
  columns: ColumnSchema[];
  sampleData: Record<string, unknown>[];
}

export function DslHelpDialog({
  open,
  onClose,
  componentType,
  currentDsl,
  columns,
  sampleData,
}: DslHelpDialogProps) {
  const [requirement, setRequirement] = useState("");
  const [prompt, setPrompt] = useState("");
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [aiUrl, setAiUrl] = useState<string | null>(null);

  const title = DIALOG_TITLES[componentType] ?? `Hey AI, Help Me Configure This ${componentType}\u2026`;

  // Load the AI target URL from RB settings (cached singleton in rb-api.ts).
  useEffect(() => {
    if (!open) return;
    fetchCopilotUrl().then((url) => {
      if (url && url !== "https://chatgpt.com/") setAiUrl(url);
      else setAiUrl(url); // always set so we always show a link
    });
  }, [open]);

  const handleBuild = useCallback(async () => {
    setBuilding(true);
    setError(null);
    try {
      const result = await buildDslAiPrompt({
        componentType,
        requirement,
        columns,
        sampleData,
        currentDsl,
      });
      setPrompt(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to build prompt");
    } finally {
      setBuilding(false);
    }
  }, [componentType, requirement, columns, sampleData, currentDsl]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [prompt]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="relative w-full max-w-2xl bg-base-100 border border-base-300 rounded-xl shadow-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-base-300 shrink-0">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-violet-500"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 1 2.455 2.456ZM16.5 20.25l-.259 1.035a3.375 3.375 0 0 1-2.455 2.456L12.75 24l1.036-.259a3.375 3.375 0 0 0 2.455-2.456l.259-1.035Z" /></svg>
            <span className="font-semibold text-sm text-base-content">{title}</span>
          </div>
          <button
            onClick={onClose}
            className="text-base-content/60 hover:text-base-content transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-base-content">What do you need?</label>
            <textarea
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              placeholder={`Describe how you want to configure this — e.g. "Show country column with search filter, sort alphabetically, highlight rows where value > 1000"`}
              rows={3}
              className="w-full text-sm bg-base-100 border border-base-300 rounded-md px-3 py-2 text-base-content placeholder:text-base-content/60 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <button
            onClick={handleBuild}
            disabled={!requirement.trim() || building}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {building
              ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5 animate-spin"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
              : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 1 2.455 2.456ZM16.5 20.25l-.259 1.035a3.375 3.375 0 0 1-2.455 2.456L12.75 24l1.036-.259a3.375 3.375 0 0 0 2.455-2.456l.259-1.035Z" /></svg>
            }
            {building ? "Building\u2026" : "Build Prompt"}
          </button>

          {error && (
            <div className="text-xs text-error bg-error/10 border border-error/20 rounded-md p-2">
              {error}
            </div>
          )}

          {prompt && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-base-content">Ready-to-copy prompt</label>
              <textarea
                readOnly
                value={prompt}
                rows={14}
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                className="w-full text-xs font-mono bg-base-200/30 border border-base-300 rounded-md px-3 py-2 text-base-content resize-none focus:outline-none cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-base-300 shrink-0 gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-[10px] text-base-content/60">
              Paste into ChatGPT / Claude / any AI → get DSL back → paste into editor
            </p>
            {aiUrl && (
              <a
                href={aiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline truncate"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                {aiUrl}
              </a>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {prompt && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-base-300 bg-base-100 hover:bg-base-200 text-base-content transition-colors"
              >
                {copied
                  ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5 text-green-500"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                  : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
                }
                {copied ? "Copied!" : "Copy to Clipboard"}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-xs font-medium border border-base-300 bg-base-100 hover:bg-base-200 text-base-content transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
