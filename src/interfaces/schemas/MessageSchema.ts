import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  content: string;
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
    content: {
      type: String,
      required: true,
    },
    bodyHtml: { type: String, required: true },  // HTML markup only, no <style>
    bodyCss: { type: String, default: '' },      // CSS only, no <style> tags
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

export const Message = mongoose.model<IMessage>('Message', messageSchema);
