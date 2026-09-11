import { useCallback, useEffect, useMemo, useState } from "react";
import {
  drawingStorageKey,
  duplicateScalperV2Drawing,
  parseScalperV2Drawings,
  type ScalperV2Drawing,
} from "./scalperV2Drawings";

const newId = () => globalThis.crypto?.randomUUID?.() ?? `drawing-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function useScalperV2Drawings(symbol: string) {
  const key = useMemo(() => drawingStorageKey(symbol), [symbol]);
  const [drawings, setDrawings] = useState<ScalperV2Drawing[]>([]);
  const [past, setPast] = useState<ScalperV2Drawing[][]>([]), [future, setFuture] = useState<ScalperV2Drawing[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "pending" | "failed">("saved");

  useEffect(() => {
    setDrawings(parseScalperV2Drawings(localStorage.getItem(key)));
    setPast([]); setFuture([]); setSelectedId(null); setSaveState("saved");
  }, [key]);

  useEffect(() => {
    setSaveState("pending");
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(key, JSON.stringify(drawings)); setSaveState("saved"); }
      catch { setSaveState("failed"); }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [drawings, key]);

  const commit = useCallback((next: ScalperV2Drawing[] | ((current: ScalperV2Drawing[]) => ScalperV2Drawing[])) => {
    setDrawings((current) => {
      const value = typeof next === "function" ? next(current) : next;
      setPast((history) => [...history.slice(-49), current]); setFuture([]);
      return value;
    });
  }, []);
  const upsert = useCallback((drawing: ScalperV2Drawing) => {
    commit((current) => current.some((row) => row.id === drawing.id) ? current.map((row) => row.id === drawing.id ? drawing : row) : [...current, drawing]);
    setSelectedId(drawing.id);
  }, [commit]);
  const patch = useCallback((id: string, changes: Partial<ScalperV2Drawing>) => commit((current) => current.map((row) => row.id === id ? { ...row, ...changes, updatedAt: new Date().toISOString() } : row)), [commit]);
  const remove = useCallback((id: string) => { commit((current) => current.filter((row) => row.id !== id)); setSelectedId((current) => current === id ? null : current); }, [commit]);
  const clearAll = useCallback(() => {
    if (drawings.length === 0) return;
    commit([]); setSelectedId(null);
  }, [commit, drawings.length]);
  const duplicate = useCallback((id: string) => {
    const drawing = drawings.find((row) => row.id === id); if (!drawing) return;
    const copy = duplicateScalperV2Drawing(drawing, newId()); commit((current) => [...current, copy]); setSelectedId(copy.id);
  }, [commit, drawings]);
  const undo = useCallback(() => setPast((history) => {
    const previous = history.at(-1); if (!previous) return history;
    setFuture((entries) => [drawings, ...entries].slice(0, 50)); setDrawings(previous); return history.slice(0, -1);
  }), [drawings]);
  const redo = useCallback(() => setFuture((entries) => {
    const next = entries[0]; if (!next) return entries;
    setPast((history) => [...history.slice(-49), drawings]); setDrawings(next); return entries.slice(1);
  }), [drawings]);

  return { drawings, selectedId, setSelectedId, saveState, canUndo: past.length > 0, canRedo: future.length > 0, upsert, patch, remove, clearAll, duplicate, undo, redo, newId };
}
