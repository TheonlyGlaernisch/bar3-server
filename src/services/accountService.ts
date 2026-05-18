import AccountModel from '../models/account';
import IAccount from '../interfaces/account';
import * as crypto from 'crypto';
import { PwAccount } from '../interfaces/schemas/PwAccountSchema';
import { encryptString, sha256Hex } from '../utilities/cryptoBox';

class AccountService {
  private generateApiKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async getOrCreateAccount(apiKey: string): Promise<IAccount> {
    const existing = await AccountModel.findOne({ apiKey });
    if (existing) return existing;

    const pwApiKeyHash = sha256Hex(apiKey);
    const pwAccount = await PwAccount.findOne({ pwApiKeyHash }).exec();
    if (pwAccount) {
      return {
        apiKey,
        customMessage: '',
        createdAt: pwAccount.createdAt,
        updatedAt: pwAccount.lastUsedAt || pwAccount.createdAt,
      } as IAccount;
    }

    const newAccount = new AccountModel({
      apiKey,
      customMessage: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return newAccount.save();
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


  async migrateLegacyAccountsToPwAccounts(): Promise<{ migrated: number; deleted: number; total: number }> {
    const legacyAccounts = await AccountModel.find({ apiKey: { $exists: true, $ne: '' } }).exec();
    let migrated = 0;
    let deleted = 0;

    for (const legacy of legacyAccounts) {
      const apiKey = (legacy.apiKey || '').trim();
      if (!apiKey) continue;
      const pwApiKeyHash = sha256Hex(apiKey);
      const existing = await PwAccount.findOne({ pwApiKeyHash }).exec();
      if (!existing) {
        await PwAccount.create({
          pwApiKeyHash,
          pwApiKeyEnc: encryptString(apiKey),
          lastUsedAt: legacy.updatedAt || legacy.createdAt || new Date(),
        });
        migrated += 1;
      }

      await legacy.deleteOne();
      deleted += 1;
    }

    return { migrated, deleted, total: legacyAccounts.length };
  }

  async createNewApiKey(): Promise<string> {
    return this.generateApiKey();
  }
}

export default new AccountService();
