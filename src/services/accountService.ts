import AccountModel from '../models/account';
import IAccount from '../interfaces/account';
import * as crypto from 'crypto';

class AccountService {
  private generateApiKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async getOrCreateAccount(apiKey: string): Promise<IAccount> {
    let account = await AccountModel.findOne({ apiKey });

    if (!account) {
      const newAccount = new AccountModel({
        apiKey,
        customMessage: '',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      account = await newAccount.save();
    }

    return account;
  }

  async updateCustomMessage(apiKey: string, customMessage: string): Promise<IAccount | null> {
    const account = await AccountModel.findOneAndUpdate(
      { apiKey },
      {
        customMessage,
        updatedAt: new Date()
      },
      { new: true }
    );
    return account;
  }

  async getAccountByApiKey(apiKey: string): Promise<IAccount | null> {
    return AccountModel.findOne({ apiKey });
  }

  async createNewApiKey(): Promise<string> {
    const newApiKey = this.generateApiKey();
    const newAccount = new AccountModel({
      apiKey: newApiKey,
      customMessage: '',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await newAccount.save();
    return newApiKey;
  }
}

export default new AccountService();
