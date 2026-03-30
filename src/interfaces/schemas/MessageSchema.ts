import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  bodyHtml: string;
  bodyCss?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    bodyHtml: { type: String, required: true },
    bodyCss: { type: String, default: '' },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'messages',
  }
);

messageSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<IMessage>('Message', messageSchema);
