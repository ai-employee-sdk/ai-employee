import { describe, it, expect, vi } from 'vitest';
import { composePrepareStep } from '../compose-prepare-step';

const baseOptions = {
  steps: [],
  stepNumber: 0,
  model: {},
  messages: [],
  experimental_context: {},
};

describe('composePrepareStep', () => {
  it('returns a function', () => {
    const fn = composePrepareStep();
    expect(typeof fn).toBe('function');
  });

  it('empty array returns function that returns undefined', async () => {
    const fn = composePrepareStep();
    const result = await fn(baseOptions);
    expect(result).toBeUndefined();
  });

  it('undefined/null functions are filtered out', async () => {
    const inner = vi.fn(() => ({ model: 'gpt-4' }));
    const fn = composePrepareStep(undefined, inner, null);
    const result = await fn(baseOptions);
    expect(result).toEqual({ model: 'gpt-4' });
  });

  it('single function returned as-is (by reference)', () => {
    const inner = vi.fn();
    const fn = composePrepareStep(inner);
    expect(fn).toBe(inner);
  });

  it('system messages are concatenated', async () => {
    const fn = composePrepareStep(
      () => ({ system: 'You are helpful.' }),
      () => ({ system: 'You are safe.' }),
    );
    const result = (await fn(baseOptions)) as any;
    expect(Array.isArray(result.system)).toBe(true);
    expect(result.system).toHaveLength(2);
    expect(result.system[0].content).toBe('You are helpful.');
    expect(result.system[1].content).toBe('You are safe.');
  });

  it('activeTools are intersected (most restrictive wins)', async () => {
    const fn = composePrepareStep(
      () => ({ activeTools: ['a', 'b', 'c'] }),
      () => ({ activeTools: ['b', 'c', 'd'] }),
    );
    const result = (await fn(baseOptions)) as any;
    expect(result.activeTools).toEqual(expect.arrayContaining(['b', 'c']));
    expect(result.activeTools).not.toContain('a');
    expect(result.activeTools).not.toContain('d');
    expect(result.activeTools).toHaveLength(2);
  });

  it('model uses last writer wins', async () => {
    const fn = composePrepareStep(
      () => ({ model: 'gpt-3.5' }),
      () => ({ model: 'gpt-4' }),
    );
    const result = (await fn(baseOptions)) as any;
    expect(result.model).toBe('gpt-4');
  });

  it('toolChoice uses last writer wins', async () => {
    const fn = composePrepareStep(
      () => ({ toolChoice: 'auto' }),
      () => ({ toolChoice: 'required' }),
    );
    const result = (await fn(baseOptions)) as any;
    expect(result.toolChoice).toBe('required');
  });

  it('experimental_context is deep merged', async () => {
    const fn = composePrepareStep(
      () => ({ experimental_context: { __membrane: { tier: 'auto' }, userId: '123' } }),
      () => ({ experimental_context: { __memory: { key: 'val' }, userId: '456' } }),
    );
    const result = (await fn(baseOptions)) as any;
    expect(result.experimental_context.__membrane).toBeDefined();
    expect(result.experimental_context.__memory).toBeDefined();
    // userId: last writer wins at leaf level
    expect(result.experimental_context.userId).toBe('456');
  });

  it('providerOptions are deep merged', async () => {
    const fn = composePrepareStep(
      () => ({ providerOptions: { anthropic: { thinking: true } } }),
      () => ({ providerOptions: { openai: { stream: true } } }),
    );
    const result = (await fn(baseOptions)) as any;
    expect(result.providerOptions.anthropic).toBeDefined();
    expect(result.providerOptions.openai).toBeDefined();
  });

  it('messages uses last writer wins', async () => {
    const msgs1 = [{ role: 'user', content: 'first' }];
    const msgs2 = [{ role: 'user', content: 'second' }];
    const fn = composePrepareStep(
      () => ({ messages: msgs1 }),
      () => ({ messages: msgs2 }),
    );
    const result = (await fn(baseOptions)) as any;
    expect(result.messages).toBe(msgs2);
  });

  it('functions returning undefined are skipped', async () => {
    const fn = composePrepareStep(
      () => undefined,
      () => ({ model: 'gpt-4' }),
      () => undefined,
    );
    const result = (await fn(baseOptions)) as any;
    expect(result.model).toBe('gpt-4');
  });

  it('all functions returning undefined → returns undefined', async () => {
    const fn = composePrepareStep(
      () => undefined,
      () => undefined,
    );
    const result = await fn(baseOptions);
    expect(result).toBeUndefined();
  });

  it('passes options correctly to each function', async () => {
    const calls: any[] = [];
    const fn = composePrepareStep(
      (opts) => { calls.push(opts); return undefined; },
      (opts) => { calls.push(opts); return undefined; },
    );
    await fn(baseOptions);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBe(baseOptions);
    expect(calls[1]).toBe(baseOptions);
  });
});
