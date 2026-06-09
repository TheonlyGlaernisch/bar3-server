import mongoose, { Schema, Document } from 'mongoose';

/**
 * Stores Web Push subscriptions keyed by username so the server can push
 * notifications to offline users (especially for @mentions in chat).
 *
 * A single user may have multiple subscriptions (phone + desktop, different
 * browsers) — each is stored as a separate document.
 */
export interface IPushSubscription extends Document {
  _id: mongoose.Types.ObjectId;
  /** The chat username this subscription belongs to */
  username: string;
  /** The push subscription endpoint (from PushSubscription.endpoint) */
  endpoint: string;
  /** JSON-serialised keys: { p256dh, auth } */
  keys: {
    p256dh: string;
    auth: string;
  };
  updatedAt: Date;
  createdAt: Date;
}

const pushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    username: { type: String, required: true, index: true },
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  {
    timestamps: true,
    collection: 'push_subscriptions',
  }
);

// One row per (username + endpoint) — prevents duplicate registrations
// while allowing a user to subscribe from multiple devices/browsers.
pushSubscriptionSchema.index({ username: 1, endpoint: 1 }, { unique: true });

// TTL: auto-remove stale subscriptions after 90 days of inactivity
pushSubscriptionSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
);

export const StoredPushSubscription = mongoose.model<IPushSubscription>(
  'PushSubscription',
  pushSubscriptionSchema
);
