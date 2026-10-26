import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Board from "@/components/board/Board";
import { loadCanvas } from "@/lib/store";

async function Loaded({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const loaded = await loadCanvas(id);
  if (!loaded) notFound();
  return <Board id={id} initial={loaded.doc} version={loaded.version} />;
}

export default function CanvasPage(props: PageProps<"/c/[id]">) {
  return (
    <Suspense fallback={null}>
      <Loaded params={props.params} />
    </Suspense>
  );
}
