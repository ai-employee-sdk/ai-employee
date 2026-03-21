import { describe, it, expect, vi } from 'vitest';
import { createMemoryPrepareStep } from '../memory';
import type { MemoryStore } from '../types';

const baseOptions = {
  steps: [],
  stepNumber: 0,
  model: {},
  messages: [],
  experimental_context: {},
};

function makeMockStore(data: Record<string, unknown> = {}): MemoryStore {
  return {
    get: vi.fn(async (key: string) => data[key] ?? null),
    set: vi.fn(async () => undefined),
    list: vi.fn(async (prefix?: string) => {
      return Object.keys(data).filter((k) => !prefix || k.startsWith(prefix));
    }),
    delete: vi.fn(async () => undefined),
  };
}

describe('createMemoryPrepareStep', () => {
  it('returns a function', () => {
    const store = makeMockStore();
    const fn = createMemoryPrepareStep(store);
    expect(typeof fn).toBe('function');
  });

  it('returns undefined at step > 0', async () => {
    const store = makeMockStore({ 'memory:key1': 'hello' });
    const fn = createMemoryPrepareStep(store);
    const result = await fn({ ...baseOptions, stepNumber: 1 });
    expect(result).toBeUndefined();
  });

  it('returns undefined when no memory entries found', async () => {
    const store = makeMockStore();
    const fn = createMemoryPrepareStep(store);
    const result = await fn(baseOptions);
    expect(result).toBeUndefined();
  });

  it('injects system message with memories at step 0', async () => {
    const store = makeMockStore({
      'memory:fact1': 'User prefers concise answers',
    });
    const fn = createMemoryPrepareStep(store);
    const result = (await fn(baseOptions)) as any;
    expect(result).toBeDefined();
    expect(typeof result.system).toBe('string');
    expect(result.system).toContain('<memories>');
    expect(result.system).toContain('memory:fact1');
    expect(result.system).toContain('</memories>');
  });

  it('uses default prefix "memory:" to filter keys', async () => {
    const store = makeMockStore({
      'memory:a': 'val-a',
      'other:b': 'val-b',
    });
    const fn = createMemoryPrepareStep(store);
    await fn(baseOptions);
    // list should be called with 'memory:' prefix
    expect(store.list).toHaveBeenCalledWith('memory:');
  });

  it('respects custom prefix', async () => {
    const store = makeMockStore({ 'ctx:x': 'data' });
    const fn = createMemoryPrepareStep(store, { prefix: 'ctx:' });
    await fn(baseOptions);
    expect(store.list).toHaveBeenCalledWith('ctx:');
  });

  it('uses memoryKeys when provided (bypasses list)', async () => {
    const store = makeMockStore({ 'memory:key': 'value' });
    const fn = createMemoryPrepareStep(store, { memoryKeys: ['memory:key'] });
    const result = (await fn(baseOptions)) as any;
    // list should NOT be called since memoryKeys is provided
    expect(store.list).not.toHaveBeenCalled();
    expect(store.get).toHaveBeenCalledWith('memory:key');
    expect(result.system).toContain('memory:key');
  });

  it('caches snapshot — store.list only called once across multiple step-0 calls', async () => {
    const store = makeMockStore({ 'memory:k': 'v' });
    const fn = createMemoryPrepareStep(store);
    await fn(baseOptions); // step 0
    await fn(baseOptions); // step 0 again (should use cache)
    expect(store.list).toHaveBeenCalledTimes(1);
  });

  it('respects maxTokenBudget — truncates large payloads', async () => {
    // Create entries that exceed a tiny budget
    const bigValue = 'x'.repeat(1000);
    const store = makeMockStore({
      'memory:a': bigValue,
      'memory:b': bigValue,
      'memory:c': bigValue,
    });
    const fn = createMemoryPrepareStep(store, { maxTokenBudget: 10 }); // 40 chars
    const result = (await fn(baseOptions)) as any;
    // System should exist but be truncated — not all 3 entries will fit
    if (result) {
      expect(result.system.length).toBeLessThan(3000);
    }
  });

  it('does not re-inject at step > 0 (no store reads after first call)', async () => {
    const store = makeMockStore({ 'memory:key': 'val' });
    const fn = createMemoryPrepareStep(store);
    await fn(baseOptions); // step 0 — reads store
    const calls = (store.list as ReturnType<typeof vi.fn>).mock.calls.length;

    await fn({ ...baseOptions, stepNumber: 1 }); // step 1 — should not read
    await fn({ ...baseOptions, stepNumber: 2 }); // step 2 — should not read

    expect((store.list as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
  });
});
