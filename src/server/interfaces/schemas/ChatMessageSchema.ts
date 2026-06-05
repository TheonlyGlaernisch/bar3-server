import mongoose, { Schema, Document } from 'mongoose';

export interface IChatMessage extends Document {
  username: string;
  text: string;
  type: 'message' | 'system';
  timestamp: Date;
}

const chatMessageSchema = new Schema<IChatMessage>(
  {
    username: { type: String, required: true },
    text: { type: String, required: true },
    type: { type: String, enum: ['message', 'system'], required: true },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  { collection: 'chat_messages' }
);

// TTL index — MongoDB automatically deletes documents older than 14 days
chatMessageSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 14 * 24 * 60 * 60 }
);

export const ChatMessage = mongoose.model<IChatMessage>('ChatMessage', chatMessageSchema);

// Export the interface
export { IChatMessage };
