import { describe, it, expect, vi } from 'vitest';
import { createHeartbeat } from '../heartbeat';
import type { MemoryStore } from '../types';

function makeAgent(response: unknown = 'done') {
  return {
    generate: vi.fn(async () => response),
  };
}

function makeMockStore(): MemoryStore & { _data: Record<string, unknown> } {
  const _data: Record<string, unknown> = {};
  return {
    _data,
    get: vi.fn(async (key: string) => _data[key] ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      _data[key] = value;
    }),
    list: vi.fn(async () => Object.keys(_data)),
    delete: vi.fn(async (key: string) => {
      delete _data[key];
    }),
  };
}

describe('createHeartbeat', () => {
  it('returns tick and isRunning functions', () => {
    const hb = createHeartbeat(makeAgent(), {
      checkWork: async () => null,
    });
    expect(typeof hb.tick).toBe('function');
    expect(typeof hb.isRunning).toBe('function');
  });

  it('isRunning returns false initially', () => {
    const hb = createHeartbeat(makeAgent(), { checkWork: async () => null });
    expect(hb.isRunning()).toBe(false);
  });

  it('tick returns null when checkWork returns null (no work)', async () => {
    const hb = createHeartbeat(makeAgent(), { checkWork: async () => null });
    const result = await hb.tick();
    expect(result).toBeNull();
  });

  it('tick returns prompt and response when work is found', async () => {
    const agent = makeAgent('the response');
    const hb = createHeartbeat(agent, {
      checkWork: async () => 'process this',
    });
    const result = await hb.tick();
    expect(result).not.toBeNull();
    expect(result!.prompt).toBe('process this');
    expect(result!.response).toBe('the response');
    expect(agent.generate).toHaveBeenCalledWith({ prompt: 'process this' });
  });

  it('tick returns null when already running (concurrency guard)', async () => {
    let resolveWork!: () => void;
    const workPromise = new Promise<void>((resolve) => {
      resolveWork = resolve;
    });

    const agent = {
      generate: vi.fn(async () => {
        await workPromise;
        return 'done';
      }),
    };

    const hb = createHeartbeat(agent, { checkWork: async () => 'work' });

    // Start first tick but don't await it
    const firstTick = hb.tick();
    // Give event loop a chance to start
    await Promise.resolve();

    // Second tick should return null (concurrency guard)
    const secondTick = await hb.tick();
    expect(secondTick).toBeNull();

    // Resolve and clean up first tick
    resolveWork();
    await firstTick;
  });

  it('isRunning is false after tick completes', async () => {
    const hb = createHeartbeat(makeAgent(), { checkWork: async () => 'work' });
    await hb.tick();
    expect(hb.isRunning()).toBe(false);
  });

  it('isRunning is false even after tick throws', async () => {
    const agent = { generate: vi.fn(async () => { throw new Error('fail'); }) };
    const hb = createHeartbeat(agent, { checkWork: async () => 'work' });
    await expect(hb.tick()).rejects.toThrow('fail');
    expect(hb.isRunning()).toBe(false);
  });

  it('tick returns null when aborted before start', async () => {
    const controller = new AbortController();
    controller.abort();
    const hb = createHeartbeat(makeAgent(), {
      checkWork: async () => 'work',
      signal: controller.signal,
    });
    const result = await hb.tick();
    expect(result).toBeNull();
  });

  it('persists state to store after successful tick', async () => {
    const store = makeMockStore();
    const hb = createHeartbeat(makeAgent(), {
      checkWork: async () => 'work',
      state: store,
    });
    await hb.tick();
    expect(store.set).toHaveBeenCalled();
    const savedState = store._data['heartbeat:state'] as any;
    expect(savedState.consecutiveErrors).toBe(0);
    expect(savedState.circuitOpen).toBe(false);
    expect(savedState.lastTick).toBeGreaterThan(0);
  });

  it('increments consecutiveErrors on agent failure', async () => {
    const store = makeMockStore();
    const agent = { generate: vi.fn(async () => { throw new Error('fail'); }) };
    const hb = createHeartbeat(agent, {
      checkWork: async () => 'work',
      state: store,
      maxConsecutiveErrors: 5,
    });

    await expect(hb.tick()).rejects.toThrow('fail');
    const savedState = store._data['heartbeat:state'] as any;
    expect(savedState.consecutiveErrors).toBe(1);
    expect(savedState.circuitOpen).toBe(false);
  });

  it('opens circuit breaker after maxConsecutiveErrors', async () => {
    const store = makeMockStore();
    const agent = { generate: vi.fn(async () => { throw new Error('fail'); }) };
    const hb = createHeartbeat(agent, {
      checkWork: async () => 'work',
      state: store,
      maxConsecutiveErrors: 3,
    });

    // 3 failures
    for (let i = 0; i < 3; i++) {
      await expect(hb.tick()).rejects.toThrow('fail');
    }

    const savedState = store._data['heartbeat:state'] as any;
    expect(savedState.circuitOpen).toBe(true);
  });

  it('returns null (skips) when circuit is open', async () => {
    const store = makeMockStore();
    // Pre-load state with open circuit
    store._data['heartbeat:state'] = {
      lastTick: Date.now(),
      consecutiveErrors: 5,
      circuitOpen: true,
    };
    const agent = makeAgent();
    const hb = createHeartbeat(agent, {
      checkWork: async () => 'work',
      state: store,
    });

    const result = await hb.tick();
    expect(result).toBeNull();
    expect(agent.generate).not.toHaveBeenCalled();
  });

  it('works without state store (stateless mode)', async () => {
    const hb = createHeartbeat(makeAgent('response'), {
      checkWork: async () => 'task',
    });
    const result = await hb.tick();
    expect(result).not.toBeNull();
    expect(result!.prompt).toBe('task');
  });
});
