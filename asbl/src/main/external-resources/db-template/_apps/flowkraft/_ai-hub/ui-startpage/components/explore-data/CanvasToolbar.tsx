"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCanvasStore } from "@/lib/stores/canvas-store";
import { useSaveStatusStore, type SaveStatus } from "@/lib/stores/save-status-store";
import { usePublishStatusStore } from "@/lib/stores/publish-status-store";
// lucide-react removed — icons replaced with inline heroicons below
import { ExportDialog } from "./export/ExportDialog";
import { ShareDialog } from "./export/ShareDialog";

interface CanvasToolbarProps {
  canvasId: string;
  onSave: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

function formatRelative(ms: number): string {
  if (ms < 5_000) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

function SaveStatusIndicator() {
  const status = useSaveStatusStore((s) => s.status);
  const lastSavedAt = useSaveStatusStore((s) => s.lastSavedAt);
  const lastError = useSaveStatusStore((s) => s.lastError);

  // Re-render every 15s so "Saved · 2s ago" updates its relative time.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status !== "saved") return;
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, [status]);

  const render = (icon: React.ReactNode, text: string, extraCls: string, title?: string) => (
    <div className={`flex items-center gap-1.5 text-[11px] ${extraCls}`} title={title}>
      {icon}
      <span>{text}</span>
    </div>
  );

  switch (status as SaveStatus) {
    case "saving":
      return render(<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3 animate-spin"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>, "Saving…", "text-base-content/60");
    case "dirty":
      return render(<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5"><circle cx="12" cy="12" r="5" /></svg>, "Unsaved changes", "text-warning");
    case "saved":
      return render(
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>,
        lastSavedAt ? `Saved · ${formatRelative(Date.now() - lastSavedAt)}` : "Saved",
        "text-success",
      );
    case "error":
      return render(
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>,
        "Save failed",
        "text-error",
        lastError ?? undefined,
      );
    case "idle":
    default:
      return null;
  }
}

export function CanvasToolbar({ canvasId, onSave, onUndo, onRedo, canUndo, canRedo }: CanvasToolbarProps) {
  const { name, setName, editMode, setEditMode } = useCanvasStore();
  const widgetCount = useCanvasStore((s) => s.widgets.length);
  const publishDirty = usePublishStatusStore((s) => s.dirty);
  const saveStatus = useSaveStatusStore((s) => s.status);
  // Set by Publish. Its presence is what makes sharing possible at all.
  const exportedReportCode = useCanvasStore((s) => s.exportedReportCode);
  const [editing, setEditing] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const router = useRouter();

  const saving = saveStatus === "saving";

  return (
    <div className="h-12 shrink-0 border-b border-base-300 bg-base-100/80 backdrop-blur-sm flex items-center justify-between px-4">
      {/* Left: canvas name */}
      <div className="flex items-center gap-2">
        {editing ? (
          <input
            id="txtDashboardName"
            autoFocus
            className="text-sm font-semibold bg-transparent border-b border-primary outline-none text-base-content px-1 py-0.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { setEditing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          />
        ) : (
          <button
            id="btnCanvasName"
            onClick={() => editMode && setEditing(true)}
            className="text-sm font-semibold text-base-content hover:text-primary transition-colors"
          >
            {name}
          </button>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        {/* Save-state indicator */}
        {editMode && (
          <>
            <SaveStatusIndicator />
            <div className="w-px h-5 bg-border mx-1" />
          </>
        )}

        {/* Undo/Redo (edit mode only) */}
        {editMode && onUndo && onRedo && (
          <>
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="p-1.5 rounded-md text-base-content/60 hover:bg-base-200 transition-colors disabled:opacity-30"
              title="Undo (Ctrl+Z)"
            >
              {/* Heroicon: arrow-uturn-left */}
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="p-1.5 rounded-md text-base-content/60 hover:bg-base-200 transition-colors disabled:opacity-30"
              title="Redo (Ctrl+Shift+Z)"
            >
              {/* Heroicon: arrow-uturn-right */}
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="m15 15 6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3" /></svg>
            </button>
            <div className="w-px h-5 bg-border mx-1" />
          </>
        )}

        {/* Edit/Preview toggle */}
        <button
          id="btnEditPreview"
          onClick={() => setEditMode(!editMode)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            editMode
              ? "text-base-content/60 hover:bg-base-200"
              : "text-primary bg-primary/10"
          }`}
        >
          {editMode ? (
            <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>Preview</>
          ) : (
            <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>Edit</>
          )}
        </button>

        {/* Full-screen preview */}
        <button
          onClick={() => router.push(`/explore-data/${canvasId}/preview`)}
          className="p-1.5 rounded-md text-base-content/60 hover:bg-base-200 transition-colors"
          title="Full-screen preview"
        >
          {/* Heroicon: arrows-pointing-out */}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
        </button>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Publish to DataPallas — enabled only when canvas has widgets
            AND there are unpublished changes since the last publish.
            Independent from autosave (see publish-status-store). */}
        <button
          id="btnPublishDashboard"
          onClick={() => setShowExport(true)}
          disabled={widgetCount === 0 || !publishDirty}
          title={
            widgetCount === 0
              ? "Add at least one widget before publishing"
              : !publishDirty
                ? "No changes to publish"
                : "Publish Dashboard"
          }
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
        >
          {/* Heroicon: arrow-up-tray */}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
          Publish Dashboard
        </button>

        {/* Share — only once the dashboard exists.
            A share link points at /dashboard/{reportId}, and that reportId is created by Publish,
            so sharing before publishing has nothing to point at. */}
        {exportedReportCode && (
          <button
            id="btnShareDashboard"
            onClick={() => setShowShare(true)}
            title="Let people without an account open this dashboard"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-base-300 hover:bg-base-200 transition-colors"
          >
            {/* Heroicon: share */}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" /></svg>
            Share
          </button>
        )}
      </div>

      <ExportDialog open={showExport} onClose={() => setShowExport(false)} />
      {exportedReportCode && (
        <ShareDialog
          open={showShare}
          onClose={() => setShowShare(false)}
          reportId={exportedReportCode}
        />
      )}
    </div>
  );
}
