"use server";

import type { CanvasDoc } from "@/lib/canvas";
import { createCanvas, deleteCanvas, renameCanvas, writeCanvas } from "@/lib/store";

export async function createCanvasAction(name: string) {
  return createCanvas(name);
}

export async function renameCanvasAction(id: string, name: string) {
  await renameCanvas(id, name);
}

export async function deleteCanvasAction(id: string) {
  await deleteCanvas(id);
}

export async function saveCanvasAction(id: string, doc: CanvasDoc) {
  await writeCanvas(id, doc);
}
