import { Schema, model, models } from "mongoose";

export type UserDoc = {
  _id: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: Date;
};

const UserSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  salt: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const UserModel = models.User || model("User", UserSchema);
