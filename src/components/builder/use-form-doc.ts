"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormDoc } from "@/lib/forms/schema";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

const HISTORY_LIMIT = 60;
const COALESCE_MS = 800;

/**
 * Holds the form draft with undo/redo and debounced autosave.
 * `update(tag, mutate)` clones the doc, lets you mutate the clone, and records history — edits with
 * the same tag in quick succession (typing in one field) collapse into a single undo step.
 */
export function useFormDoc(initial: FormDoc, save: (doc: FormDoc) => Promise<boolean>, enabled: boolean) {
  const [doc, setDoc] = useState(initial);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const past = useRef<FormDoc[]>([]);
  const future = useRef<FormDoc[]>([]);
  const last = useRef<{ tag: string; at: number }>({ tag: "", at: 0 });
  // Mirrors the history refs so the toolbar re-renders when undo/redo availability changes.
  const [historySize, setHistorySize] = useState({ past: 0, future: 0 });
  const syncHistory = () => setHistorySize({ past: past.current.length, future: future.current.length });
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docRef = useRef(doc);

  const update = useCallback(
    (tag: string, mutate: (draft: FormDoc) => void) => {
      if (!enabled) return;
      // Work from the ref (not a state updater) so history is recorded exactly once per edit.
      const prev = docRef.current;
      const next = structuredClone(prev);
      mutate(next);
      const now = Date.now();
      if (last.current.tag !== tag || now - last.current.at > COALESCE_MS) {
        past.current = [...past.current.slice(-HISTORY_LIMIT + 1), prev];
        future.current = [];
      }
      last.current = { tag, at: now };
      docRef.current = next;
      dirty.current = true;
      setDoc(next);
      syncHistory();
    },
    [enabled],
  );

  const undo = useCallback(() => {
    const prev = past.current.at(-1);
    if (!prev) return;
    past.current = past.current.slice(0, -1);
    future.current = [docRef.current, ...future.current];
    last.current = { tag: "", at: 0 };
    dirty.current = true;
    docRef.current = prev;
    setDoc(prev);
    syncHistory();
  }, []);

  const redo = useCallback(() => {
    const next = future.current[0];
    if (!next) return;
    future.current = future.current.slice(1);
    past.current = [...past.current, docRef.current];
    last.current = { tag: "", at: 0 };
    dirty.current = true;
    docRef.current = next;
    setDoc(next);
    syncHistory();
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (!dirty.current) return true;
    dirty.current = false;
    setStatus("saving");
    const ok = await save(docRef.current);
    if (!ok) dirty.current = true;
    setStatus(ok ? "saved" : "error");
    return ok;
  }, [save]);

  // Debounced autosave; retries on failure.
  useEffect(() => {
    if (!dirty.current || !enabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), status === "error" ? 3000 : 700);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [doc, enabled, flush, status]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return {
    doc,
    update,
    undo,
    redo,
    canUndo: historySize.past > 0,
    canRedo: historySize.future > 0,
    status,
    flush,
  };
}
