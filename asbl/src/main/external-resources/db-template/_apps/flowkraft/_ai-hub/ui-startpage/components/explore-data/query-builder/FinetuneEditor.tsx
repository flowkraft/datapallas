"use client";

import { useState, useCallback, useEffect } from "react";
// lucide-react removed
import dynamic from "next/dynamic";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import type { DataSource } from "@/lib/stores/canvas-store";

// Dynamic import — CodeMirror is heavy and client-only
const CodeMirror = dynamic(() => import("@uiw/react-codemirror").then((m) => m.default), { ssr: false });

// Language extensions are heavy parsers — loaded lazily once per mode switch.
// SQL  → @codemirror/lang-sql  (official SQL grammar)
// Groovy → @codemirror/lang-java because Groovy is a JVM sibling of Java:
//   same keywords, block structure, string literals, and class syntax.
//   There is no @codemirror/lang-groovy in the CodeMirror 6 ecosystem.
const loadSqlExtension  = () => import("@codemirror/lang-sql").then((m)  => m.sql());
const loadJavaExtension = () => import("@codemirror/lang-java").then((m) => m.java());

// ─── Mode-specific constants ───────────────────────────────────────────────
// Everything that differs between SQL and Script lives here.
// The component body below is 100% shared — no mode forks inside it.
//
// Persistence contract (enforced by getValue / buildUpdate):
//   SQL    → reads ds.sql || ds.generatedSql   / writes { sql, generatedSql }
//   Script → reads ds.script                   / writes { script }
//   Each mode touches ONLY its own fields; the other mode's fields and
//   visualQuery survive every keystroke via the dataSource spread.
const MODE_CONFIG = {
  sql: {
    containerid:    "sqlEditorContainer",
    aiButtonId:     "btnAiHelpSql",
    runButtonId:    "btnRunSqlQuery",
    runLabel:       "Run Query",
    height:         "180px",
    autocompletion: true,
    subtitle:       null as string | null,
    loadExtension:  loadSqlExtension,
    getValue:       (ds: DataSource | null) => ds?.sql || ds?.generatedSql || "",
    buildUpdate:    (ds: DataSource | null, value: string): DataSource =>
      ({ ...ds, mode: "sql" as const, sql: value, generatedSql: value } as DataSource),
  },
  script: {
    containerid:    "scriptEditorContainer",
    aiButtonId:     "btnAiHelpScript",
    runButtonId:    "btnRunScript",
    runLabel:       "Run Script",
    height:         "220px",
    autocompletion: false,
    subtitle:       "Groovy script — full flexibility, multi-source data" as string | null,
    loadExtension:  loadJavaExtension,
    getValue:       (ds: DataSource | null) => ds?.script || "",
    buildUpdate:    (ds: DataSource | null, value: string): DataSource =>
      ({ ...ds, mode: "script" as const, script: value } as DataSource),
  },
} as const;

export type FinetuneMode = keyof typeof MODE_CONFIG;

export interface FinetuneEditorProps {
  mode: FinetuneMode;
  dataSource: DataSource | null;
  onChange: (ds: DataSource) => void;
  // Caller supplies the correct run handler per mode:
  //   sql    → QueryBuilder.handleRun       (increments executeVersion)
  //   script → QueryBuilder.handleRunScript (increments scriptExecuteVersion)
  onRun: (value: string) => void;
  executing: boolean;
  onAiHelp?: () => void;
}

export function FinetuneEditor({
  mode,
  dataSource,
  onChange,
  onRun,
  executing,
  onAiHelp,
}: FinetuneEditorProps) {
  const [extensions, setExtensions] = useState<Extension[]>([]);

  // Load the language extension for the active mode.
  // Clears the old extension first so the wrong grammar never lingers across
  // a mode switch.  Cancelled flag prevents stale setState on fast switches.
  useEffect(() => {
    setExtensions([]);
    let cancelled = false;
    MODE_CONFIG[mode].loadExtension().then((ext) => {
      if (!cancelled) {
        setExtensions([
          ext as Extension,
          EditorView.contentAttributes.of({ id: `${mode}EditorInput` }),
        ]);
      }
    });
    return () => { cancelled = true; };
  }, [mode]);

  const cfg   = MODE_CONFIG[mode];
  const value = cfg.getValue(dataSource);

  const handleChange = useCallback(
    (newValue: string) => {
      // buildUpdate spreads the full dataSource and updates ONLY the fields owned
      // by this mode — sql+generatedSql for SQL, script for Groovy.  The other
      // mode's fields and visualQuery are preserved untouched via the spread.
      onChange(MODE_CONFIG[mode].buildUpdate(dataSource, newValue));
    },
    [mode, dataSource, onChange],
  );

  return (
    <div className="space-y-2">
      {cfg.subtitle && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-base-content/60">{cfg.subtitle}</span>
        </div>
      )}

      <div id={cfg.containerid} className="border border-base-300 rounded-md overflow-hidden">
        {CodeMirror && (
          <CodeMirror
            value={value}
            onChange={handleChange}
            extensions={extensions}
            height={cfg.height}
            theme="dark"
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              highlightActiveLine: true,
              autocompletion: cfg.autocompletion,
            }}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          id={cfg.aiButtonId}
          onClick={onAiHelp}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-base-300 bg-base-100 hover:bg-base-200 text-base-content transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5 text-violet-500"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 1 2.455 2.456ZM16.5 20.25l-.259 1.035a3.375 3.375 0 0 1-2.455 2.456L12.75 24l1.036-.259a3.375 3.375 0 0 0 2.455-2.456l.259-1.035Z" /></svg>
          Hey AI, Help Me…
        </button>

        <button
          type="button"
          id={cfg.runButtonId}
          onClick={() => { if (value.trim()) onRun(value); }}
          disabled={!value.trim() || executing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {executing
            ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5 animate-spin"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
            : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" /></svg>
          }
          {executing ? "Running..." : cfg.runLabel}
        </button>
      </div>
    </div>
  );
}
