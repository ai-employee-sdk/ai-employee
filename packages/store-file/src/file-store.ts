import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import type { MemoryStore } from '@ai-employee-sdk/core';

interface StoredEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: number;
  ttlMs?: number;
}

export class FileStore implements MemoryStore {
  private dir: string;
  private filePath: string;

  constructor(config?: { dir?: string }) {
    this.dir = config?.dir ?? '.ai-employee';
    this.filePath = join(this.dir, 'store.ndjson');
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const entries = this.readAll();
    // Find last entry for this key (last write wins)
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry === undefined) continue;
      if (entry.key === key) {
        // Tombstone — treat as deleted
        if (entry.value === null) return null;
        // Check TTL
        if (entry.ttlMs !== undefined && Date.now() - entry.createdAt > entry.ttlMs) {
          return null; // expired
        }
        return entry.value as T;
      }
    }
    return null;
  }

  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
    const entry: StoredEntry<T> = { key, value, createdAt: Date.now(), ttlMs };
    appendFileSync(this.filePath, JSON.stringify(entry) + '\n');
    // Compact if file is large (>1MB)
    if (this.shouldCompact()) await this.compact();
  }

  async list(prefix?: string): Promise<string[]> {
    const entries = this.readAll();
    const seen = new Set<string>();
    const liveKeys: Array<{ key: string; createdAt: number }> = [];

    // Walk backwards for latest entries, deduplicate
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry === undefined) continue;
      if (seen.has(entry.key)) continue;
      seen.add(entry.key);

      // Skip tombstones
      if (entry.value === null) continue;
      // Skip expired
      if (entry.ttlMs !== undefined && Date.now() - entry.createdAt > entry.ttlMs) continue;
      // Skip non-matching prefix
      if (prefix !== undefined && !entry.key.startsWith(prefix)) continue;

      liveKeys.push({ key: entry.key, createdAt: entry.createdAt });
    }

    // Return in chronological order
    liveKeys.sort((a, b) => a.createdAt - b.createdAt);
    return liveKeys.map((e) => e.key);
  }

  async delete(key: string): Promise<void> {
    // Append a tombstone (null value)
    const entry: StoredEntry = { key, value: null, createdAt: Date.now() };
    appendFileSync(this.filePath, JSON.stringify(entry) + '\n');
  }

  private readAll(): StoredEntry[] {
    if (!existsSync(this.filePath)) return [];
    const content = readFileSync(this.filePath, 'utf-8').trim();
    if (!content) return [];
    return content.split('\n').map((line: string) => JSON.parse(line) as StoredEntry);
  }

  private shouldCompact(): boolean {
    try {
      const stats = statSync(this.filePath);
      return stats.size > 1024 * 1024; // 1MB
    } catch {
      return false;
    }
  }

  async compact(): Promise<void> {
    const entries = this.readAll();
    const latest = new Map<string, StoredEntry>();
    for (const entry of entries) {
      latest.set(entry.key, entry);
    }
    // Filter out expired and tombstones
    const live = Array.from(latest.values()).filter((e) => {
      if (e.value === null) return false; // tombstone
      if (e.ttlMs !== undefined && Date.now() - e.createdAt > e.ttlMs) return false; // expired
      return true;
    });
    writeFileSync(
      this.filePath,
      live.map((e) => JSON.stringify(e)).join('\n') + (live.length ? '\n' : ''),
    );
  }
}
