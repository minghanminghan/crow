import { useCallback, useRef, useState } from "react";
import type { CanvasDoc } from "@/lib/canvas";
import { type Change, applyChanges, diff } from "@/lib/diff";

const LIMIT = 100;

type Next = CanvasDoc | ((d: CanvasDoc) => CanvasDoc);

/**
 * Undo history of this user's own changes, stored as per-object diffs.
 * Edits since the last checkpoint form one step. Undo/redo apply on top of the
 * current doc, so changes merged in from elsewhere (`merge`) are never undone.
 */
export function useHistory(initial: CanvasDoc) {
  const [doc, setDoc] = useState(initial);
  const cur = useRef(initial);
  const base = useRef<CanvasDoc | null>(null);
  const past = useRef<Change[][]>([]);
  const future = useRef<Change[][]>([]);

  const apply = useCallback((d: CanvasDoc) => {
    cur.current = d;
    setDoc(d);
  }, []);

  const commit = useCallback(() => {
    const b = base.current;
    base.current = null;
    if (!b || b === cur.current) return;
    const step = diff(b, cur.current);
    if (!step.length) return;
    past.current = [...past.current.slice(-(LIMIT - 1)), step];
    future.current = [];
  }, []);

  const checkpoint = useCallback(() => {
    commit();
    base.current = cur.current;
  }, [commit]);

  const set = useCallback(
    (next: Next, opts?: { record?: boolean }) => {
      if (opts?.record !== false) checkpoint();
      apply(typeof next === "function" ? next(cur.current) : next);
    },
    [apply, checkpoint],
  );

  const undo = useCallback(() => {
    commit();
    const step = past.current.pop();
    if (!step) return;
    future.current.push(step);
    apply(applyChanges(cur.current, step, "before"));
  }, [apply, commit]);

  const redo = useCallback(() => {
    commit();
    const step = future.current.pop();
    if (!step) return;
    past.current.push(step);
    apply(applyChanges(cur.current, step, "after"));
  }, [apply, commit]);

  /** Swaps in `next` (which includes someone else's `theirs`) without recording `theirs` as an undo step. */
  const merge = useCallback(
    (next: CanvasDoc, theirs: Change[]) => {
      if (base.current) base.current = applyChanges(base.current, theirs, "after");
      apply(next);
    },
    [apply],
  );

  const get = useCallback(() => cur.current, []);

  return { doc, get, set, undo, redo, checkpoint, merge };
}
