import { notFound, redirect } from "next/navigation";
import { connectDB } from "../../../lib/db";
import { KitModel } from "../../../models/kit";
import { currentUserId } from "../../../lib/auth";
import KitView from "../../_components/KitView";
import type { Kit } from "../../../core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function KitPage({ params }: PageProps<"/kit/[id]">) {
  const { id } = await params;

  const uid = await currentUserId();
  if (!uid) redirect("/login");

  await connectDB();
  type Doc = {
    userId?: string;
    kit: Kit;
    editState?: Record<string, Record<string, "edited" | "user-created">>;
  };
  let doc: Doc | null = null;
  try {
    doc = (await KitModel.findById(id).lean()) as Doc | null;
  } catch {
    doc = null; // malformed id -> not found
  }
  if (!doc || doc.userId !== uid) notFound(); // owner-only

  return (
    <main className="relative flex-1">
      <div className="hero-glow" />
      <div className="relative mx-auto w-full max-w-[760px] px-5 py-12 sm:py-16">
        <KitView kit={doc.kit} kitId={id} editState={doc.editState ?? {}} />
      </div>
    </main>
  );
}
