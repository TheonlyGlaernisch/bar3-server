import mongoose, { Schema, Document } from 'mongoose';
import IAccount from '../interfaces/account';

type AccountDocument = Document & Omit<IAccount, '_id'>;

const accountSchema = new Schema<AccountDocument>({
  apiKey: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  customMessage: {
    type: String,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const AccountModel = mongoose.model<AccountDocument>('Account', accountSchema);

export default AccountModel;
