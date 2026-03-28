import mongoose from 'mongoose';

const AutomationStateSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  apiKey: { type: String, required: true },
  enabled: { type: Boolean, default: false }
});

export default mongoose.model('AutomationState', AutomationStateSchema);
