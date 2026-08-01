import {
  BANKING_RESOURCE_KEYS,
  BankingLedgerDoc,
  BankingResourceBalance,
  Database,
} from './database';
import { BankTransactionRecord, PnWClient } from './pnw_api';

const EPSILON = 0.000001;

export interface BankingRuntimeDefaults {
  enabled: boolean;
  offshoreAllianceId: number | null;
  allianceBankAllianceId: number | null;
  allianceBankApiKeyRef: string | null;
  offshoreApiKeyRef: string | null;
  botKey: string | null;
}

export interface SyncResult {
  processed: number;
  skipped: number;
  forwarded: number;
  failedForwards: number;
}

function emptyBalance(): BankingResourceBalance {
  const balance = {} as BankingResourceBalance;
  for (const key of BANKING_RESOURCE_KEYS) balance[key] = 0;
  return balance;
}

function normalizeBalance(input: Partial<BankingResourceBalance> | null | undefined): BankingResourceBalance {
  const out = emptyBalance();
  if (!input) return out;
  for (const key of BANKING_RESOURCE_KEYS) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

function hasAnyAmount(balance: BankingResourceBalance): boolean {
  return BANKING_RESOURCE_KEYS.some((key) => Math.abs(balance[key]) > EPSILON);
}

function balanceToNote(balance: BankingResourceBalance): string {
  return BANKING_RESOURCE_KEYS
    .filter((key) => Math.abs(balance[key]) > EPSILON)
    .map((key) => `${key}:${Math.trunc(balance[key] * 100) / 100}`)
    .join(', ') || 'no resources';
}

function parseCursorId(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? 'Unknown error');
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { code?: unknown }).code === 11000;
}

export class BankingService {
  private readonly _db: Database;
  private readonly _defaults: BankingRuntimeDefaults;
  private readonly _fallbackPnwApiKey: string;

  constructor(db: Database, defaults: BankingRuntimeDefaults, fallbackPnwApiKey: string) {
    this._db = db;
    this._defaults = defaults;
    this._fallbackPnwApiKey = fallbackPnwApiKey;
  }

  private _resolveApiKey(apiKeyRef: string | null): string {
    const direct = (apiKeyRef ?? '').trim();
    if (!direct) return this._fallbackPnwApiKey;
    const envRef = direct.startsWith('env:') ? direct.slice(4).trim() : '';
    if (envRef) return (process.env[envRef] || '').trim();
    const envFallback = (process.env[direct] || '').trim();
    return envFallback || direct;
  }

  async ensureGuildConfig(guildId: string): Promise<void> {
    const cfg = await this._db.getBankingConfig(guildId);
    const patch: Record<string, unknown> = {};
    if (cfg.offshore_alliance_id == null && this._defaults.offshoreAllianceId != null) {
      patch['offshore_alliance_id'] = this._defaults.offshoreAllianceId;
    }
    if (cfg.alliance_bank_alliance_id == null && this._defaults.allianceBankAllianceId != null) {
      patch['alliance_bank_alliance_id'] = this._defaults.allianceBankAllianceId;
    }
    if (!cfg.alliance_bank_api_key_ref && this._defaults.allianceBankApiKeyRef) {
      patch['alliance_bank_api_key_ref'] = this._defaults.allianceBankApiKeyRef;
    }
    if (!cfg.offshore_api_key_ref && this._defaults.offshoreApiKeyRef) {
      patch['offshore_api_key_ref'] = this._defaults.offshoreApiKeyRef;
    }
    if (!cfg.bot_key && this._defaults.botKey) {
      patch['bot_key'] = this._defaults.botKey;
    }
    if (typeof cfg.enabled !== 'boolean') {
      patch['enabled'] = this._defaults.enabled;
    }
    if (Object.keys(patch).length > 0) {
      await this._db.setBankingConfig(guildId, patch);
    }
  }

  async getBankingEnabled(guildId: string): Promise<boolean> {
    return this._db.getBankingEnabled(guildId);
  }

  async setBankingEnabled(guildId: string, enabled: boolean): Promise<boolean> {
    const row = await this._db.setBankingEnabled(guildId, enabled);
    return row.enabled;
  }

  async syncGuildDeposits(guildId: string): Promise<SyncResult> {
    await this.ensureGuildConfig(guildId);
    const result: SyncResult = { processed: 0, skipped: 0, forwarded: 0, failedForwards: 0 };
    const cfg = await this._db.getBankingConfig(guildId);
    if (!cfg.enabled) return result;
    if (!cfg.bot_key) throw new Error(`Banking is enabled for guild ${guildId} but bot_key is missing.`);
    if (!cfg.alliance_bank_alliance_id || !cfg.offshore_alliance_id) {
      throw new Error(`Banking is enabled for guild ${guildId} but alliance IDs are missing.`);
    }

    const allianceBankKey = this._resolveApiKey(cfg.alliance_bank_api_key_ref);
    const offshoreKey = this._resolveApiKey(cfg.offshore_api_key_ref);
    if (!allianceBankKey || !offshoreKey) {
      throw new Error(`Banking is enabled for guild ${guildId} but API key references are unresolved.`);
    }

    const allianceBankClient = new PnWClient(allianceBankKey);
    const offshoreClient = new PnWClient(offshoreKey);
    const minId = parseCursorId(cfg.last_sync_cursor);
    const transactions = await allianceBankClient.getAllianceBankTransactions(cfg.alliance_bank_alliance_id, {
      minId: minId != null ? minId + 1 : undefined,
      limit: 500,
    });
    const depositCandidates = transactions
      .filter((tx) => tx.senderType === 1 && tx.receiverType === 2 && tx.receiverId === cfg.alliance_bank_alliance_id)
      .sort((a, b) => Number.parseInt(a.id, 10) - Number.parseInt(b.id, 10));

    let lastSeenCursor = cfg.last_sync_cursor;
    for (const tx of depositCandidates) {
      lastSeenCursor = tx.id;
      const idempotencyKey = `deposit:${cfg.alliance_bank_alliance_id}:${tx.id}`;
      const resources = normalizeBalance(tx.resources);
      if (!hasAnyAmount(resources)) {
        result.skipped += 1;
        continue;
      }
      let depositLedger: BankingLedgerDoc;
      try {
        depositLedger = await this._db.createBankingLedgerEntry({
          guild_id: guildId,
          nation_id: tx.senderId || null,
          type: 'deposit',
          status: 'pending',
          resources,
          source_transaction_id: tx.id,
          idempotency_key: idempotencyKey,
          note: tx.note || null,
          actor_discord_id: null,
          error: null,
        });
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          result.skipped += 1;
          continue;
        }
        throw error;
      }
      const registration = tx.senderId > 0 ? await this._db.getByNationId(tx.senderId) : null;
      if (registration) {
        await this._db.creditNationBankBalance(guildId, registration.nation_id, resources);
      } else {
        await this._db.creditAlliancePoolBalance(guildId, resources);
      }
      await this._db.updateBankingLedgerStatus(depositLedger.ledger_id, 'completed');
      await this._db.markImportedBankTransaction(guildId, idempotencyKey, tx.id, depositLedger.ledger_id);
      result.processed += 1;

      const forwardLedger = await this._db.createBankingLedgerEntry({
        guild_id: guildId,
        nation_id: registration?.nation_id ?? null,
        type: 'forward',
        status: 'pending',
        resources,
        source_transaction_id: tx.id,
        idempotency_key: `forward:${cfg.alliance_bank_alliance_id}:${tx.id}`,
        note: `Auto-forward deposit ${tx.id}`,
        actor_discord_id: null,
        error: null,
      });
      try {
        await offshoreClient.bankWithdraw({
          receiverId: cfg.offshore_alliance_id,
          receiverType: 2,
          resources,
          note: `bar3-auto-forward deposit:${tx.id} bot_key:${cfg.bot_key}`,
        });
        await this._db.updateBankingLedgerStatus(forwardLedger.ledger_id, 'completed');
        result.forwarded += 1;
      } catch (error) {
        await this._db.updateBankingLedgerStatus(forwardLedger.ledger_id, 'failed', toErrorMessage(error));
        result.failedForwards += 1;
      }
    }

    if (lastSeenCursor && lastSeenCursor !== cfg.last_sync_cursor) {
      await this._db.setBankingConfig(guildId, {
        last_sync_cursor: lastSeenCursor,
        last_sync_at: new Date().toISOString(),
      });
    } else {
      await this._db.setBankingConfig(guildId, { last_sync_at: new Date().toISOString() });
    }

    await this.retryFailedForwards(guildId);
    return result;
  }

  async retryFailedForwards(guildId: string): Promise<number> {
    const cfg = await this._db.getBankingConfig(guildId);
    if (!cfg.enabled || !cfg.offshore_alliance_id || !cfg.bot_key) return 0;
    const offshoreKey = this._resolveApiKey(cfg.offshore_api_key_ref);
    if (!offshoreKey) return 0;
    const offshoreClient = new PnWClient(offshoreKey);
    const failed = await this._db.getBankingLedgerByStatus(guildId, 'failed', 100);
    let retried = 0;
    for (const row of failed) {
      if (row.type !== 'forward') continue;
      try {
        await this._db.updateBankingLedgerStatus(row.ledger_id, 'pending');
        await offshoreClient.bankWithdraw({
          receiverId: cfg.offshore_alliance_id,
          receiverType: 2,
          resources: row.resources,
          note: row.note ?? `bar3-forward-retry ${row.source_transaction_id ?? row.ledger_id} bot_key:${cfg.bot_key}`,
        });
        await this._db.updateBankingLedgerStatus(row.ledger_id, 'completed');
        retried += 1;
      } catch (error) {
        await this._db.updateBankingLedgerStatus(row.ledger_id, 'failed', toErrorMessage(error));
      }
    }
    return retried;
  }

  async withdrawToNation(
    guildId: string,
    nationId: number,
    resourcesInput: Partial<BankingResourceBalance>,
    actorDiscordId: string
  ): Promise<{ ok: true; remaining: BankingResourceBalance } | { ok: false; error: string; remaining?: BankingResourceBalance }> {
    const cfg = await this._db.getBankingConfig(guildId);
    if (!cfg.enabled) return { ok: false, error: 'Banking is currently disabled for this guild.' };
    if (!cfg.bot_key) return { ok: false, error: 'Banking configuration is missing bot_key.' };
    const offshoreKey = this._resolveApiKey(cfg.offshore_api_key_ref);
    if (!offshoreKey) return { ok: false, error: 'Offshore API key is not configured.' };
    const resources = normalizeBalance(resourcesInput);
    if (!hasAnyAmount(resources)) return { ok: false, error: 'Provide at least one positive resource amount.' };
    const current = await this._db.getNationBankBalance(guildId, nationId);
    for (const key of BANKING_RESOURCE_KEYS) {
      if (resources[key] > current[key]) {
        return { ok: false, error: `Insufficient ${key} balance.`, remaining: current };
      }
    }

    const offshoreClient = new PnWClient(offshoreKey);
    const ledger = await this._db.createBankingLedgerEntry({
      guild_id: guildId,
      nation_id: nationId,
      type: 'withdraw',
      status: 'pending',
      resources,
      source_transaction_id: null,
      idempotency_key: `withdraw:${guildId}:${nationId}:${Date.now()}`,
      note: `Withdraw to nation ${nationId} (${balanceToNote(resources)})`,
      actor_discord_id: actorDiscordId,
      error: null,
    });
    try {
      const transfer = await offshoreClient.bankWithdraw({
        receiverId: nationId,
        receiverType: 1,
        resources,
        note: `bar3-withdraw nation:${nationId} bot_key:${cfg.bot_key}`,
      });
      const debited = await this._db.debitNationBankBalance(guildId, nationId, resources);
      if (!debited.ok) {
        await this._db.updateBankingLedgerStatus(
          ledger.ledger_id,
          'failed',
          `Transfer ${transfer.id} succeeded but balance debit failed. Manual reconcile required.`
        );
        return { ok: false, error: 'Withdrawal transfer succeeded but balance update failed. Staff has been alerted.' };
      }
      await this._db.updateBankingLedgerStatus(ledger.ledger_id, 'completed');
      return { ok: true, remaining: debited.balance };
    } catch (error) {
      await this._db.updateBankingLedgerStatus(ledger.ledger_id, 'failed', toErrorMessage(error));
      return { ok: false, error: toErrorMessage(error) };
    }
  }

  async manualSendToOffshore(
    guildId: string,
    resourcesInput: Partial<BankingResourceBalance>,
    actorDiscordId: string,
    note: string | null
  ): Promise<{ ok: true; pool: BankingResourceBalance } | { ok: false; error: string }> {
    const cfg = await this._db.getBankingConfig(guildId);
    if (!cfg.enabled) return { ok: false, error: 'Banking is currently disabled for this guild.' };
    if (!cfg.offshore_alliance_id) return { ok: false, error: 'Offshore alliance ID is not configured.' };
    if (!cfg.bot_key) return { ok: false, error: 'Banking configuration is missing bot_key.' };
    const allianceBankKey = this._resolveApiKey(cfg.alliance_bank_api_key_ref);
    if (!allianceBankKey) return { ok: false, error: 'Alliance-bank API key is not configured.' };

    const resources = normalizeBalance(resourcesInput);
    if (!hasAnyAmount(resources)) return { ok: false, error: 'Provide at least one positive resource amount.' };
    const client = new PnWClient(allianceBankKey);
    const ledger = await this._db.createBankingLedgerEntry({
      guild_id: guildId,
      nation_id: null,
      type: 'manual-offshore',
      status: 'pending',
      resources,
      source_transaction_id: null,
      idempotency_key: `manual-offshore:${guildId}:${Date.now()}`,
      note: note || `Manual offshore forward (${balanceToNote(resources)})`,
      actor_discord_id: actorDiscordId,
      error: null,
    });
    try {
      await client.bankWithdraw({
        receiverId: cfg.offshore_alliance_id,
        receiverType: 2,
        resources,
        note: `${note ?? 'bar3-manual-offshore'} bot_key:${cfg.bot_key}`,
      });
      const pool = await this._db.creditAlliancePoolBalance(guildId, resources);
      await this._db.updateBankingLedgerStatus(ledger.ledger_id, 'completed');
      return { ok: true, pool };
    } catch (error) {
      await this._db.updateBankingLedgerStatus(ledger.ledger_id, 'failed', toErrorMessage(error));
      return { ok: false, error: toErrorMessage(error) };
    }
  }

  async getMemberVisibility(guildId: string, nationId: number): Promise<{
    nationBalance: BankingResourceBalance;
    alliancePool: BankingResourceBalance;
    lastActivity: Pick<BankingLedgerDoc, 'ledger_id' | 'type' | 'status' | 'created_at' | 'updated_at' | 'error'> | null;
  }> {
    const nationBalance = await this._db.getNationBankBalance(guildId, nationId);
    const alliancePool = await this._db.getAlliancePoolBalance(guildId);
    const latest = await this._db.getLatestBankingActivity(guildId, nationId);
    return {
      nationBalance,
      alliancePool,
      lastActivity: latest
        ? {
          ledger_id: latest.ledger_id,
          type: latest.type,
          status: latest.status,
          created_at: latest.created_at,
          updated_at: latest.updated_at,
          error: latest.error,
        }
        : null,
    };
  }
}

