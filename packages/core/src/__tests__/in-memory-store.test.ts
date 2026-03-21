import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryStore } from '../in-memory-store';

describe('InMemoryStore', () => {
  let store: InMemoryStore;

  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('get returns null for missing key', async () => {
    expect(await store.get('missing')).toBeNull();
  });

  it('set then get returns value', async () => {
    await store.set('key', { name: 'test' });
    expect(await store.get('key')).toEqual({ name: 'test' });
  });

  it('set overwrites existing key', async () => {
    await store.set('key', 'first');
    await store.set('key', 'second');
    expect(await store.get('key')).toBe('second');
  });

  it('delete removes key', async () => {
    await store.set('key', 'value');
    await store.delete('key');
    expect(await store.get('key')).toBeNull();
  });

  it('delete on missing key does not throw', async () => {
    await expect(store.delete('missing')).resolves.toBeUndefined();
  });

  it('list returns all keys when no prefix', async () => {
    await store.set('a', 1);
    await store.set('b', 2);
    const keys = await store.list();
    expect(keys).toContain('a');
    expect(keys).toContain('b');
  });

  it('list filters by prefix', async () => {
    await store.set('memory:a', 1);
    await store.set('memory:b', 2);
    await store.set('other:c', 3);
    const keys = await store.list('memory:');
    expect(keys).toEqual(['memory:a', 'memory:b']);
  });

  it('list returns empty array when no matches', async () => {
    await store.set('a', 1);
    expect(await store.list('z:')).toEqual([]);
  });

  it('TTL: get returns null after expiry', async () => {
    vi.useFakeTimers();
    await store.set('key', 'value', 100);
    vi.advanceTimersByTime(150);
    expect(await store.get('key')).toBeNull();
    vi.useRealTimers();
  });

  it('TTL: get returns value before expiry', async () => {
    vi.useFakeTimers();
    await store.set('key', 'value', 1000);
    vi.advanceTimersByTime(500);
    expect(await store.get('key')).toBe('value');
    vi.useRealTimers();
  });

  it('TTL: list excludes expired entries', async () => {
    vi.useFakeTimers();
    await store.set('alive', 'yes', 1000);
    await store.set('dead', 'no', 100);
    vi.advanceTimersByTime(500);
    const keys = await store.list();
    expect(keys).toEqual(['alive']);
    vi.useRealTimers();
  });

  it('clear removes all entries', async () => {
    await store.set('a', 1);
    await store.set('b', 2);
    store.clear();
    expect(await store.get('a')).toBeNull();
    expect(await store.get('b')).toBeNull();
    expect(store.size).toBe(0);
  });

  it('size returns count of live entries', async () => {
    await store.set('a', 1);
    await store.set('b', 2);
    expect(store.size).toBe(2);
  });

  it('size excludes expired entries', async () => {
    vi.useFakeTimers();
    await store.set('alive', 'yes', 1000);
    await store.set('dead', 'no', 100);
    vi.advanceTimersByTime(500);
    expect(store.size).toBe(1);
    vi.useRealTimers();
  });
});
