import { Schema, model, models } from "mongoose";
import type { Kit } from "../core/types";

// A saved kit: the pipeline inputs + the generated Kit (stored whole, as the
// single embedded document we locked in the data-model decision) + a timestamp.
// The Kit is stored as Mixed so its Appendix-A shape is preserved exactly and we
// don't re-declare the whole graded schema here.

export type KitDoc = {
  _id: string;
  inputs: { jd: string; company_url: string; days: number };
  kit: Kit;
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
    createdAt: { type: Date, default: Date.now },
  },
  { minimize: false }
);

// Guard against model re-registration across Next.js hot reloads.
export const KitModel = models.Kit || model("Kit", KitSchema);
