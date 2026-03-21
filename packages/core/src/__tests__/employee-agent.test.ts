import { describe, it, expect, vi } from 'vitest';
import { EmployeeAgent } from '../employee-agent';
import { budgetExceeded } from '../stop-conditions';
import type { MemoryStore } from '../types';

// Minimal mock language model that satisfies the LanguageModel interface
function makeMockModel() {
  return {
    specificationVersion: 'v1' as const,
    provider: 'test',
    modelId: 'test-model',
    defaultObjectGenerationMode: undefined,
    doGenerate: vi.fn(async () => ({
      text: 'hello',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5 },
      rawCall: { rawPrompt: '', rawSettings: {} },
    })),
    doStream: vi.fn(async () => ({
      stream: new ReadableStream(),
      rawCall: { rawPrompt: '', rawSettings: {} },
    })),
  } as any;
}

function makeMockStore(data: Record<string, unknown> = {}): MemoryStore {
  return {
    get: vi.fn(async (key: string) => data[key] ?? null),
    set: vi.fn(async () => undefined),
    list: vi.fn(async () => Object.keys(data)),
    delete: vi.fn(async () => undefined),
  };
}

describe('EmployeeAgent', () => {
  it('constructs with minimal config (just model)', () => {
    const agent = new EmployeeAgent({ model: makeMockModel() });
    expect(agent).toBeDefined();
  });

  it('version is "agent-v1"', () => {
    const agent = new EmployeeAgent({ model: makeMockModel() });
    expect(agent.version).toBe('agent-v1');
  });

  it('id is undefined when not provided', () => {
    const agent = new EmployeeAgent({ model: makeMockModel() });
    expect(agent.id).toBeUndefined();
  });

  it('id is set when provided', () => {
    const agent = new EmployeeAgent({ model: makeMockModel(), id: 'my-agent' });
    expect(agent.id).toBe('my-agent');
  });

  it('tools is defined (empty when no tools provided)', () => {
    const agent = new EmployeeAgent({ model: makeMockModel() });
    expect(agent.tools).toBeDefined();
  });

  it('constructs with membrane config', () => {
    const agent = new EmployeeAgent({
      model: makeMockModel(),
      membrane: {
        tiers: {
          block: ['deleteEverything'],
          auto: ['readFile'],
        },
      },
      tools: {
        readFile: { description: 'Read a file', execute: vi.fn() },
        deleteEverything: { description: 'Delete', execute: vi.fn() },
      },
    });
    expect(agent).toBeDefined();
    // auditLog is available when membrane is configured
    expect(Array.isArray(agent.auditLog)).toBe(true);
  });

  it('constructs with memory config', () => {
    const store = makeMockStore({ 'memory:key': 'value' });
    const agent = new EmployeeAgent({
      model: makeMockModel(),
      memory: { store },
    });
    expect(agent).toBeDefined();
  });

  it('constructs with prepareStep function', () => {
    const prepareStep = vi.fn(() => ({ model: 'gpt-4' }));
    const agent = new EmployeeAgent({
      model: makeMockModel(),
      prepareStep,
    });
    expect(agent).toBeDefined();
  });

  it('constructs with array of prepareStep functions', () => {
    const step1 = vi.fn(() => undefined);
    const step2 = vi.fn(() => undefined);
    const agent = new EmployeeAgent({
      model: makeMockModel(),
      prepareStep: [step1, step2],
    });
    expect(agent).toBeDefined();
  });

  it('tools are wrapped with membrane tiers (block removes execute)', () => {
    const blockExecute = vi.fn();
    const agent = new EmployeeAgent({
      model: makeMockModel(),
      membrane: { tiers: { block: ['dangerous'] } },
      tools: {
        dangerous: { description: 'Dangerous tool', execute: blockExecute },
        safe: { description: 'Safe tool', execute: vi.fn() },
      },
    });
    // The blocked tool should have execute: undefined in the wrapped tools
    expect((agent.tools['dangerous'] as any)?.execute).toBeUndefined();
    expect((agent.tools['safe'] as any)?.execute).toBeDefined();
  });

  it('auditLog is empty array when no membrane configured', () => {
    const agent = new EmployeeAgent({ model: makeMockModel() });
    expect(agent.auditLog).toEqual([]);
  });

  it('exposes generate method', () => {
    const agent = new EmployeeAgent({ model: makeMockModel() });
    expect(typeof agent.generate).toBe('function');
  });

  it('exposes stream method', () => {
    const agent = new EmployeeAgent({ model: makeMockModel() });
    expect(typeof agent.stream).toBe('function');
  });

  it('constructs with stopWhen condition', () => {
    const agent = new EmployeeAgent({
      model: makeMockModel(),
      stopWhen: budgetExceeded({ maxTokens: 1000 }),
    });
    expect(agent).toBeDefined();
  });

  it('constructs with onStepFinish and onFinish callbacks', () => {
    const onStepFinish = vi.fn();
    const onFinish = vi.fn();
    const agent = new EmployeeAgent({
      model: makeMockModel(),
      onStepFinish,
      onFinish,
    });
    expect(agent).toBeDefined();
  });
});
