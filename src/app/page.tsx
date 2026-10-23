import { Suspense } from "react";
import { connection } from "next/server";
import { listCanvases } from "@/lib/store";
import HomeGrid from "./HomeGrid";

async function Canvases() {
  await connection();
  return <HomeGrid canvases={await listCanvases()} />;
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl p-8">
      <Suspense fallback={<p className="text-stone-400">Loading…</p>}>
        <Canvases />
      </Suspense>
    </main>
  );
}
