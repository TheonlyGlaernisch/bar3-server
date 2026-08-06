import {
  BANKING_RESOURCE_KEYS,
  BankingLedgerDoc,
  BankingResourceBalance,
  NationBankBalanceWithRegistrationDoc,
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


function subtractBalance(available: BankingResourceBalance, needed: BankingResourceBalance): BankingResourceBalance {
  const next = { ...available } as BankingResourceBalance;
  for (const key of BANKING_RESOURCE_KEYS) next[key] -= needed[key];
  return next;
}

function allocateBalance(available: BankingResourceBalance, needed: BankingResourceBalance): BankingResourceBalance {
  const allocated = emptyBalance();
  for (const key of BANKING_RESOURCE_KEYS) allocated[key] = Math.min(Math.max(available[key], 0), Math.max(needed[key], 0));
  return allocated;
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


  private async _creditOffshoredDeposits(
    guildId: string,
    offshoredResources: BankingResourceBalance
  ): Promise<{ credited: BankingResourceBalance; alliancePool: BankingResourceBalance }> {
    let remaining = normalizeBalance(offshoredResources);
    const credited = emptyBalance();
    const pendingDeposits = await this._db.getBankingLedgerByTypeAndStatus(guildId, 'deposit', 'pending', 500);
    for (const deposit of pendingDeposits) {
      if (!hasAnyAmount(remaining)) break;
      const resources = normalizeBalance(deposit.resources);
      const allocated = allocateBalance(remaining, resources);
      if (!hasAnyAmount(allocated)) continue;
      const registration = deposit.nation_id ? await this._db.getByNationId(deposit.nation_id) : null;
      if (registration && deposit.nation_id != null) {
        await this._db.creditNationBankBalance(guildId, registration.nation_id, allocated);
      } else {
        await this._db.creditAlliancePoolBalance(guildId, allocated);
      }
      remaining = subtractBalance(remaining, allocated);
      const leftoverDeposit = subtractBalance(resources, allocated);
      if (hasAnyAmount(leftoverDeposit)) {
        await this._db.updateBankingLedgerResources(deposit.ledger_id, leftoverDeposit);
      } else {
        await this._db.updateBankingLedgerStatus(deposit.ledger_id, 'completed');
      }
      for (const key of BANKING_RESOURCE_KEYS) credited[key] += allocated[key];
    }
    if (hasAnyAmount(remaining)) {
      await this._db.creditAlliancePoolBalance(guildId, remaining);
      for (const key of BANKING_RESOURCE_KEYS) credited[key] += remaining[key];
    }
    const alliancePool = await this._db.getAlliancePoolBalance(guildId);
    return { credited, alliancePool };
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

  async setApiKeyRefs(
    guildId: string,
    allianceBankApiKeyRef: string,
    offshoreApiKeyRef: string
  ): Promise<void> {
    await this._db.setBankingConfig(guildId, {
      alliance_bank_api_key_ref: allianceBankApiKeyRef.trim(),
      offshore_api_key_ref: offshoreApiKeyRef.trim(),
    });
  }

  async getOffshoreAllianceId(): Promise<number | null> {
    return this._db.getGlobalOffshoreAllianceId(this._defaults.offshoreAllianceId);
  }

  async setOffshoreAllianceId(
    allianceId: number,
    guildId: string | null = null,
    actorDiscordId: string | null = null
  ): Promise<{ offshoreAllianceId: number; migrated: boolean; resources: BankingResourceBalance | null }> {
    const previousAllianceId = await this.getOffshoreAllianceId();
    if (previousAllianceId && previousAllianceId !== allianceId) {
      if (!guildId) {
        throw new Error('A guild context is required to migrate existing offshore holdings.');
      }
      const cfg = await this._db.getBankingConfig(guildId);
      const offshoreKey = this._resolveApiKey(cfg.offshore_api_key_ref);
      if (!offshoreKey) throw new Error('Offshore API key is not configured; cannot migrate existing offshore holdings.');
      const client = new PnWClient(offshoreKey);
      const resources = normalizeBalance(await client.getAllianceBankBalance(previousAllianceId));
      if (hasAnyAmount(resources)) {
        const ledger = await this._db.createBankingLedgerEntry({
          guild_id: guildId,
          nation_id: null,
          type: 'offshore-migration',
          status: 'pending',
          resources,
          source_transaction_id: null,
          idempotency_key: `offshore-migration:${previousAllianceId}:${allianceId}:${Date.now()}`,
          note: `Migrate offshore holdings from ${previousAllianceId} to ${allianceId}`,
          actor_discord_id: actorDiscordId,
          error: null,
        });
        try {
          const transfer = await client.bankWithdraw({
            receiverId: allianceId,
            receiverType: 2,
            resources,
            note: `bar3-offshore-migration ${previousAllianceId}->${allianceId}`,
          });
          await this._db.updateBankingLedgerStatus(ledger.ledger_id, 'completed');
          await this._db.markImportedBankTransaction(
            guildId,
            `offshore-migration-transfer:${transfer.id}`,
            transfer.id,
            ledger.ledger_id
          );
        } catch (error) {
          await this._db.updateBankingLedgerStatus(ledger.ledger_id, 'failed', toErrorMessage(error));
          throw error;
        }
      }
      await this._db.setGlobalOffshoreAllianceId(allianceId);
      return { offshoreAllianceId: allianceId, migrated: hasAnyAmount(resources), resources };
    }
    await this._db.setGlobalOffshoreAllianceId(allianceId);
    return { offshoreAllianceId: allianceId, migrated: false, resources: null };
  }

  async syncGuildDeposits(guildId: string): Promise<SyncResult> {
    await this.ensureGuildConfig(guildId);
    const result: SyncResult = { processed: 0, skipped: 0 };
    const cfg = await this._db.getBankingConfig(guildId);
    if (!cfg.enabled) return result;
    if (!cfg.bot_key) throw new Error(`Banking is enabled for guild ${guildId} but bot_key is missing.`);
    if (!cfg.alliance_bank_alliance_id) {
      throw new Error(`Banking is enabled for guild ${guildId} but alliance bank alliance ID is missing.`);
    }

    const allianceBankKey = this._resolveApiKey(cfg.alliance_bank_api_key_ref);
    if (!allianceBankKey) {
      throw new Error(`Banking is enabled for guild ${guildId} but the alliance bank API key reference is unresolved.`);
    }

    const allianceBankClient = new PnWClient(allianceBankKey);
    const minId = parseCursorId(cfg.last_sync_cursor);
    const transactions = await allianceBankClient.getAllianceBankTransactions(cfg.alliance_bank_alliance_id, {
      minId: minId != null ? minId + 1 : undefined,
      limit: 500,
    });
    const relatedTransactions = transactions
      .filter((tx) =>
        (tx.senderType === 1 && tx.receiverType === 2 && tx.receiverId === cfg.alliance_bank_alliance_id) ||
        (tx.senderType === 2 && tx.senderId === cfg.alliance_bank_alliance_id && tx.receiverType === 1)
      )
      .sort((a, b) => Number.parseInt(a.id, 10) - Number.parseInt(b.id, 10));

    let lastSeenCursor = cfg.last_sync_cursor;
    for (const tx of relatedTransactions) {
      lastSeenCursor = tx.id;
      const resources = normalizeBalance(tx.resources);
      if (!hasAnyAmount(resources)) {
        result.skipped += 1;
        continue;
      }

      const isDeposit = tx.senderType === 1 && tx.receiverType === 2 && tx.receiverId === cfg.alliance_bank_alliance_id;
      if (isDeposit) {
        const idempotencyKey = `deposit:${cfg.alliance_bank_alliance_id}:${tx.id}`;
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
        await this._db.markImportedBankTransaction(guildId, idempotencyKey, tx.id, depositLedger.ledger_id);
        result.processed += 1;
        continue;
      }

      const idempotencyKey = `external-withdrawal:${cfg.alliance_bank_alliance_id}:${tx.id}`;
      let withdrawalLedger: BankingLedgerDoc;
      try {
        const registration = tx.receiverId > 0 ? await this._db.getByNationId(tx.receiverId) : null;
        withdrawalLedger = await this._db.createBankingLedgerEntry({
          guild_id: guildId,
          nation_id: registration?.nation_id ?? (tx.receiverId || null),
          type: 'external-withdrawal',
          status: 'pending',
          resources,
          source_transaction_id: tx.id,
          idempotency_key: idempotencyKey,
          note: tx.note || 'External alliance-bank withdrawal detected',
          actor_discord_id: null,
          error: null,
        });
        const debited = registration
          ? await this._db.debitNationBankBalance(guildId, registration.nation_id, resources)
          : await this._db.debitAlliancePoolBalance(guildId, resources);
        if (!debited.ok) {
          await this._db.updateBankingLedgerStatus(
            withdrawalLedger.ledger_id,
            'failed',
            'External withdrawal exceeded tracked balance. Manual reconcile required before trusting this balance.'
          );
          result.skipped += 1;
          continue;
        }
        await this._db.updateBankingLedgerStatus(withdrawalLedger.ledger_id, 'completed');
        await this._db.markImportedBankTransaction(guildId, idempotencyKey, tx.id, withdrawalLedger.ledger_id);
        result.processed += 1;
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          result.skipped += 1;
          continue;
        }
        throw error;
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

    return result;
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
        note: `bar3-withdraw nation:${nationId}`,
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
    const offshoreAllianceId = await this._db.getGlobalOffshoreAllianceId(this._defaults.offshoreAllianceId);
    if (!offshoreAllianceId) return { ok: false, error: 'Offshore alliance ID is not configured.' };
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
        receiverId: offshoreAllianceId,
        receiverType: 2,
        resources,
        note: note ?? 'bar3-manual-offshore',
      });
      const credited = await this._creditOffshoredDeposits(guildId, resources);
      await this._db.updateBankingLedgerStatus(ledger.ledger_id, 'completed');
      return { ok: true, pool: credited.alliancePool };
    } catch (error) {
      await this._db.updateBankingLedgerStatus(ledger.ledger_id, 'failed', toErrorMessage(error));
      return { ok: false, error: toErrorMessage(error) };
    }
  }

  async getAlliancePoolVisibility(guildId: string): Promise<BankingResourceBalance> {
    return this._db.getAlliancePoolBalance(guildId);
  }

  async getAllNationBalances(guildId: string): Promise<NationBankBalanceWithRegistrationDoc[]> {
    return this._db.getAllNationBankBalances(guildId);
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

