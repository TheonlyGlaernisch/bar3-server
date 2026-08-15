import AccountModel from '../models/account';
import IAccount from '../interfaces/account';
import * as crypto from 'crypto';
import { PwAccount } from '../interfaces/schemas/PwAccountSchema';
import { encryptString, sha256Hex } from '../utilities/cryptoBox';

class AccountService {
  private generateApiKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Looks up (or creates) the account for a given plaintext API key.
   *
   * IMPORTANT: the plaintext key is never written to the database. Only a
   * one-way SHA-256 lookup hash (`pwApiKeyHash`) and an AES-256-GCM
   * encrypted copy (`pwApiKeyEnc`, needed because the key must later be
   * decrypted to call the Politics & War API on the user's behalf) are
   * persisted, via the `PwAccount` model. The plaintext value only ever
   * lives in memory for the duration of the request.
   */
  async getOrCreateAccount(apiKey: string): Promise<IAccount> {
    const pwApiKeyHash = sha256Hex(apiKey);

    const pwAccount = await PwAccount.findOneAndUpdate(
      { pwApiKeyHash },
      {
        $setOnInsert: { pwApiKeyHash, pwApiKeyEnc: encryptString(apiKey) },
        $set: { lastUsedAt: new Date() },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();

    return {
      apiKey,
      customMessage: '',
      createdAt: pwAccount.createdAt,
      updatedAt: pwAccount.lastUsedAt || pwAccount.createdAt,
    } as IAccount;
  }

  /**
   * One-time cleanup for deployments that still have rows in the legacy
   * `accounts` collection, which stored API keys in plaintext. Each legacy
   * row is re-hashed/encrypted into `pw_accounts` and then deleted, so no
   * plaintext key remains at rest anywhere in the database.
   */
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
