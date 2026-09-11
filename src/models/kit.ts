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

export type JobStatus = "generating" | "ready" | "failed";

export type GenerationReport = {
  durationMs: number;
  steps: { step: number; label: string; ms: number }[];
  provider?: string;
  model?: string;
};

export type KitDoc = {
  _id: string;
  userId: string;
  version: number;
  status: JobStatus;
  progress: { step: number; label: string };
  error?: string;
  report?: GenerationReport | null;
  inputs: { jd: string; company_url: string; days: number };
  kit: Kit;
  editState: EditState;
  tombstones: Tombstones;
  createdAt: Date;
};

const KitSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    // Optimistic-concurrency counter: every mutating write compare-and-swaps on
    // this, so concurrent edits/regenerates can't silently lose an update.
    version: { type: Number, default: 0 },
    // Background-generation lifecycle. Non-job docs default to "ready".
    status: { type: String, enum: ["generating", "ready", "failed"], default: "ready" },
    progress: { type: Schema.Types.Mixed, default: () => ({ step: 0, label: "" }) },
    error: { type: String },
    report: { type: Schema.Types.Mixed, default: null },
    inputs: {
      jd: { type: String, required: true },
      company_url: { type: String, default: "" },
      days: { type: Number, required: true },
    },
    kit: { type: Schema.Types.Mixed, default: () => ({}) },
    editState: { type: Schema.Types.Mixed, default: () => ({}) },
    tombstones: { type: Schema.Types.Mixed, default: () => ({}) },
    createdAt: { type: Date, default: Date.now },
  },
  { minimize: false }
);

// Guard against model re-registration across Next.js hot reloads.
export const KitModel = models.Kit || model("Kit", KitSchema);
