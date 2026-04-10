import mongoose, { Document, Schema } from 'mongoose';
import { CampaignAnalytics, Link, Pixel } from '../interfaces/analytics';

type PixelDocument = Pixel;
type LinkDocument = Link;
type CampaignAnalyticsDocument = Document &
  Omit<CampaignAnalytics, '_id'> & {
    createdAt: Date;
  };

const pixelSchema = new Schema<PixelDocument>(
  {
    id: { type: String, required: true },
    auth: { type: String, required: true },
    readCount: { type: Number, required: true, default: 0 },
    readHistory: { type: [Number], required: true, default: [] },
  },
  { _id: false }
);

const linkSchema = new Schema<LinkDocument>(
  {
    url: { type: String, required: true },
    id: { type: String, required: true },
    auth: { type: String, required: true },
    readCount: { type: Number, required: true, default: 0 },
    readHistory: { type: [Number], required: true, default: [] },
  },
  { _id: false }
);

const campaignAnalyticsSchema = new Schema<CampaignAnalyticsDocument>(
  {
    name: { type: String, required: true, unique: true, index: true },
    sentCount: { type: Number, required: true, default: 0 },
    createdTime: { type: Number, required: true, index: true },
    createdAt: { type: Date, required: true, default: Date.now, expires: 60 * 60 * 24 * 14 },
    links: { type: [linkSchema], required: true, default: [] },
    messagePixel: { type: pixelSchema, required: true },
  },
  {
    collection: 'campaign_analytics',
  }
);

const CampaignAnalyticsModel = mongoose.model<CampaignAnalyticsDocument>(
  'CampaignAnalytics',
  campaignAnalyticsSchema
);

export default CampaignAnalyticsModel;
