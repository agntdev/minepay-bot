import { createRequire } from "node:module";

// Durable persistent storage — Redis-backed in production, in-memory fallback
// for the test harness. Every piece of domain data lives here, never in
// session or module-level Maps. Keys never use KEYS/SCAN for enumeration —
// explicit index records are maintained for lookups.

export interface UserAccount {
  telegram_id: number;
  role: "miner" | "affiliate" | "both";
  contact_info: string;
  payout_destination: string;
  payout_method: "paypal" | "bank";
  balance: number;
  referral_code: string;
  referred_by?: number;
  onboarded_at: number;
}

export interface MinerSession {
  id: string;
  user_id: number;
  start_time: number;
  end_time: number;
  minutes_counted: number;
  status: "active" | "completed" | "credited";
  rate_per_minute: number;
}

export interface AffiliateRelationship {
  affiliate_id: number;
  miner_id: number;
  share_percentage: number;
  accrued_balance: number;
}

export interface Transaction {
  id: string;
  type: "earning" | "commission" | "withdrawal" | "dispute_refund";
  amount: number;
  timestamp: number;
  related_user: number;
  description: string;
}

export interface WithdrawalRequest {
  id: string;
  user_id: number;
  destination: string;
  amount: number;
  status: "pending" | "processed" | "rejected";
  timestamp: number;
}

export interface Dispute {
  id: string;
  user_id: number;
  details: string;
  status: "open" | "resolved" | "rejected";
  timestamp: number;
  resolution?: string;
}

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
}

class RedisStore {
  private client: RedisLike;
  private prefix = "mrb:";

  constructor(client: RedisLike) {
    this.client = client;
  }

  private k(key: string): string {
    return this.prefix + key;
  }

  private async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(this.k(key));
    if (raw == null) return undefined;
    try { return JSON.parse(raw) as T; } catch { return undefined; }
  }

  private async set(key: string, value: unknown): Promise<void> {
    await this.client.set(this.k(key), JSON.stringify(value));
  }

  private async del(key: string): Promise<void> {
    await this.client.del(this.k(key));
  }

  private async addToList(key: string, value: string): Promise<void> {
    const raw = await this.client.get(this.k(key));
    const list: string[] = raw ? JSON.parse(raw) : [];
    list.push(value);
    await this.client.set(this.k(key), JSON.stringify(list));
  }

  private async getList(key: string): Promise<string[]> {
    const raw = await this.client.get(this.k(key));
    return raw ? JSON.parse(raw) : [];
  }

  async getUser(telegramId: number): Promise<UserAccount | undefined> {
    return this.get<UserAccount>(`user:${telegramId}`);
  }

  async saveUser(user: UserAccount): Promise<void> {
    await this.set(`user:${user.telegram_id}`, user);
  }

  async getAffiliateByCode(code: string): Promise<number | undefined> {
    const id = await this.get<number>(`affcode:${code}`);
    return id ?? undefined;
  }

  async registerAffiliateCode(code: string, telegramId: number): Promise<void> {
    await this.set(`affcode:${code}`, telegramId);
  }

  async addMinerToAffiliate(affiliateId: number, minerId: number): Promise<void> {
    await this.addToList(`affminers:${affiliateId}`, String(minerId));
  }

  async getMinersForAffiliate(affiliateId: number): Promise<number[]> {
    const list = await this.getList(`affminers:${affiliateId}`);
    return list.map(Number);
  }

  async getAffiliateForMiner(minerId: number): Promise<number | undefined> {
    return this.get<number>(`mineraff:${minerId}`);
  }

  async setAffiliateForMiner(minerId: number, affiliateId: number): Promise<void> {
    await this.set(`mineraff:${minerId}`, affiliateId);
  }

  async saveSession(session: MinerSession): Promise<void> {
    await this.set(`session:${session.id}`, session);
  }

  async getSession(id: string): Promise<MinerSession | undefined> {
    return this.get<MinerSession>(`session:${id}`);
  }

  async addSessionToUser(telegramId: number, sessionId: string): Promise<void> {
    await this.addToList(`usersessions:${telegramId}`, sessionId);
  }

  async getUserSessions(telegramId: number): Promise<MinerSession[]> {
    const ids = await this.getList(`usersessions:${telegramId}`);
    const sessions: MinerSession[] = [];
    for (const id of ids) {
      const s = await this.get<MinerSession>(`session:${id}`);
      if (s) sessions.push(s);
    }
    return sessions;
  }

  async saveTransaction(txn: Transaction): Promise<void> {
    await this.set(`txn:${txn.id}`, txn);
  }

  async addTxnToUser(telegramId: number, txnId: string): Promise<void> {
    await this.addToList(`usertxns:${telegramId}`, txnId);
  }

  async getUserTransactions(telegramId: number): Promise<Transaction[]> {
    const ids = await this.getList(`usertxns:${telegramId}`);
    const txns: Transaction[] = [];
    for (const id of ids) {
      const t = await this.get<Transaction>(`txn:${id}`);
      if (t) txns.push(t);
    }
    return txns;
  }

  async saveWithdrawal(w: WithdrawalRequest): Promise<void> {
    await this.set(`withdrawal:${w.id}`, w);
  }

  async getWithdrawal(id: string): Promise<WithdrawalRequest | undefined> {
    return this.get<WithdrawalRequest>(`withdrawal:${id}`);
  }

  async addWithdrawalToUser(telegramId: number, wId: string): Promise<void> {
    await this.addToList(`userwithdrawals:${telegramId}`, wId);
  }

  async saveDispute(d: Dispute): Promise<void> {
    await this.set(`dispute:${d.id}`, d);
  }

  async getDispute(id: string): Promise<Dispute | undefined> {
    return this.get<Dispute>(`dispute:${id}`);
  }

  async addDisputeToUser(telegramId: number, dId: string): Promise<void> {
    await this.addToList(`userdisputes:${telegramId}`, dId);
  }
}

class MemStore {
  private users = new Map<number, UserAccount>();
  private affCodes = new Map<string, number>();
  private affMiners = new Map<number, number[]>();
  private minerAff = new Map<number, number>();
  private sessions = new Map<string, MinerSession>();
  private userSessions = new Map<number, string[]>();
  private txns = new Map<string, Transaction>();
  private userTxns = new Map<number, string[]>();
  private withdrawals = new Map<string, WithdrawalRequest>();
  private userWithdrawals = new Map<number, string[]>();
  private disputes = new Map<string, Dispute>();
  private userDisputes = new Map<number, string[]>();

  async getUser(telegramId: number): Promise<UserAccount | undefined> {
    return this.users.get(telegramId);
  }

  async saveUser(user: UserAccount): Promise<void> {
    this.users.set(user.telegram_id, user);
  }

  async getAffiliateByCode(code: string): Promise<number | undefined> {
    return this.affCodes.get(code);
  }

  async registerAffiliateCode(code: string, telegramId: number): Promise<void> {
    this.affCodes.set(code, telegramId);
  }

  async addMinerToAffiliate(affiliateId: number, minerId: number): Promise<void> {
    const list = this.affMiners.get(affiliateId) ?? [];
    if (!list.includes(minerId)) list.push(minerId);
    this.affMiners.set(affiliateId, list);
  }

  async getMinersForAffiliate(affiliateId: number): Promise<number[]> {
    return this.affMiners.get(affiliateId) ?? [];
  }

  async getAffiliateForMiner(minerId: number): Promise<number | undefined> {
    return this.minerAff.get(minerId);
  }

  async setAffiliateForMiner(minerId: number, affiliateId: number): Promise<void> {
    this.minerAff.set(minerId, affiliateId);
  }

  async saveSession(session: MinerSession): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async getSession(id: string): Promise<MinerSession | undefined> {
    return this.sessions.get(id);
  }

  async addSessionToUser(telegramId: number, sessionId: string): Promise<void> {
    const list = this.userSessions.get(telegramId) ?? [];
    list.push(sessionId);
    this.userSessions.set(telegramId, list);
  }

  async getUserSessions(telegramId: number): Promise<MinerSession[]> {
    const ids = this.userSessions.get(telegramId) ?? [];
    return ids.map((id) => this.sessions.get(id)).filter((s): s is MinerSession => s != null);
  }

  async saveTransaction(txn: Transaction): Promise<void> {
    this.txns.set(txn.id, txn);
  }

  async addTxnToUser(telegramId: number, txnId: string): Promise<void> {
    const list = this.userTxns.get(telegramId) ?? [];
    list.push(txnId);
    this.userTxns.set(telegramId, list);
  }

  async getUserTransactions(telegramId: number): Promise<Transaction[]> {
    const ids = this.userTxns.get(telegramId) ?? [];
    return ids.map((id) => this.txns.get(id)).filter((t): t is Transaction => t != null);
  }

  async saveWithdrawal(w: WithdrawalRequest): Promise<void> {
    this.withdrawals.set(w.id, w);
  }

  async getWithdrawal(id: string): Promise<WithdrawalRequest | undefined> {
    return this.withdrawals.get(id);
  }

  async addWithdrawalToUser(telegramId: number, wId: string): Promise<void> {
    const list = this.userWithdrawals.get(telegramId) ?? [];
    list.push(wId);
    this.userWithdrawals.set(telegramId, list);
  }

  async saveDispute(d: Dispute): Promise<void> {
    this.disputes.set(d.id, d);
  }

  async getDispute(id: string): Promise<Dispute | undefined> {
    return this.disputes.get(id);
  }

  async addDisputeToUser(telegramId: number, dId: string): Promise<void> {
    const list = this.userDisputes.get(telegramId) ?? [];
    list.push(dId);
    this.userDisputes.set(telegramId, list);
  }
}

export type Store = RedisStore | MemStore;

let _store: Store | undefined;

function createRedisClient(url: string): RedisLike {
  const require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ioredis: any = require("ioredis");
  const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
  return new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false }) as RedisLike;
}

export function getStore(): Store {
  if (_store) return _store;
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    _store = new RedisStore(createRedisClient(redisUrl));
  } else {
    _store = new MemStore();
  }
  return _store;
}

export function resetStoreForTest(): void {
  _store = new MemStore();
}

// Utility: generate a simple unique ID
let _idCounter = 0;
export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++_idCounter}`;
}

// Utility: generate a referral code from a telegram ID
export function generateReferralCode(telegramId: number): string {
  return `MR${telegramId.toString(36).toUpperCase()}`;
}

// Default mining rate
export const MINING_RATE_PER_MINUTE = 0.01;

// Default affiliate share percentage
export const AFFILIATE_SHARE_PERCENTAGE = 10;
