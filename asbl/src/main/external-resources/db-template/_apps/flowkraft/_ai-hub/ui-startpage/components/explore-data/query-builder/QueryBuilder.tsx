"use client";

import { useState, useEffect, useCallback } from "react";
// lucide-react removed
import { useCanvasStore } from "@/lib/stores/canvas-store";
import type { VisualQuery, DataSource, DataSourceMode } from "@/lib/stores/canvas-store";
import type { SchemaInfo, ConnectionInfo } from "@/lib/explore-data/types";
import type { AiKind, AiMode } from "@/lib/explore-data/ai-prompt-builder";
import { fetchConnections, fetchSchema } from "@/lib/explore-data/rb-api";
import { VisualQueryBuilder } from "./VisualQueryBuilder";
import { FinetuneEditor } from "./FinetuneEditor";
import { AiHelpDialog } from "../AiHelpDialog";

// Top-level tabs. "Finetune" groups SQL and Script under one roof and
// replaces the old AI / SQL / Script trio (AI is no longer a separate tab).
type TopTab = "visual" | "finetune";
type FtTab = "sql" | "script";

function topTabFrom(mode: DataSourceMode): TopTab {
  return mode === "visual" ? "visual" : "finetune";
}
function ftTabFrom(mode: DataSourceMode): FtTab {
  return mode === "script" ? "script" : "sql";
}

interface QueryBuilderProps {
  widgetId: string;
  dataSource: DataSource | null;
  onChange: (ds: DataSource) => void;
  connectionId: string | null;
}

export function QueryBuilder({ widgetId, dataSource, onChange, connectionId }: QueryBuilderProps) {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [justRan, setJustRan] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);
  // Lock the AI prompt mode at click-time — don't derive from dataSource.mode,
  // which can flip back to "sql" if SqlEditor's onChange fires during unmount.
  const [aiMode, setAiMode] = useState<AiMode>("sql");

  // Read the shared query-result cache from canvas-store. useWidgetData writes
  // to this entry after the single execution per Run — here we just subscribe.
  const widgetQR = useCanvasStore((s) => s.queryResults[widgetId]);
  const queryResult = widgetQR?.result ?? null;
  const executing = widgetQR?.loading ?? false;
  const error = widgetQR?.error ?? null;

  const mode: DataSourceMode = dataSource?.mode || "visual";
  const topTab = topTabFrom(mode);
  const ftTab = ftTabFrom(mode);

  // Derived context for AI dialog
  const visualQuery = dataSource?.visualQuery;
  const aiKind: AiKind = visualQuery?.kind === "cube" ? "cube" : "table";
  const aiTableName = visualQuery?.table || undefined;
  const aiCubeId = visualQuery?.cubeId || undefined;
  const connectionType = connections.find((c) => c.connectionCode === connectionId)?.dbserver?.type || "";

  // Load connections on mount
  useEffect(() => {
    fetchConnections().then(setConnections).catch(() => {});
  }, []);

  // Load schema when connection changes
  useEffect(() => {
    if (!connectionId) { setSchema(null); return; }
    setLoading(true);
    fetchSchema(connectionId)
      .then(setSchema)
      .catch(() => setSchema(null))
      .finally(() => setLoading(false));
  }, [connectionId]);

  // Brief green flash when a fresh result lands — the backend call itself is
  // fired by useWidgetData, so we trigger the flash on result transitions.
  useEffect(() => {
    if (queryResult && !executing) {
      setJustRan(true);
      const t = setTimeout(() => setJustRan(false), 2000);
      return () => clearTimeout(t);
    }
  }, [queryResult, executing]);

  // Switch mode — carry SQL over between modes
  const switchMode = useCallback(
    (newMode: DataSourceMode) => {
      if (newMode === mode) return;
      const currentSql = dataSource?.sql || dataSource?.generatedSql || "";
      onChange({ ...dataSource, mode: newMode, sql: currentSql, generatedSql: currentSql } as DataSource);
    },
    [mode, dataSource, onChange]
  );

  // Force-commit mode to "visual" unconditionally, even when a stale mode
  // string says we're already there. Used by the Visual tab click as a safety
  // reset — if anything silently set mode to sql/ai-sql/script (e.g. the SQL
  // editor's onChange firing during mount/unmount), clicking Visual makes the
  // dataSource consistent with what the user is actually looking at.
  const forceVisualMode = useCallback(() => {
    if (!dataSource) return;
    const currentSql = dataSource.sql || dataSource.generatedSql || "";
    onChange({ ...dataSource, mode: "visual", sql: currentSql, generatedSql: currentSql } as DataSource);
  }, [dataSource, onChange]);

  const switchTopTab = (tab: TopTab) => {
    if (tab === "visual") {
      // Force, don't rely on switchMode's early-return optimization — we want
      // clicking Visual to be a guaranteed reset point even if mode already
      // reads "visual" (which happens when something flipped mode and back
      // within one render).
      forceVisualMode();
    } else {
      // Enter Finetune — keep current sub-tab if already in sql/script,
      // otherwise default to sql. Note "ai-sql" lands on "sql" too since
      // both produce the same SQL string in `ds.sql`.
      switchMode(mode === "script" ? "script" : "sql");
    }
  };

  const switchFtTab = (tab: FtTab) => switchMode(tab);

  // Run a SQL query — just bump executeVersion. useWidgetData sees the version
  // change, executes the query once, and populates canvas-store.queryResults.
  // We read back from the store for our own "X rows" status display, so the
  // backend is hit exactly once per Run instead of once per consumer.
  const handleRun = useCallback(
    (sql: string) => {
      if (!connectionId || !sql) return;
      onChange({ ...dataSource, sql, generatedSql: sql,
                 executeVersion: (dataSource?.executeVersion ?? 0) + 1 } as DataSource);
    },
    [connectionId, dataSource, onChange]
  );

  // Run a Groovy script — same pattern as handleRun, bumps scriptExecuteVersion
  // which useWidgetData watches for script-mode re-execution.
  const handleRunScript = useCallback(
    (script: string) => {
      if (!connectionId || !script) return;
      onChange({ ...dataSource, mode: "script", script,
                 scriptExecuteVersion: (dataSource?.scriptExecuteVersion ?? 0) + 1 } as DataSource);
    },
    [connectionId, dataSource, onChange]
  );

  return (
    <div className="space-y-3">
      {!connectionId && (
        <div className="text-[11px] text-base-content/60 p-2 rounded-md border border-dashed border-base-300">
          Pick a connection in the left panel to continue.
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-base-content/60 py-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3 animate-spin"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg> Loading schema...
        </div>
      )}

      {/* Mode switcher — always visible once connection is selected */}
      {connectionId && !loading && (
        <>
          {/* Top tabs: Visual | Finetune */}
          <div className="flex gap-0.5 p-0.5 bg-base-200/50 rounded-lg">
            {(["visual", "finetune"] as TopTab[]).map((tab) => (
              <button
                key={tab}
                id={`btnQueryTab-${tab}`}
                onClick={() => switchTopTab(tab)}
                className={`flex-1 px-2 py-1 text-[11px] font-medium rounded-md capitalize transition-colors ${
                  topTab === tab
                    ? "bg-base-100 text-base-content shadow-sm"
                    : "text-base-content/60 hover:text-base-content"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Visual tab */}
          {topTab === "visual" && schema && (
            <VisualQueryBuilder
              schema={schema}
              dataSource={dataSource}
              onChange={onChange}
              onRun={handleRun}
              executing={executing}
              connectionId={connectionId}
            />
          )}

          {/* Finetune tab — SQL / Script dropdown */}
          {topTab === "finetune" && (
            <div className="space-y-3">
              {/* Dropdown */}
              <select
                id="selectQueryMode"
                value={ftTab}
                onChange={(e) => switchFtTab(e.target.value as FtTab)}
                className="w-full text-sm bg-base-100 border border-base-300 rounded-md px-2 py-1.5 text-base-content"
              >
                <option value="sql">SQL</option>
                <option value="script">Script (get more power, IF needed)</option>
              </select>

              <FinetuneEditor
                mode={ftTab}
                dataSource={dataSource}
                onChange={onChange}
                onRun={ftTab === "sql" ? handleRun : handleRunScript}
                executing={executing}
                onAiHelp={() => { setAiMode(ftTab); setShowAiDialog(true); }}
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-xs text-error bg-error/10 border border-error/20 rounded-md p-2 overflow-hidden">
              Query error: {error.split('\n')[0].slice(0, 200)}
            </div>
          )}

          {/* Result count */}
          {queryResult && (
            <div className={`text-xs font-medium transition-colors duration-300 ${justRan ? "text-green-600" : "text-base-content/60"}`}>
              ✓ {queryResult.rowCount} row{queryResult.rowCount !== 1 ? "s" : ""} returned
            </div>
          )}
        </>
      )}

      {/* AI Prompt Builder dialog */}
      <AiHelpDialog
        open={showAiDialog}
        onClose={() => setShowAiDialog(false)}
        mode={aiMode}
        kind={aiKind}
        connectionType={connectionType}
        tableName={aiTableName}
        cubeId={aiCubeId}
        schema={schema || undefined}
      />
    </div>
  );
}

