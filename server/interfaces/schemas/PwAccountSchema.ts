import mongoose, { Schema, Document } from 'mongoose';

export interface IPwAccount extends Document {
  _id: mongoose.Types.ObjectId;
  pwApiKeyHash: string; // sha256(apiKey)
  pwApiKeyEnc: string; // encrypted API key (AES-256-GCM payload)
  createdAt: Date;
  lastUsedAt: Date;
}

const pwAccountSchema = new Schema<IPwAccount>(
  {
    pwApiKeyHash: { type: String, required: true, unique: true, index: true },
    pwApiKeyEnc: { type: String, required: true },
    lastUsedAt: { type: Date, default: new Date() },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'pw_accounts',
  }
);

export const PwAccount = mongoose.model<IPwAccount>('PwAccount', pwAccountSchema);

