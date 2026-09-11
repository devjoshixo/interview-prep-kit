import { notFound } from "next/navigation";
import { connectDB } from "../../../lib/db";
import { KitModel } from "../../../models/kit";
import KitView from "../../_components/KitView";
import type { Kit } from "../../../core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function KitPage({ params }: PageProps<"/kit/[id]">) {
  const { id } = await params;

  await connectDB();
  let doc: { kit: Kit } | null = null;
  try {
    doc = (await KitModel.findById(id).lean()) as { kit: Kit } | null;
  } catch {
    doc = null; // malformed id -> not found
  }
  if (!doc) notFound();

  return (
    <main className="relative flex-1">
      <div className="hero-glow" />
      <div className="relative mx-auto w-full max-w-[760px] px-5 py-12 sm:py-16">
        <KitView kit={doc.kit} />
      </div>
    </main>
  );
}
