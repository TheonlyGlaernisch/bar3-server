import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  apiKeyHash: string;
  createdAt: Date;
  lastUsedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      unique: false,
    },
    apiKeyHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    lastUsedAt: {
      type: Date,
      default: new Date(),
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'users',
  }
);

export const User = mongoose.model<IUser>('User', userSchema);
