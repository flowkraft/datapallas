"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
// lucide-react removed
import { useCanvasStore } from "@/lib/stores/canvas-store";
import { usePublishStatusStore } from "@/lib/stores/publish-status-store";
import { sqlForDataSource } from "@/lib/explore-data/sql-builder";
import { temporalColumnNamesOf } from "@/lib/explore-data/widget-defaults";
import { getConnectionType, updateCanvas } from "@/lib/explore-data/rb-api";
import { saveDashboardToDataPallas } from "./rbApiClient";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const state = useCanvasStore();

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ success: boolean; dashboardUrl?: string; error?: string } | null>(null);

  useEffect(() => {
    if (open) { setResult(null); setSaving(false); }
  }, [open]);

  const isOverride = !!state.exportedReportCode;

  const hasWidgets = state.widgets.some((w) =>
    ["chart", "tabulator", "pivot", "number", "map", "sankey", "gauge", "trend", "progress", "detail"].includes(w.type),
  );

  const handleSave = async () => {
    if (!state.connectionId || !hasWidgets) return;
    setSaving(true);
    setResult(null);

    // Populate generatedSql for visual-mode widgets that have no explicit
    // Finetune SQL — "as if" the user had pasted it into the SQL editor.
    // Backend ScriptAssembler reads dataSource.generatedSql to emit the
    // dispatcher groovy; without this, raw-table-drop widgets publish as
    // "no data source configured" and their /dashboard shows 0 rows.
    //
    // We PATCH the canvas state directly rather than updating the store +
    // waiting for autosave (1200 ms debounce) — avoids a race where /export
    // reads stale state from SQLite.
    const connectionType = getConnectionType(state.connectionId);
    const patchedWidgets = state.widgets.map((w) => {
      const ds = w.dataSource;
      if (!ds) return w;
      const hasExplicitSql = (ds.mode === "sql" || ds.mode === "ai-sql") && !!ds.sql?.trim();
      const alreadyPersisted = !!ds.generatedSql?.trim();
      if (hasExplicitSql || alreadyPersisted) return w;
      const built = sqlForDataSource(ds, connectionType, temporalColumnNamesOf(w.shape));
      return built ? { ...w, dataSource: { ...ds, generatedSql: built } } : w;
    });
    try {
      await updateCanvas(state.id, {
        state: JSON.stringify({ widgets: patchedWidgets, parametersConfig: state.parametersConfig }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ success: false, error: `Failed to persist canvas before publish: ${msg}` });
      setSaving(false);
      return;
    }

    const res = await saveDashboardToDataPallas(state.id);
    setResult(res);
    setSaving(false);
    if (res.success) {
      state.setExportedReportCode(res.reportId);
      // Mark the canvas clean wrt publishing — subsequent edits will flip it
      // back to dirty via usePublishDirty. Autosave is unaffected.
      usePublishStatusStore.getState().markClean();
    }
  };

  if (!open) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-base-100 border border-base-300 rounded-xl shadow-xl w-full max-w-sm flex flex-col" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-base-300">
            <h2 className="text-base font-semibold text-base-content">
              {isOverride ? "Update Dashboard" : "Save to DataPallas"}
            </h2>
            <button id="btnCloseExportDialog" onClick={onClose} className="p-1 rounded-md text-base-content/60 hover:bg-base-200">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-3">

            {!result?.success && (
              <p className="text-sm text-base-content">
                {isOverride
                  ? <>This will <span className="font-semibold text-warning">override the existing &ldquo;{state.name}&rdquo; dashboard</span> and all existing configurations will be lost. Are you sure you want to continue?</>
                  : <>This will publish <span className="font-semibold">&ldquo;{state.name}&rdquo;</span> as a new dashboard in DataPallas.</>
                }
              </p>
            )}

            {!state.connectionId && (
              <p className="text-xs text-warning bg-warning/10 border border-warning/20 rounded-md px-3 py-2">
                Select a database connection first (in any widget&apos;s Data tab)
              </p>
            )}
            {!hasWidgets && (
              <p className="text-xs text-warning bg-warning/10 border border-warning/20 rounded-md px-3 py-2">
                Add at least one data widget before saving
              </p>
            )}

            {result?.success && (
              <div id="publishSuccess" className="flex items-center gap-2 text-xs text-success bg-success/10 border border-success/20 rounded-md px-3 py-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                <div>
                  Dashboard published!{" "}
                  <a href={result.dashboardUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-success underline">
                    View dashboard <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                  </a>
                </div>
              </div>
            )}
            {result && !result.success && (
              <p className="text-xs text-error bg-error/10 border border-error/20 rounded-md px-3 py-2">
                {result.error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-base-300">
            {result?.success ? (
              <button
                id="btnPublishClose"
                onClick={onClose}
                className="px-4 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors"
              >
                Close
              </button>
            ) : (
              <>
                <button
                  id="btnPublishCancel"
                  onClick={onClose}
                  className="px-4 py-1.5 rounded-md text-xs font-medium border border-base-300 text-base-content hover:bg-base-200 transition-colors"
                >
                  No
                </button>
                <button
                  id="btnPublishConfirm"
                  onClick={handleSave}
                  disabled={saving || !state.connectionId || !hasWidgets}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5 animate-spin"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>Saving…</>
                  ) : (
                    "Yes, save"
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
