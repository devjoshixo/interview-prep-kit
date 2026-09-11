import { Schema, model, models } from "mongoose";
import type { Kit } from "../core/types";

// A saved kit: the pipeline inputs + the generated Kit (stored whole, as the
// single embedded document we locked in the data-model decision) + a timestamp.
// The Kit is stored as Mixed so its Appendix-A shape is preserved exactly and we
// don't re-declare the whole graded schema here.

// Edit state lives OUTSIDE the graded Kit shape: per section, item id -> status,
// plus tombstones (text of deleted items) fed to regenerate as the avoid-list.
export type EditStatus = "edited" | "user-created";
export type EditState = Partial<Record<string, Record<string, EditStatus>>>;
export type Tombstones = Partial<Record<string, string[]>>;

export type KitDoc = {
  _id: string;
  inputs: { jd: string; company_url: string; days: number };
  kit: Kit;
  editState: EditState;
  tombstones: Tombstones;
  createdAt: Date;
};

const KitSchema = new Schema(
  {
    inputs: {
      jd: { type: String, required: true },
      company_url: { type: String, default: "" },
      days: { type: Number, required: true },
    },
    kit: { type: Schema.Types.Mixed, required: true },
    editState: { type: Schema.Types.Mixed, default: () => ({}) },
    tombstones: { type: Schema.Types.Mixed, default: () => ({}) },
    createdAt: { type: Date, default: Date.now },
  },
  { minimize: false }
);

// Guard against model re-registration across Next.js hot reloads.
export const KitModel = models.Kit || model("Kit", KitSchema);
