"use server";

import { createCanvas, deleteCanvas, renameCanvas } from "@/lib/store";

export async function createCanvasAction(name: string) {
  return createCanvas(name);
}

export async function renameCanvasAction(id: string, name: string) {
  await renameCanvas(id, name);
}

export async function deleteCanvasAction(id: string) {
  await deleteCanvas(id);
}

