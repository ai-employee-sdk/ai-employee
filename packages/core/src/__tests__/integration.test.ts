/**
 * Integration test — composes ALL primitives end-to-end:
 * membrane + memory + heartbeat + stop conditions + EmployeeAgent
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { membrane } from '../membrane';
import { createMemoryPrepareStep } from '../memory';
import { createHeartbeat } from '../heartbeat';
import { EmployeeAgent } from '../employee-agent';
import { budgetExceeded } from '../stop-conditions';
import type { MemoryStore } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeMockModel() {
  return {
    specificationVersion: 'v1' as const,
    provider: 'test',
    modelId: 'test-model',
    defaultObjectGenerationMode: undefined,
    doGenerate: vi.fn(async () => ({
      text: 'done',
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
  const store: Record<string, unknown> = { ...data };
  return {
    get: vi.fn(async (key: string) => store[key] ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      store[key] = value;
    }),
    list: vi.fn(async (prefix?: string) =>
      Object.keys(store).filter((k) => !prefix || k.startsWith(prefix)),
    ),
    delete: vi.fn(async (key: string) => {
      delete store[key];
    }),
  };
}

let tempDir: string;

beforeEach(() => {
  tempDir = join(tmpdir(), `integration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tempDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ── membrane ─────────────────────────────────────────────────────────────────

describe('Integration: membrane', () => {
  it('wraps tools with all 4 tiers', () => {
    const m = membrane({
      tools: {
        readFile: { description: 'Read a file', execute: vi.fn() },
        writeFile: { description: 'Write a file', execute: vi.fn() },
        sendEmail: { description: 'Send email', execute: vi.fn() },
        deleteEverything: { description: 'Dangerous', execute: vi.fn() },
      },
      tiers: {
        auto: ['readFile'],
        draft: ['writeFile'],
        confirm: ['sendEmail'],
        block: ['deleteEverything'],
      },
    });

    // auto: unchanged execute
    expect((m.tools['readFile'] as any).execute).toBeDefined();
    // draft: execute preserved, tracked internally
    expect((m.tools['writeFile'] as any).execute).toBeDefined();
    // confirm: needsApproval set
    expect((m.tools['sendEmail'] as any).needsApproval).toBe(true);
    // block: execute removed
    expect((m.tools['deleteEverything'] as any).execute).toBeUndefined();
  });

  it('prepareStep filters block tools from activeTools', () => {
    const m = membrane({
      tools: {
        safe: { description: 'safe', execute: vi.fn() },
        dangerous: { description: 'dangerous', execute: vi.fn() },
      },
      tiers: {
        auto: ['safe'],
        block: ['dangerous'],
      },
    });

    const result = m.prepareStep({
      steps: [],
      stepNumber: 0,
      model: {},
      messages: [],
      experimental_context: {},
    }) as any;

    expect(result.activeTools).toContain('safe');
    expect(result.activeTools).not.toContain('dangerous');
  });

  it('auditLog records draft-tier tool executions', () => {
    const m = membrane({
      tools: { trackMe: { description: 'tracked tool', execute: vi.fn() } },
      tiers: { draft: ['trackMe'] },
    });

    m.onToolCallFinish({
      toolCall: { toolName: 'trackMe', args: { x: 1 } },
      success: true,
      output: 'result',
      stepNumber: 0,
    });

    expect(m.auditLog).toHaveLength(1);
    expect(m.auditLog[0]?.toolName).toBe('trackMe');
    expect(m.auditLog[0]?.tier).toBe('draft');
  });

  it('auditLog records auto-tier tools (all tiers logged)', () => {
    const m = membrane({
      tools: { fast: { description: 'fast', execute: vi.fn() } },
      tiers: { auto: ['fast'] },
    });

    m.onToolCallFinish({
      toolCall: { toolName: 'fast', args: {} },
      success: true,
      output: 'ok',
      stepNumber: 0,
    });

    expect(m.auditLog).toHaveLength(1);
    expect(m.auditLog[0]?.tier).toBe('auto');
  });
});

// ── memory prepareStep ────────────────────────────────────────────────────────

describe('Integration: memory prepareStep', () => {
  it('injects memory at step 0 only', async () => {
    const store = makeMockStore({ 'memory:fact': 'agent is helpful' });
    const prepareStep = createMemoryPrepareStep(store);

    const baseOpts = {
      steps: [],
      stepNumber: 0,
      model: {},
      messages: [],
      experimental_context: {},
    };

    const step0 = (await prepareStep(baseOpts)) as any;
    expect(step0?.system).toContain('<memories>');
    expect(step0?.system).toContain('memory:fact');

    const step1 = await prepareStep({ ...baseOpts, stepNumber: 1 });
    expect(step1).toBeUndefined();
  });
});

// ── heartbeat ─────────────────────────────────────────────────────────────────

describe('Integration: heartbeat with mock store', () => {
  // createHeartbeat accepts any object with { generate: (prompt) => Promise<unknown> }
  // We use a bare mock agent to avoid model-version validation in ToolLoopAgent
  function makeBareAgent(response: unknown = 'done') {
    return { generate: vi.fn(async () => response) };
  }

  it('tick returns work prompt and response', async () => {
    const store = makeMockStore();
    const agent = makeBareAgent('processed');

    const hb = createHeartbeat(agent, {
      checkWork: async () => 'process queue',
      state: store,
    });

    const result = await hb.tick();
    expect(result).not.toBeNull();
    expect(result!.prompt).toBe('process queue');
    expect(result!.response).toBe('processed');
  });

  it('isRunning is false after tick completes', async () => {
    const store = makeMockStore();
    const agent = makeBareAgent();
    const hb = createHeartbeat(agent, {
      checkWork: async () => null,
      state: store,
    });

    await hb.tick();
    expect(hb.isRunning()).toBe(false);
  });

  it('circuit breaker prevents tick when open', async () => {
    const store = makeMockStore({
      'heartbeat:state': {
        lastTick: Date.now(),
        consecutiveErrors: 5,
        circuitOpen: true,
      },
    });
    const agent = makeBareAgent();
    const hb = createHeartbeat(agent, {
      checkWork: async () => 'work',
      state: store,
    });

    const result = await hb.tick();
    expect(result).toBeNull();
    expect(agent.generate).not.toHaveBeenCalled();
  });
});

// ── stop conditions ───────────────────────────────────────────────────────────

describe('Integration: stop conditions', () => {
  it('budgetExceeded creates a valid stop condition function', () => {
    const condition = budgetExceeded({ maxTokens: 1000 });
    expect(typeof condition).toBe('function');
  });

  it('budgetExceeded fires when token budget exceeded', () => {
    const condition = budgetExceeded({ maxTokens: 100 }) as (state: any) => boolean;
    const mockState = {
      usage: { totalTokens: 150 },
      steps: [{ usage: { totalTokens: 150 } }],
    };
    expect(condition(mockState)).toBe(true);
  });

  it('budgetExceeded does not fire under budget', () => {
    const condition = budgetExceeded({ maxTokens: 1000 }) as (state: any) => boolean;
    const mockState = {
      usage: { totalTokens: 50 },
      steps: [{ usage: { totalTokens: 50 } }],
    };
    expect(condition(mockState)).toBe(false);
  });
});

// ── EmployeeAgent full composition ────────────────────────────────────────────

describe('Integration: EmployeeAgent full composition', () => {
  it('constructs with membrane + memory + stopWhen', () => {
    const store = makeMockStore({ 'memory:context': 'important info' });
    const model = makeMockModel();

    const agent = new EmployeeAgent({
      model,
      id: 'integration-agent',
      instructions: 'You are a helpful assistant.',
      membrane: {
        tiers: {
          auto: ['readFile'],
          draft: ['writeFile'],
          confirm: ['sendEmail'],
          block: ['deleteAll'],
        },
      },
      memory: { store },
      stopWhen: budgetExceeded({ maxTokens: 5000 }),
      tools: {
        readFile: { description: 'Read a file', execute: vi.fn() },
        writeFile: { description: 'Write a file', execute: vi.fn() },
        sendEmail: { description: 'Send email', execute: vi.fn() },
        deleteAll: { description: 'Delete everything', execute: vi.fn() },
      } as any,
    });

    expect(agent).toBeDefined();
    expect(agent.id).toBe('integration-agent');
    expect(agent.version).toBe('agent-v1');
  });

  it('membrane wraps tools correctly in EmployeeAgent', () => {
    const agent = new EmployeeAgent({
      model: makeMockModel(),
      membrane: {
        tiers: {
          block: ['nuke'],
          confirm: ['deploy'],
          draft: ['log'],
          auto: ['read'],
        },
      },
      tools: {
        nuke: { description: 'nuke', execute: vi.fn() },
        deploy: { description: 'deploy', execute: vi.fn() },
        log: { description: 'log', execute: vi.fn() },
        read: { description: 'read', execute: vi.fn() },
      } as any,
    });

    // block: execute removed
    expect((agent.tools['nuke'] as any)?.execute).toBeUndefined();
    // confirm: needsApproval set
    expect((agent.tools['deploy'] as any)?.needsApproval).toBe(true);
    // draft: execute preserved
    expect((agent.tools['log'] as any)?.execute).toBeDefined();
    // auto: execute preserved
    expect((agent.tools['read'] as any)?.execute).toBeDefined();
  });

  it('auditLog is accessible from EmployeeAgent', () => {
    const agent = new EmployeeAgent({
      model: makeMockModel(),
      membrane: { tiers: { draft: ['trackTool'] } },
      tools: {
        trackTool: { description: 'tracked', execute: vi.fn() },
      } as any,
    });

    expect(Array.isArray(agent.auditLog)).toBe(true);
    expect(agent.auditLog).toHaveLength(0);
  });

  it('exposes generate and stream methods', () => {
    const agent = new EmployeeAgent({ model: makeMockModel() });
    expect(typeof agent.generate).toBe('function');
    expect(typeof agent.stream).toBe('function');
  });

  it('constructs with additional prepareStep alongside membrane and memory', () => {
    const store = makeMockStore();
    const customStep = vi.fn(async () => undefined);

    const agent = new EmployeeAgent({
      model: makeMockModel(),
      membrane: { tiers: { auto: ['tool1'] } },
      memory: { store },
      prepareStep: customStep,
      tools: {
        tool1: { description: 'tool', execute: vi.fn() },
      } as any,
    });

    expect(agent).toBeDefined();
  });

  it('constructs with array of prepareStep functions', () => {
    const step1 = vi.fn(async () => undefined);
    const step2 = vi.fn(async () => undefined);

    const agent = new EmployeeAgent({
      model: makeMockModel(),
      prepareStep: [step1, step2],
    });

    expect(agent).toBeDefined();
  });
});
