import { useRef, useCallback, useEffect } from "react";
import { useCanvasStore, isDerivedWrite, type CanvasState } from "./canvas-store";

const MAX_HISTORY = 50;

type Snapshot = Pick<CanvasState, "widgets" | "parametersConfig" | "connectionId">;

function takeSnapshot(): Snapshot {
  const { widgets, parametersConfig, connectionId } = useCanvasStore.getState();
  return JSON.parse(JSON.stringify({ widgets, parametersConfig, connectionId }));
}

function applySnapshot(snap: Snapshot) {
  useCanvasStore.setState({ widgets: snap.widgets, parametersConfig: snap.parametersConfig, connectionId: snap.connectionId });
}

export function useCanvasHistory() {
  const pastRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const skipRef = useRef(false);
  const lastSnapshotRef = useRef<string>("");

  // Auto-record: subscribe to Zustand and push snapshot when widgets/parametersConfig change
  useEffect(() => {
    const unsub = useCanvasStore.subscribe((state) => {
      if (skipRef.current) return;

      const key = JSON.stringify({ w: state.widgets, p: state.parametersConfig, c: state.connectionId });
      if (key === lastSnapshotRef.current) return;

      // A widget restored by redo asks its query again, and the answer writes its columns and
      // chart type back. That is the same edit completing, not a new one: keep it in the
      // current snapshot and leave past and future as they are.
      if (isDerivedWrite()) {
        lastSnapshotRef.current = key;
        return;
      }

      if (lastSnapshotRef.current) {
        const prev = JSON.parse(lastSnapshotRef.current);
        pastRef.current.push({ widgets: prev.w, parametersConfig: prev.p, connectionId: prev.c });
        if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
        futureRef.current = [];
      }

      lastSnapshotRef.current = key;
    });

    const { widgets, parametersConfig, connectionId } = useCanvasStore.getState();
    lastSnapshotRef.current = JSON.stringify({ w: widgets, p: parametersConfig, c: connectionId });

    return unsub;
  }, []);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    skipRef.current = true;
    futureRef.current.push(takeSnapshot());
    const prev = pastRef.current.pop()!;
    applySnapshot(prev);
    lastSnapshotRef.current = JSON.stringify({ w: prev.widgets, p: prev.parametersConfig, c: prev.connectionId });
    skipRef.current = false;
  }, []);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    skipRef.current = true;
    pastRef.current.push(takeSnapshot());
    const next = futureRef.current.pop()!;
    applySnapshot(next);
    lastSnapshotRef.current = JSON.stringify({ w: next.widgets, p: next.parametersConfig, c: next.connectionId });
    skipRef.current = false;
  }, []);

  return {
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
