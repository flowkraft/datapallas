"use client";

import { useEffect, useRef, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
// heroicons replace lucide ChevronRight / ChevronLeft
import { useCanvasStore, type ParametersConfig } from "@/lib/stores/canvas-store";
import { useSaveStatusStore } from "@/lib/stores/save-status-store";
import { usePublishStatusStore } from "@/lib/stores/publish-status-store";
import { usePublishDirty } from "@/lib/stores/use-publish-dirty";
import { fetchCanvas } from "@/lib/explore-data/rb-api";
import { useCanvasAutosave } from "@/lib/stores/use-canvas-autosave";
import { useCanvasHistory } from "@/lib/stores/use-canvas-history";
import { useCanvasShortcuts } from "@/lib/stores/use-canvas-shortcuts";
import { Canvas } from "@/components/explore-data/Canvas";
import { SchemaBrowser } from "@/components/explore-data/SchemaBrowser";
import { ConfigPanel } from "@/components/explore-data/ConfigPanel";
import { CanvasToolbar } from "@/components/explore-data/CanvasToolbar";
import { FilterBar } from "@/components/explore-data/FilterBar";
import { SelectionBar } from "@/components/explore-data/SelectionBar";
import { toast } from "sonner";

/**
 * Read defaults straight from the canonical parametersConfig Map. Used to
 * pre-seed the canvas store's filterValues BEFORE any widget mounts — prevents
 * Visual-mode preview queries from firing with empty params against SQL
 * containing ${param}. No DSL parse round-trip needed.
 */
function seedFilterValuesFromParameters(parameters: Array<{ id: string; defaultValue?: unknown }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of parameters ?? []) {
    if (p.defaultValue != null && String(p.defaultValue) !== "") out[p.id] = String(p.defaultValue);
  }
  return out;
}

interface PageProps {
  params: Promise<{ canvasId: string }>;
}

export default function CanvasEditorPage({ params }: PageProps) {
  const { canvasId } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const store = useCanvasStore();
  const history = useCanvasHistory();

  // Sidebar collapse state
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false);
  // Track if the user manually closed the right panel — if so, don't auto-reopen.
  const rightManualClose = useRef(false);

  // Auto-show right panel when a widget is selected; auto-hide when deselected.
  const selectedWidgetId = store.selectedWidgetId;
  useEffect(() => {
    if (selectedWidgetId) {
      rightManualClose.current = false;
      setRightOpen(true);
    } else {
      setRightOpen(false);
    }
  }, [selectedWidgetId]);

  useCanvasShortcuts({ onUndo: history.undo, onRedo: history.redo });

  const { flushSave } = useCanvasAutosave(canvasId, !loading);
  usePublishDirty(!loading);

  useEffect(() => {
    const load = async () => {
      useSaveStatusStore.getState().reset();
      usePublishStatusStore.getState().reset(false);
      let canvas: Record<string, unknown>;
      try {
        canvas = await fetchCanvas(canvasId) as Record<string, unknown>;
      } catch {
        toast.error("Canvas not found");
        router.push("/explore-data");
        return;
      }
      const state = JSON.parse((canvas.state as string) || "{}");
      const parametersConfig = (state.parametersConfig as ParametersConfig | undefined) ?? { parameters: [] };
      // Pre-seed filterValues from param defaults so Visual-mode widgets bound
      // to ${param} fire their preview query with the right defaults from the start.
      const seededFilterValues = seedFilterValuesFromParameters(parametersConfig.parameters ?? []);
      store.loadCanvas({
        id: canvas.id as string,
        name: canvas.name as string,
        description: (canvas.description as string) || "",
        connectionId: (canvas.connectionId as string) || null,
        widgets: state.widgets || [],
        parametersConfig,
        filterValues: seededFilterValues,
        filterVersion: 0,
        selectedWidgetId: null,
        editMode: true,
        exportedReportCode: (canvas.exportedReportCode as string) || null,
        exploreSelections: [],
        exploreFieldStates: {},
        exploreVersion: 0,
      });
      usePublishStatusStore.getState().reset(!!canvas.exportedReportCode);
      setLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId]);

  const handleSave = useCallback(() => { void flushSave(); }, [flushSave]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flushSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flushSave]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = useSaveStatusStore.getState().status;
      if (s === "dirty" || s === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-base-content/60 text-sm">Loading canvas...</div>
      </div>
    );
  }

  return (
    <div id="canvasBuilderRoot" className="flex flex-col h-[calc(100vh-4rem)]">
      <CanvasToolbar
        canvasId={canvasId}
        onSave={handleSave}
        onUndo={history.undo}
        onRedo={history.redo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
      />
      <FilterBar />
      <SelectionBar />
      <div className="flex flex-1 overflow-hidden">
        {store.editMode && (
          leftOpen ? (
            <SchemaBrowser onCollapse={() => setLeftOpen(false)} />
          ) : (
            <button
              id="btnExpandLeftPanel"
              onClick={() => setLeftOpen(true)}
              className="w-6 shrink-0 border-r border-base-300 bg-base-200/30 flex items-center justify-center hover:bg-base-200 transition-colors"
              title="Show sidebar"
            >
              {/* Heroicon: chevron-right */}
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5 text-base-content font-bold"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            </button>
          )
        )}
        {/* canvasWorkArea wraps the canvas grid + right config panel so a single
            screenshot can capture them together without the left tables panel
            or its expand chevron leaking in — see captureWidgetZoom. */}
        <div id="canvasWorkArea" className="flex flex-1 overflow-hidden">
          <Canvas />
          {store.editMode && (
            rightOpen ? (
              <ConfigPanel
                onCollapse={() => { rightManualClose.current = true; setRightOpen(false); }}
              />
            ) : (
              <button
                id="btnExpandRightPanel"
                onClick={() => { rightManualClose.current = false; setRightOpen(true); }}
                className="w-6 shrink-0 border-l border-base-300 bg-base-200/30 flex items-center justify-center hover:bg-base-200 transition-colors"
                title="Show config panel"
              >
                {/* Heroicon: chevron-left */}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5 text-base-content font-bold"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
