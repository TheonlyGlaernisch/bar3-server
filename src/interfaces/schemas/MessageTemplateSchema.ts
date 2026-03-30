import mongoose, { Schema, Document } from 'mongoose';

export interface IMessageTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  bodyCss?: string; // <-- Add this line for CSS support!
  createdAt: Date;
  updatedAt: Date;
}

const messageTemplateSchema = new Schema<IMessageTemplate>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: 'PwAccount', required: true, index: true },
    subject: { type: String, required: true, default: '' },
    bodyText: { type: String, required: false },
    bodyHtml: { type: String, required: false },
    bodyCss: { type: String, default: '' }, // <-- add this
  },
  {
    timestamps: true,
    collection: 'message_templates',
  }
);

messageTemplateSchema.index({ accountId: 1, updatedAt: -1 });

export const MessageTemplate = mongoose.model<IMessageTemplate>('MessageTemplate', messageTemplateSchema);
