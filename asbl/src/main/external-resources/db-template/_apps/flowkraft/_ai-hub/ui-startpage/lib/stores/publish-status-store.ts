/**
 * Tracks whether the canvas has unpublished changes — independent from
 * autosave. Autosave persists to SQLite on every keystroke; publishing to
 * DataPallas is a separate, explicit user action that writes the dashboard
 * files (config + template). The two concerns must not interfere.
 *
 * Flow:
 *   - Canvas loads: dirty = true  if no exportedReportCode (never published)
 *                   dirty = false if exportedReportCode is set (assume the
 *                   currently-persisted state matches the last publish —
 *                   true in practice because autosave is always in sync).
 *   - Any persisted-slice change (widgets / name / parametersConfig / connectionId)
 *     → markDirty().
 *   - Publish dialog reports success → markClean().
 */
import { create } from "zustand";

interface PublishStatusState {
  dirty: boolean;
  markDirty: () => void;
  markClean: () => void;
  /** Called by the canvas-load effect with whether the canvas has ever been
   *  published. Resets internal state at load time. */
  reset: (hasBeenPublished: boolean) => void;
}

/**
 * What a canvas was when it was last published, kept by this browser. The saved state cannot say
 * it: autosave keeps writing edits made after the publish, so on a later load "published once"
 * does not mean "nothing to publish". With no signature kept (another browser, cleared storage)
 * a published canvas is taken as unchanged, as before.
 */
export function publishSignature(name: string, connectionId: string | null, state: string): string {
  const text = JSON.stringify([name, connectionId, state]);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return String(hash);
}

const publishedKey = (canvasId: string) => `explore-data:published:${canvasId}`;

export function rememberPublished(canvasId: string, signature: string): void {
  try { localStorage.setItem(publishedKey(canvasId), signature); } catch { /* storage not available */ }
}

export function editedSincePublish(canvasId: string, signature: string): boolean {
  try {
    const kept = localStorage.getItem(publishedKey(canvasId));
    return kept !== null && kept !== signature;
  } catch {
    return false;
  }
}

export const usePublishStatusStore = create<PublishStatusState>((set) => ({
  dirty: true,
  markDirty: () => set((s) => (s.dirty ? s : { dirty: true })),
  markClean: () => set((s) => (s.dirty ? { dirty: false } : s)),
  reset: (hasBeenPublished) => set({ dirty: !hasBeenPublished }),
}));
