import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStore } from '../file-store';

function makeTempDir(): string {
  const dir = join(tmpdir(), `file-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

let tempDir: string;
let store: FileStore;

beforeEach(() => {
  tempDir = makeTempDir();
  store = new FileStore({ dir: tempDir });
});

afterEach(() => {
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('FileStore', () => {
  describe('basic get/set', () => {
    it('returns null for missing key', async () => {
      const result = await store.get('missing');
      expect(result).toBeNull();
    });

    it('stores and retrieves a string value', async () => {
      await store.set('key1', 'hello');
      const result = await store.get<string>('key1');
      expect(result).toBe('hello');
    });

    it('stores and retrieves an object value', async () => {
      const obj = { name: 'test', count: 42 };
      await store.set('obj', obj);
      const result = await store.get<typeof obj>('obj');
      expect(result).toEqual(obj);
    });

    it('stores and retrieves a number value', async () => {
      await store.set('num', 99);
      const result = await store.get<number>('num');
      expect(result).toBe(99);
    });

    it('last write wins for duplicate keys', async () => {
      await store.set('k', 'first');
      await store.set('k', 'second');
      await store.set('k', 'third');
      const result = await store.get<string>('k');
      expect(result).toBe('third');
    });
  });

  describe('TTL expiry', () => {
    it('returns value before TTL expires', async () => {
      await store.set('ttl-key', 'alive', 10_000); // 10 seconds
      const result = await store.get<string>('ttl-key');
      expect(result).toBe('alive');
    });

    it('returns null after TTL expires', async () => {
      await store.set('ttl-key', 'expired', 1); // 1ms TTL
      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 10));
      const result = await store.get<string>('ttl-key');
      expect(result).toBeNull();
    });

    it('expired keys do not appear in list', async () => {
      await store.set('live', 'val', 10_000);
      await store.set('expired', 'val', 1);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const keys = await store.list();
      expect(keys).toContain('live');
      expect(keys).not.toContain('expired');
    });
  });

  describe('list', () => {
    it('returns empty array for empty store', async () => {
      const keys = await store.list();
      expect(keys).toEqual([]);
    });

    it('returns all keys', async () => {
      await store.set('a', 1);
      await store.set('b', 2);
      await store.set('c', 3);
      const keys = await store.list();
      expect(keys.sort()).toEqual(['a', 'b', 'c']);
    });

    it('filters by prefix', async () => {
      await store.set('memory:a', 1);
      await store.set('memory:b', 2);
      await store.set('other:c', 3);
      const keys = await store.list('memory:');
      expect(keys.sort()).toEqual(['memory:a', 'memory:b']);
      expect(keys).not.toContain('other:c');
    });

    it('deduplicates multiple writes to same key', async () => {
      await store.set('dup', 'v1');
      await store.set('dup', 'v2');
      const keys = await store.list();
      expect(keys.filter((k) => k === 'dup')).toHaveLength(1);
    });

    it('does not include deleted keys', async () => {
      await store.set('to-delete', 'val');
      await store.delete('to-delete');
      const keys = await store.list();
      expect(keys).not.toContain('to-delete');
    });
  });

  describe('delete', () => {
    it('delete removes the entry (get returns null)', async () => {
      await store.set('del-me', 'value');
      await store.delete('del-me');
      const result = await store.get('del-me');
      expect(result).toBeNull();
    });

    it('delete on non-existent key is a no-op', async () => {
      await store.delete('ghost');
      const result = await store.get('ghost');
      expect(result).toBeNull();
    });

    it('tombstones work — delete then set restores value', async () => {
      await store.set('key', 'original');
      await store.delete('key');
      await store.set('key', 'restored');
      const result = await store.get<string>('key');
      expect(result).toBe('restored');
    });
  });

  describe('compact', () => {
    it('compact removes expired entries', async () => {
      await store.set('live', 'val', 10_000);
      await store.set('expired', 'val', 1);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await store.compact();
      // After compact, expired key should still not be accessible
      expect(await store.get('expired')).toBeNull();
      expect(await store.get<string>('live')).toBe('val');
    });

    it('compact removes tombstones', async () => {
      await store.set('gone', 'val');
      await store.delete('gone');
      await store.compact();
      expect(await store.get('gone')).toBeNull();
      // After compact, the key should not appear in list
      expect(await store.list()).not.toContain('gone');
    });

    it('compact retains live entries', async () => {
      await store.set('a', 1);
      await store.set('b', 2);
      await store.compact();
      expect(await store.get<number>('a')).toBe(1);
      expect(await store.get<number>('b')).toBe(2);
    });
  });

  describe('empty store edge cases', () => {
    it('list returns empty array when no file exists', async () => {
      // Fresh store with no writes
      const fresh = new FileStore({ dir: join(tempDir, 'fresh') });
      const keys = await fresh.list();
      expect(keys).toEqual([]);
    });

    it('get returns null when no file exists', async () => {
      const fresh = new FileStore({ dir: join(tempDir, 'fresh2') });
      const result = await fresh.get('anything');
      expect(result).toBeNull();
    });
  });
});
