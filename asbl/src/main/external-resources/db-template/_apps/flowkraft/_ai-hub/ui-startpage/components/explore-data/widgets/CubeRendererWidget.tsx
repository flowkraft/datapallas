"use client";

import { useEffect, useRef, useState } from "react";
import { useCanvasStore } from "@/lib/stores/canvas-store";
import { generateCubeSql } from "@/lib/explore-data/rb-api";
import { cubeDisplayOf, selectionOfEvent } from "@/lib/explore-data/cube-selection";
import { useRbElementReady } from "./useRbElementReady";
// lucide-react removed

interface CubeRendererWidgetProps {
  widgetId: string;
}

/**
 * The cube itself on the canvas: the widget of a data source whose `visualQuery.showInDashboard`
 * is set (W3). Inside it is `<rb-cube-renderer>` in author mode (W4.8) — the same field tree, the
 * same filters and the same result area a viewer will get in the published dashboard, asked with
 * the author's own credential and of the cube the widget names.
 *
 * Everything ticked here is written back to `visualQuery.cubeSelection` and regenerates
 * `generatedSql`, so unchecking Show In Dashboard later leaves current frozen SQL behind. The
 * result under the tree follows the widget type: number → value, chart → chart, else table.
 *
 * The bundle is loaded globally by RbWebComponentsLoader in app/layout.tsx.
 */
export function CubeRendererWidget({ widgetId }: CubeRendererWidgetProps) {
  const widget = useCanvasStore((s) => s.widgets.find((w) => w.id === widgetId));
  const connectionId = useCanvasStore((s) => s.connectionId);

  const query = widget?.dataSource?.visualQuery;
  const cubeId = query?.cubeId || "";
  /** Which cube of the file the widget was built on: the renderer starts on that one. */
  const savedCubeName = query?.cubeName || "";
  const display = cubeDisplayOf(widget?.type);

  const ref = useRef<HTMLElement>(null);
  /** The cube whose saved selection has already been put back into the tree: once per load. */
  const restoredFor = useRef("");
  const [sqlError, setSqlError] = useState<string | null>(null);
  const ready = useRbElementReady("rb-cube-renderer");

  // Author mode reads the cube by itself (`/api/cubes/{id}` and parse-dsl), so all this widget
  // hands over is which cube, which connection and what the answer should look like.
  useEffect(() => {
    if (!ready || !ref.current || !cubeId) return;
    const el = ref.current as HTMLElement & {
      cubeId?: string;
      cubeName?: string;
      connectionId?: string;
      apiBaseUrl?: string;
      apiKey?: string;
      display?: string;
    };
    const rbConfig = (typeof window !== "undefined"
      ? (window as unknown as { rbConfig?: { apiBaseUrl: string; apiKey: string } }).rbConfig
      : undefined);
    el.cubeName = savedCubeName;
    el.connectionId = connectionId || "";
    el.apiBaseUrl = rbConfig?.apiBaseUrl || "";
    el.apiKey = rbConfig?.apiKey || "";
    el.display = display;
    // Last: author mode starts as soon as it has a cube id, and it starts with the rest set.
    el.cubeId = cubeId;
  }, [ready, cubeId, savedCubeName, connectionId, display]);

  // The ticks, the grains and the filter chips the widget was saved with are what it reopens
  // with — `applySelection` is the tree's own one path, so it ends in `selectionChanged` exactly
  // as a click does.
  useEffect(() => {
    if (!ready || !ref.current || !cubeId) return;
    if (restoredFor.current === cubeId) return;
    restoredFor.current = cubeId;
    const selection = widget?.dataSource?.visualQuery?.cubeSelection;
    if (!selection) return;
    const el = ref.current as HTMLElement & {
      initialFilters?: unknown[];
      applySelection?: (selection: unknown) => boolean;
    };
    el.initialFilters = selection.filters || [];
    el.applySelection?.(selection);
    // The saved selection is this widget's, and it is applied to the tree it was taken from — so
    // this effect watches the cube, not the selection, and a tick does not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cubeId]);

  // Every change on the canvas is the widget's new selection, and its new frozen SQL.
  useEffect(() => {
    const el = ref.current;
    if (!ready || !el || !cubeId) return;

    const handler = async (event: Event) => {
      const asked = selectionOfEvent(event);
      if (!asked) return;
      const store = useCanvasStore.getState();
      const current = store.widgets.find((w) => w.id === widgetId);
      const currentQuery = current?.dataSource?.visualQuery;
      if (!currentQuery) return;
      // The cube the renderer is showing travels with the selection, so a file of several cubes
      // generates SQL for the one on screen — and a saved canvas keeps it.
      const cubeName = asked.cubeName || currentQuery.cubeName || "";
      let generatedSql = current?.dataSource?.generatedSql ?? "";
      try {
        generatedSql = await generateCubeSql(cubeId, connectionId || "", asked.selection, cubeName);
        setSqlError(null);
      } catch (err) {
        // The frozen SQL is what unchecking the box falls back to, so a refusal is said rather
        // than swallowed — and the last SQL that did generate is kept.
        setSqlError(err instanceof Error ? err.message : "Failed to generate SQL");
      }
      store.updateWidgetDataSource(widgetId, {
        ...current!.dataSource!,
        mode: "visual",
        visualQuery: { ...currentQuery, cubeName: cubeName || undefined, cubeSelection: asked.selection },
        generatedSql,
      });
    };

    el.addEventListener("selectionChanged", handler);
    return () => el.removeEventListener("selectionChanged", handler);
  }, [ready, cubeId, connectionId, widgetId]);

  if (!cubeId) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-base-content/60">
        Pick a cube in the Data tab
      </div>
    );
  }
  if (!ready) return <div className="flex items-center justify-center h-full text-xs text-base-content/60">Loading components...</div>;

  return (
    <div className="h-full flex flex-col">
      {/* @ts-expect-error - Web component custom element */}
      <rb-cube-renderer
        ref={ref}
        id={`widgetViz-${widgetId}`}
        style={{ display: "block", width: "100%", flex: 1, overflow: "auto" }}
      />
      {sqlError && (
        <div id={`widgetSqlError-${widgetId}`} className="shrink-0 text-[10px] text-error px-2 py-0.5 overflow-hidden">
          {sqlError.split("\n")[0].slice(0, 200)}
        </div>
      )}
    </div>
  );
}
