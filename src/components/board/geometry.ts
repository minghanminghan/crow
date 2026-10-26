import type { Side } from "@/lib/canvas";

export type Point = { x: number; y: number };
export type Rect = Point & { width: number; height: number };

export const DIR: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

const center = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

export function anchor(r: Rect, side: Side): Point {
  const c = center(r);
  return { x: c.x + (DIR[side].x * r.width) / 2, y: c.y + (DIR[side].y * r.height) / 2 };
}

export function sideToward(r: Rect, p: Point): Side {
  const c = center(r);
  const dx = (p.x - c.x) / r.width;
  const dy = (p.y - c.y) / r.height;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}

export const nearestSides = (a: Rect, b: Rect): [Side, Side] => [
  sideToward(a, center(b)),
  sideToward(b, center(a)),
];

export const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export const normalize = (a: Point, b: Point): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
});
