import { useCallback, useRef, useState } from "react";
import type { CanvasDoc } from "@/lib/canvas";

const LIMIT = 100;

type Next = CanvasDoc | ((d: CanvasDoc) => CanvasDoc);

export function useHistory(initial: CanvasDoc) {
  const [doc, setDoc] = useState(initial);
  const cur = useRef(initial);
  const past = useRef<CanvasDoc[]>([]);
  const future = useRef<CanvasDoc[]>([]);

  const apply = useCallback((d: CanvasDoc) => {
    cur.current = d;
    setDoc(d);
  }, []);

  const checkpoint = useCallback(() => {
    past.current = [...past.current.slice(-(LIMIT - 1)), cur.current];
    future.current = [];
  }, []);

  const set = useCallback(
    (next: Next, opts?: { record?: boolean }) => {
      if (opts?.record !== false) checkpoint();
      apply(typeof next === "function" ? next(cur.current) : next);
    },
    [apply, checkpoint],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(cur.current);
    apply(prev);
  }, [apply]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(cur.current);
    apply(next);
  }, [apply]);

  const get = useCallback(() => cur.current, []);

  return { doc, get, set, undo, redo, checkpoint };
}
