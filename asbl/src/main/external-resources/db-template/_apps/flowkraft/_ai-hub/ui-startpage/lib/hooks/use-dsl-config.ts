"use client";

import { useCallback, useState } from "react";
import { useCanvasStore } from "@/lib/stores/canvas-store";
import {
  type DslWidgetType,
  type DslMapByWidgetType,
  DSL_CONFIG_KEY,
} from "@/lib/explore-data/dsl-config/types";

/**
 * ============================================================================
 * 📖 LLM / AI ASSISTANTS — READ FIRST
 *
 *   bkend/server/src/main/java/com/flowkraft/reporting/dsl/common/
 *     DSLPrinciplesReadme.java
 *
 * Especially Principle 4: the DSL Map IS the canvas's render input.
 * ============================================================================
 *
 * Single source of truth for a widget's DSL configuration. Replaces the
 * earlier dual-storage pattern (`customDsl` text + parallel structured fields
 * like `hiddenColumns`, `columnSettings`, `tabulatorLayout`, …).
 *
 * The Map stored at `displayConfig.dslConfig` is the canonical configuration:
 *
 *   ┌── Display tab UI panel — reads `config`, writes via `setPath`
 *   │
 *   ├── DSL editor pane — `getDslText()` for view, `saveDslText(text)` for save
 *   │
 *   └── Canvas widget render — `mapToXxxRenderConfig(config, data)` → <rb-XXX>
 *
 * All three views read/write the same Map. Drift between them is structurally
 * impossible (no parallel state to keep in sync).
 *
 * `getDslText()` and `saveDslText()` call the existing Java DSL serialize/parse
 * endpoints. The DSL text is a derived view — never stored, always re-derived
 * when the editor opens (or on toggle between Visual/Code panes).
 */

// Same-origin proxy — see app/api/dp/[...path]/route.ts.
const RB_BASE = "/api/dp";

export interface UseDslConfigResult<T> {
  /** Current canonical DSL Map for this widget. */
  config: T;
  /** Replace the entire Map (used by editor save / migrations). */
  updateConfig: (next: T) => void;
  /** Immutable update at a Map path. UI controls call this on user gesture. */
  setPath: (path: ReadonlyArray<string | number>, value: unknown) => void;
  /** Async DSL text serialization (calls Java BlockFormEmitter via /serialize). */
  getDslText: () => Promise<string>;
  /** Async DSL text parse + replace Map (calls Java parser via /parse). */
  saveDslText: (text: string) => Promise<void>;
  /** Last error from a serialize/parse round-trip, if any. */
  error: string | null;
}

export function useDslConfig<W extends DslWidgetType>(
  widgetId: string,
  widgetType: W,
): UseDslConfigResult<DslMapByWidgetType[W]> {
  type T = DslMapByWidgetType[W];
  const widget = useCanvasStore((s) => s.widgets.find((w) => w.id === widgetId));
  const updateWidgetDisplayConfig = useCanvasStore((s) => s.updateWidgetDisplayConfig);
  const [error, setError] = useState<string | null>(null);

  const config = ((widget?.displayConfig?.[DSL_CONFIG_KEY] as T | undefined) ?? ({} as T));

  const updateConfig = useCallback(
    (next: T) => {
      if (!widget) return;
      updateWidgetDisplayConfig(widget.id, { ...widget.displayConfig, [DSL_CONFIG_KEY]: next });
    },
    [widget, updateWidgetDisplayConfig],
  );

  const setPath = useCallback(
    (path: ReadonlyArray<string | number>, value: unknown) => {
      if (!widget) return;
      const current = (widget.displayConfig?.[DSL_CONFIG_KEY] as T | undefined) ?? ({} as T);
      const next = setIn(current, path, value);
      updateWidgetDisplayConfig(widget.id, { ...widget.displayConfig, [DSL_CONFIG_KEY]: next });
    },
    [widget, updateWidgetDisplayConfig],
  );

  const getDslText = useCallback(async (): Promise<string> => {
    try {
      const res = await fetch(`${RB_BASE}/dsl/${widgetType}/serialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ options: config, priorDslCode: "" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { dslCode } = (await res.json()) as { dslCode: string };
      setError(null);
      return dslCode;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    }
  }, [config, widgetType]);

  const saveDslText = useCallback(
    async (text: string): Promise<void> => {
      try {
        const res = await fetch(`${RB_BASE}/dsl/${widgetType}/parse`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dslCode: text }),
        });
        const data = (await res.json()) as { options?: T; error?: string };
        if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
        if (data.options) updateConfig(data.options);
        setError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      }
    },
    [widgetType, updateConfig],
  );

  return { config, updateConfig, setPath, getDslText, saveDslText, error };
}

/** Immutable deep-set at a path. Creates intermediate objects/arrays as needed. */
function setIn<T>(obj: T, path: ReadonlyArray<string | number>, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  if (typeof head === "number") {
    const arr = Array.isArray(obj) ? (obj as unknown[]) : [];
    const next = [...arr];
    next[head] = setIn(arr[head], rest, value);
    return next as unknown as T;
  }
  const o = (obj && typeof obj === "object" ? obj : {}) as Record<string, unknown>;
  return { ...o, [head]: setIn(o[head], rest, value) } as unknown as T;
}
