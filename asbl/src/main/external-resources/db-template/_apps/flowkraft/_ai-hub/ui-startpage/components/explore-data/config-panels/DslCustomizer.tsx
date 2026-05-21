"use client";

import { useCallback, useState } from "react";
// lucide-react removed
import dynamic from "next/dynamic";
import type { ColumnSchema } from "@/lib/explore-data/types";
import { fetchDslExample } from "@/lib/explore-data/ai-prompt-builder";
import { DslHelpDialog } from "./DslHelpDialog";
import { DslExampleDialog } from "./DslExampleDialog";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror").then((m) => m.default), { ssr: false });

const DSL_TYPES_WITH_AI = ["tabulator", "chart", "pivot", "filter-pane", "filter-bar"];

const DSL_TYPE_LABELS: Record<string, string> = {
  tabulator:     "Table",
  chart:         "Chart",
  pivot:         "Pivot",
  "filter-pane": "Filter",
  "filter-bar":  "Parameters",
};

interface DslCustomizerProps {
  dsl: string;
  onChange: (dsl: string) => void;
  componentType: string;
  columns?: ColumnSchema[];
  sampleData?: Record<string, unknown>[];
  /** Optional bidirectional-sync status. When omitted, no dot is rendered. */
  syncStatus?: "synced" | "syncing" | "error";
  syncError?: string | null;
}

export function DslCustomizer({ dsl, onChange, componentType, columns = [], sampleData = [], syncStatus, syncError }: DslCustomizerProps) {
  const [expanded, setExpanded] = useState(false);
  const [dslHelpOpen, setDslHelpOpen] = useState(false);
  const [exampleOpen, setExampleOpen] = useState(false);
  const [example, setExample] = useState<string | null>(null);
  const [loadingExample, setLoadingExample] = useState(false);
  const hasExample = DSL_TYPES_WITH_AI.includes(componentType);

  const handleShowExample = useCallback(async () => {
    if (example !== null) {
      setExampleOpen(true);
      return;
    }
    setLoadingExample(true);
    try {
      const text = await fetchDslExample(componentType);
      setExample(text || "// No example available for this DSL type");
    } catch (err) {
      setExample(`// Failed to load example: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingExample(false);
      setExampleOpen(true);
    }
  }, [componentType, example]);

  // Only surface errors — synced/syncing is background plumbing the user doesn't need to see.
  const statusDot = syncStatus === "error" ? (
    <span
      className="flex items-center gap-1 text-[10px]"
      title={syncError ?? "DSL parse error"}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-error" />
      <span className="text-error">DSL error</span>
    </span>
  ) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          id="btnDslToggle"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-base-content/60 hover:text-base-content transition-colors"
        >
          {expanded
            ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
            : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>}
          Customize with DSL{DSL_TYPE_LABELS[componentType] ? ` (${DSL_TYPE_LABELS[componentType]})` : ""}
          {statusDot}
        </button>
        {expanded && hasExample && (
          <button
            id="btnShowDslExample"
            onClick={handleShowExample}
            disabled={loadingExample}
            className="text-[10px] text-primary hover:underline disabled:opacity-50"
          >
            {loadingExample ? "Loading…" : "Show Example"}
          </button>
        )}
      </div>

      {expanded && (
        <>
          <div id="dslEditorContainer" className="border border-base-300 rounded-md overflow-hidden">
            {CodeMirror && (
              <CodeMirror
                value={dsl}
                onChange={onChange}
                height="140px"
                theme="dark"
                basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
              />
            )}
          </div>

          {/* Hey AI, Help Me… button — only for DSL-supported component types */}
          {DSL_TYPES_WITH_AI.includes(componentType) && (
            <button
              id="btnAiHelpDsl"
              onClick={() => setDslHelpOpen(true)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium border border-base-300 bg-base-100 hover:bg-base-200 text-base-content transition-colors w-full justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5 text-violet-500"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 1 2.455 2.456ZM16.5 20.25l-.259 1.035a3.375 3.375 0 0 1-2.455 2.456L12.75 24l1.036-.259a3.375 3.375 0 0 0 2.455-2.456l.259-1.035Z" /></svg>
              Hey AI, Help Me…
            </button>
          )}
        </>
      )}

      <DslHelpDialog
        open={dslHelpOpen}
        onClose={() => setDslHelpOpen(false)}
        componentType={componentType}
        currentDsl={dsl}
        columns={columns}
        sampleData={sampleData}
      />

      {hasExample && (
        <DslExampleDialog
          open={exampleOpen}
          onClose={() => setExampleOpen(false)}
          componentType={componentType}
          example={example ?? ""}
        />
      )}
    </div>
  );
}
