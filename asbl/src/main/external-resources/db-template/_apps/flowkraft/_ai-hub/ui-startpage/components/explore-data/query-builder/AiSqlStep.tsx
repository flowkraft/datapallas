"use client";

import { useState } from "react";
// lucide-react removed
import type { DataSource } from "@/lib/stores/canvas-store";

interface AiSqlStepProps {
  canvasId: string;
  schemaContext: string;
  connectionType: string;
  dataSource: DataSource | null;
  onChange: (ds: DataSource) => void;
  onRun: (sql: string) => void;
}

export function AiSqlStep({ canvasId, schemaContext, connectionType, dataSource, onChange, onRun }: AiSqlStepProps) {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatedSql = dataSource?.sql || dataSource?.generatedSql || "";

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch(`/api/explorations/${canvasId}/ai-sql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), schemaContext, connectionType }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Generation failed");
        return;
      }

      onChange({ mode: "ai-sql", sql: data.sql, generatedSql: data.sql });
    } catch {
      setError("Failed to reach AI service");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Natural language input */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-amber-500 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 1 2.455 2.456ZM16.5 20.25l-.259 1.035a3.375 3.375 0 0 1-2.455 2.456L12.75 24l1.036-.259a3.375 3.375 0 0 0 2.455-2.456l.259-1.035Z" /></svg>
          <span className="text-xs text-base-content/60">Describe what you want</span>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Show me monthly revenue by region for the last 2 years..."
          rows={3}
          className="w-full text-sm bg-base-100 border border-base-300 rounded-md px-3 py-2 text-base-content placeholder:text-base-content/30 resize-none"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
        />
        <button
          onClick={handleGenerate}
          disabled={generating || !prompt.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-warning text-warning-content hover:bg-warning/90 transition-colors disabled:opacity-50"
        >
          {generating
            ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5 animate-spin"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
            : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 1 2.455 2.456ZM16.5 20.25l-.259 1.035a3.375 3.375 0 0 1-2.455 2.456L12.75 24l1.036-.259a3.375 3.375 0 0 0 2.455-2.456l.259-1.035Z" /></svg>
          }
          {generating ? "Generating..." : "Generate SQL"}
        </button>
      </div>

      {error && (
        <div className="text-xs text-error bg-error/10 border border-error/20 rounded-md p-2">
          {error}
        </div>
      )}

      {/* Generated SQL preview */}
      {generatedSql && (
        <div className="space-y-1.5">
          <span className="text-xs text-base-content/60">Generated SQL (editable — switch to SQL mode for full editor)</span>
          <pre className="text-[11px] bg-base-200/50 border border-base-300 rounded-md p-3 overflow-x-auto text-base-content font-mono whitespace-pre-wrap">
            {generatedSql}
          </pre>
          <button
            onClick={() => onRun(generatedSql)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" /></svg>
            Run Query
          </button>
        </div>
      )}
    </div>
  );
}
