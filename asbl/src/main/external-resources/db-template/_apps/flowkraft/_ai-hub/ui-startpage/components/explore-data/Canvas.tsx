"use client";

import { useCallback, useRef, useEffect, useState, useMemo } from "react";
import { GridLayout, type Layout, verticalCompactor } from "react-grid-layout";
import { useCanvasStore } from "@/lib/stores/canvas-store";
import { WidgetShell } from "./widgets/WidgetShell";

import "react-grid-layout/css/styles.css";

const GRID_COLS = 12;
const ROW_HEIGHT = 80;
const GRID_MARGIN: readonly [number, number] = [12, 12];

export function Canvas() {
  const { widgets, editMode, selectWidget, updateLayout } = useCanvasStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const layout: Layout = useMemo(
    () =>
      widgets.map((w) => ({
        i: w.id,
        x: w.gridPosition.x,
        y: w.gridPosition.y,
        w: w.gridPosition.w,
        h: w.gridPosition.h,
        minW: 2,
        minH: 1,
        static: !editMode,
      })),
    [widgets, editMode]
  );

  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      if (!editMode) return;
      updateLayout(
        newLayout.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h }))
      );
    },
    [editMode, updateLayout]
  );

  return (
    <div
      id="canvasGridArea"
      ref={containerRef}
      className="flex-1 overflow-auto bg-base-100 p-4"
      onClick={() => selectWidget(null)}
    >
      {widgets.length === 0 ? (
        <div className="flex items-center justify-center h-full min-h-[400px]">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-base-200/50 flex items-center justify-center">
              <svg className="w-8 h-8 text-base-content/60/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-base-content mb-1">Empty canvas</h3>
            <p className="text-sm text-base-content/60 max-w-xs">
              Click a table from the left panel to add it to your dashboard
            </p>
          </div>
        </div>
      ) : (
        <GridLayout
          className="layout"
          layout={layout}
          width={containerWidth - 32}
          gridConfig={{
            cols: GRID_COLS,
            rowHeight: ROW_HEIGHT,
            margin: GRID_MARGIN,
            containerPadding: null,
            maxRows: Infinity,
          }}
          dragConfig={{
            enabled: editMode,
            handle: ".react-grid-drag-handle",
          }}
          resizeConfig={{
            enabled: editMode,
          }}
          compactor={verticalCompactor}
          onLayoutChange={handleLayoutChange}
        >
          {widgets.map((widget) => (
            <div key={widget.id} id={`widgetDragHandle-${widget.id}`}>
              <WidgetShell widgetId={widget.id} type={widget.type} />
              {editMode && (
                <>
                  {/* L-bracket resize hint: two short bars at the bottom-right corner,
                      rendered as siblings of WidgetShell so no widget content (tabulator,
                      chart, etc.) can cover them. */}
                  <div
                    id={`widgetResizeGrip-${widget.id}`}
                    aria-hidden="true"
                    style={{ position: "absolute", right: 0, bottom: 0, width: 15, height: 4, background: "var(--foreground)", zIndex: 30, pointerEvents: "none" }}
                  />
                  <div
                    aria-hidden="true"
                    style={{ position: "absolute", right: 0, bottom: 0, width: 4, height: 15, background: "var(--foreground)", zIndex: 30, pointerEvents: "none" }}
                  />
                </>
              )}
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  );
}
