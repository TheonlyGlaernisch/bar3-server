import mongoose from 'mongoose';

interface IAccount {
  _id?: mongoose.Types.ObjectId;
  apiKey: string;
  customMessage: string;
  createdAt: Date;
  updatedAt: Date;
}

export default IAccount;
