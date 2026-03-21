import type { MemoryStore } from '@ai-employee-sdk/core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KVClient = any;

export class KVStore implements MemoryStore {
  private kv: KVClient;
  private prefix: string;

  constructor(config?: { kv?: KVClient; prefix?: string }) {
    this.prefix = config?.prefix ?? 'ai-employee:';
    this.kv = config?.kv ?? null;
  }

  private async getKV(): Promise<KVClient> {
    if (!this.kv) {
      const mod = await import('@vercel/kv');
      this.kv = (mod as { kv: KVClient }).kv;
    }
    return this.kv as KVClient;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const kv = await this.getKV();
    return kv.get(this.prefix + key) as Promise<T | null>;
  }

  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
    const kv = await this.getKV();
    if (ttlMs !== undefined) {
      await kv.set(this.prefix + key, value, { px: ttlMs });
    } else {
      await kv.set(this.prefix + key, value);
    }
  }

  async list(prefix?: string): Promise<string[]> {
    const kv = await this.getKV();
    const fullPrefix = this.prefix + (prefix ?? '');
    const keys = (await kv.keys(fullPrefix + '*')) as string[];
    return keys.map((k: string) => k.slice(this.prefix.length));
  }

  async delete(key: string): Promise<void> {
    const kv = await this.getKV();
    await kv.del(this.prefix + key);
  }
}
