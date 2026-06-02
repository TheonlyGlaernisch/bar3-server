import mongoose, { Document, Schema } from 'mongoose';

export interface IPnwNativeAccount extends Document {
  _id: mongoose.Types.ObjectId;
  nationId: number;
  username: string;
  passwordHash: string;
  createdAt: Date;
  lastLoginAt?: Date;
}

const pnwNativeAccountSchema = new Schema<IPnwNativeAccount>(
  {
    nationId: { type: Number, required: true, unique: true, index: true },
    username: { type: String, required: true, unique: true, index: true, lowercase: true },
    passwordHash: { type: String, required: true },
    lastLoginAt: { type: Date, required: false },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'pnw_native_accounts',
  }
);

export const PnwNativeAccount = mongoose.model<IPnwNativeAccount>('PnwNativeAccount', pnwNativeAccountSchema);
