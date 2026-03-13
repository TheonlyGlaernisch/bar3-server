import mongoose, { Schema, Document } from 'mongoose';

export interface ITrackingLink extends Document {
  _id: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  shortId: string; // public id used in URLs
  url: string;
  clickCount: number;
  clickHistory: Date[];
  createdAt: Date;
  updatedAt: Date;
}

const trackingLinkSchema = new Schema<ITrackingLink>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: 'PwAccount', required: true, index: true },
    shortId: { type: String, required: true, unique: true, index: true },
    url: { type: String, required: true },
    clickCount: { type: Number, required: true, default: 0 },
    clickHistory: { type: [Date], required: true, default: [] },
  },
  { timestamps: true, collection: 'tracking_links' }
);

trackingLinkSchema.index({ accountId: 1, updatedAt: -1 });

export interface IMessageView extends Document {
  _id: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  messageId: string; // public id
  viewCount: number;
  viewHistory: Date[];
  createdAt: Date;
  updatedAt: Date;
}

const messageViewSchema = new Schema<IMessageView>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: 'PwAccount', required: true, index: true },
    messageId: { type: String, required: true, index: true },
    viewCount: { type: Number, required: true, default: 0 },
    viewHistory: { type: [Date], required: true, default: [] },
  },
  { timestamps: true, collection: 'message_views' }
);

messageViewSchema.index({ accountId: 1, messageId: 1 }, { unique: true });

export const TrackingLink = mongoose.model<ITrackingLink>('TrackingLink', trackingLinkSchema);
export const MessageView = mongoose.model<IMessageView>('MessageView', messageViewSchema);

