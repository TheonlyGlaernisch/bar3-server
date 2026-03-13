import mongoose, { Schema, Document } from 'mongoose';

export interface IPwSession extends Document {
  _id: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  tokenHash: string; // sha256(sessionToken)
  createdAt: Date;
  lastUsedAt: Date;
}

const pwSessionSchema = new Schema<IPwSession>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: 'PwAccount', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    lastUsedAt: { type: Date, default: new Date() },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'pw_sessions',
  }
);

pwSessionSchema.index({ accountId: 1, createdAt: -1 });

export const PwSession = mongoose.model<IPwSession>('PwSession', pwSessionSchema);

