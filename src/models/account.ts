import mongoose, { Schema, Document } from 'mongoose';
import IAccount from '../interfaces/Account';

interface AccountDocument extends IAccount, Document {}

const accountSchema = new Schema<AccountDocument>({
  apiKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  customMessage: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

const AccountModel = mongoose.model<AccountDocument>('Account', accountSchema);

export default AccountModel;
