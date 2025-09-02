"use client";
import { useCallback, useMemo, useRef, useState } from "react";

export type QueueStatus = "queued" | "processing" | "done" | "error" | "cancelled";

export interface QueueItem {
  id: string;
  name: string;
  file: File;
  status: QueueStatus;
  error?: string;
}

export default function useTranslationQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);

  const addFiles = useCallback((files: File[]) => {
    if (!files || files.length === 0) return;
    setItems((prev) => {
      const existing = new Set(prev.map((i) => `${i.name}:${i.file.size}`));
      const next: QueueItem[] = [];
      for (const f of files) {
        const key = `${f.name}:${f.size}`;
        if (existing.has(key)) continue;
        next.push({ id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name: f.name, file: f, status: "queued" });
      }
      return [...prev, ...next];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clear = useCallback(() => {
    setItems((prev) => prev.filter((i) => i.status === "processing"));
  }, []);

  const pause = useCallback(() => {
    cancelRef.current = true;
    setRunning(false);
  }, []);

  const start = useCallback(
    async (processor: (item: QueueItem) => Promise<void>) => {
      if (running) return;
      cancelRef.current = false;
      setRunning(true);
      try {
        for (const item of items) {
          if (cancelRef.current) break;
          if (item.status !== "queued") continue;
          setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "processing" } : i)));
          try {
            await processor(item);
            setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "done" } : i)));
          } catch (e: any) {
            setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "error", error: e?.message || String(e) } : i)));
          }
        }
      } finally {
        setRunning(false);
      }
    },
    [items, running]
  );

  const stats = useMemo(() => {
    const total = items.length;
    const queued = items.filter((i) => i.status === "queued").length;
    const processing = items.filter((i) => i.status === "processing").length;
    const done = items.filter((i) => i.status === "done").length;
    const error = items.filter((i) => i.status === "error").length;
    return { total, queued, processing, done, error };
  }, [items]);

  return { items, stats, running, addFiles, removeItem, clear, pause, start };
}
