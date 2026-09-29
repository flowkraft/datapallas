import { useEffect } from "react";
import { useCanvasStore } from "./canvas-store";

interface ShortcutHandlers {
  onUndo: () => void;
  onRedo: () => void;
}

export function useCanvasShortcuts({ onUndo, onRedo }: ShortcutHandlers) {
  const { editMode, selectedWidgetId, removeWidget, selectWidget } = useCanvasStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs or rich-text editors (CodeMirror, etc.)
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      // CodeMirror renders as <div> elements — detect via .cm-editor wrapper
      // or contenteditable on the inner content area.
      if (el?.closest?.(".cm-editor")) return;
      if (el?.isContentEditable) return;

      // Delete — remove selected widget
      if ((e.key === "Delete" || e.key === "Backspace") && editMode && selectedWidgetId) {
        e.preventDefault();
        removeWidget(selectedWidgetId);
      }

      // Escape — deselect widget
      if (e.key === "Escape" && selectedWidgetId) {
        e.preventDefault();
        selectWidget(null);
      }

      // Ctrl+Z — undo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      }

      // Ctrl+Shift+Z — redo. With Shift held the browser reports the key as "Z",
      // so this branch has to compare without case; the undo branch above never
      // sees Shift and is left exactly as it is.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && e.shiftKey) {
        e.preventDefault();
        onRedo();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editMode, selectedWidgetId, removeWidget, selectWidget, onUndo, onRedo]);
}
