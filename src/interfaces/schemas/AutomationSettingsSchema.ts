import mongoose, { Schema, Document } from 'mongoose';

export interface IAutomationSettings extends Document {
  _id: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  enabled: boolean;
  // per-account cache to prevent duplicate sends across restarts
  seenNationIds: number[];
  lastScanAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const automationSettingsSchema = new Schema<IAutomationSettings>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: 'PwAccount', required: true, unique: true, index: true },
    enabled: { type: Boolean, required: true, default: false },
    seenNationIds: { type: [Number], required: true, default: [] },
    lastScanAt: { type: Date, required: false },
  },
  { timestamps: true, collection: 'automation_settings' }
);

automationSettingsSchema.index({ enabled: 1, updatedAt: -1 });

export const AutomationSettings = mongoose.model<IAutomationSettings>('AutomationSettings', automationSettingsSchema);

