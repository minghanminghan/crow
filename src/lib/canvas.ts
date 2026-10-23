import { nanoid } from "nanoid";

export type Side = "top" | "right" | "bottom" | "left";

export type BaseNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  [k: string]: unknown;
};

export type TextNode = BaseNode & { type: "text"; text: string };
export type LinkNode = BaseNode & {
  type: "link";
  url: string;
  title?: string;
  image?: string;
  site?: string;
};
export type FileNode = BaseNode & { type: "file"; file: string };
export type GroupNode = BaseNode & { type: "group"; label?: string };
export type CanvasNode = TextNode | LinkNode | FileNode | GroupNode;

export type CanvasEdge = {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: Side;
  toSide?: Side;
  label?: string;
  [k: string]: unknown;
};

export type CanvasDoc = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  name?: string;
  [k: string]: unknown;
};

export type CanvasSummary = { id: string; name: string; items: number; mtime: number };
export type Preview = { title?: string; image?: string; site?: string };

export const newId = () => nanoid(16);

const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i;
const VIDEO = /\.(mp4|webm|mov|m4v|ogv)$/i;

export function fileKind(path: string): "image" | "video" | "other" {
  if (IMAGE.test(path)) return "image";
  if (VIDEO.test(path)) return "video";
  return "other";
}
