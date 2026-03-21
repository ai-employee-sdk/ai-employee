import type { MemoryStore } from './types';

interface Entry {
  value: unknown;
  expiresAt: number | null;
}

/**
 * In-memory implementation of MemoryStore.
 * Zero dependencies. For tests and development.
 *
 * TTL is lazy-evaluated: expired entries are cleaned up on access,
 * not via timers (no dangling setTimeouts).
 */
export class InMemoryStore implements MemoryStore {
  private data = new Map<string, Entry>();

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.data.get(key);
    if (!entry) return null;

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.data.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
    this.data.set(key, {
      value,
      expiresAt: ttlMs !== undefined ? Date.now() + ttlMs : null,
    });
  }

  async list(prefix?: string): Promise<string[]> {
    const now = Date.now();
    const keys: string[] = [];

    for (const [key, entry] of this.data) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.data.delete(key);
        continue;
      }
      if (!prefix || key.startsWith(prefix)) {
        keys.push(key);
      }
    }

    return keys;
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  /** Clear all entries. Useful in test teardown. */
  clear(): void {
    this.data.clear();
  }

  /** Number of live (non-expired) entries. */
  get size(): number {
    const now = Date.now();
    for (const [key, entry] of this.data) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.data.delete(key);
      }
    }
    return this.data.size;
  }
}
