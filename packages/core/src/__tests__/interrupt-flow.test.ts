/**
 * Integration test: Full interrupt round-trip.
 *
 * Simulates the Slack coworker flow WITHOUT any external deps:
 *   Agent runs → hits CONFIRM → extract → serialize → approve → resume → complete
 */
import { describe, it, expect, vi } from 'vitest';
import { membrane } from '../membrane';
import { extractPendingApprovals, createInterruptHandle, resolveInterrupt } from '../interrupts';
import { createCostTracker, DEFAULT_MODEL_PRICING } from '../cost-tracker';
import { InMemoryStore } from '../in-memory-store';

// --- Mock tools ---

const readFile = {
  description: 'Read a file',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
  execute: vi.fn(async ({ path }: { path: string }) => `contents of ${path}`),
};

const deleteFile = {
  description: 'Delete a file',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
  execute: vi.fn(async ({ path }: { path: string }) => `deleted ${path}`),
};

const sendEmail = {
  description: 'Send an email',
  inputSchema: { type: 'object', properties: { to: { type: 'string' }, body: { type: 'string' } } },
  execute: vi.fn(async ({ to, body }: { to: string; body: string }) => `sent to ${to}`),
};

// --- Fake generateText result ---
// Simulates what AI SDK returns when needsApproval stops the loop

function fakeGenerateResult(opts: {
  completedSteps: Array<{
    toolCalls: Array<{ toolCallId: string; toolName: string; args: any }>;
    toolResults: Array<{ toolCallId: string; result: any }>;
    usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  }>;
  pendingStep?: {
    toolCalls: Array<{ toolCallId: string; toolName: string; args: any }>;
    toolResults?: Array<{ toolCallId: string; result: any }>;
    usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  };
  messages?: any[];
}) {
  const steps = [
    ...opts.completedSteps,
    ...(opts.pendingStep ? [{ ...opts.pendingStep, toolResults: opts.pendingStep.toolResults ?? [] }] : []),
  ];

  return {
    steps,
    text: 'Agent response',
    // AI SDK v7: messages at result.response.messages
    response: {
      modelId: 'gpt-4o-mini',
      messages: opts.messages ?? [
        { role: 'user', content: 'Do the task' },
        { role: 'assistant', content: 'Working on it...' },
      ],
    },
  };
}

describe('Interrupt Flow — Full Round-Trip', () => {
  it('membrane sets needsApproval on CONFIRM tools', () => {
    const m = membrane({
      tools: { readFile, deleteFile, sendEmail } as any,
      tiers: {
        auto: ['readFile'],
        confirm: ['deleteFile', 'sendEmail'],
      },
    });

    expect((m.tools['deleteFile'] as any).needsApproval).toBe(true);
    expect((m.tools['sendEmail'] as any).needsApproval).toBe(true);
    expect((m.tools['readFile'] as any).needsApproval).toBeUndefined();
  });

  it('extractPendingApprovals finds unanswered tool calls', () => {
    const result = fakeGenerateResult({
      completedSteps: [{
        toolCalls: [{ toolCallId: 'tc_1', toolName: 'readFile', args: { path: '/tmp' } }],
        toolResults: [{ toolCallId: 'tc_1', result: 'file contents' }],
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      }],
      pendingStep: {
        toolCalls: [{ toolCallId: 'tc_2', toolName: 'deleteFile', args: { path: '/important' } }],
        usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
      },
    });

    const pending = extractPendingApprovals(result);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.toolName).toBe('deleteFile');
    expect(pending[0]!.args).toEqual({ path: '/important' });
  });

  it('full cycle: detect → serialize → store → load → approve → resume', async () => {
    const store = new InMemoryStore();

    // Step 1: Agent ran, hit CONFIRM on deleteFile
    const result = fakeGenerateResult({
      completedSteps: [{
        toolCalls: [{ toolCallId: 'tc_1', toolName: 'readFile', args: { path: '/tmp' } }],
        toolResults: [{ toolCallId: 'tc_1', result: 'file contents' }],
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      }],
      pendingStep: {
        toolCalls: [{ toolCallId: 'tc_2', toolName: 'deleteFile', args: { path: '/old-backup' } }],
        usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
      },
    });

    // Step 2: Extract pending approvals
    const pending = extractPendingApprovals(result);
    expect(pending).toHaveLength(1);

    // Step 3: Create interrupt handle (serializable)
    const handle = createInterruptHandle(result, pending);
    expect(handle.id).toBeDefined();
    expect(handle.pendingApprovals[0]!.toolName).toBe('deleteFile');
    expect(handle.previousUsage.totalTokens).toBe(450); // 150 + 300

    // Step 4: Save to store (simulating KV)
    await store.set(`interrupt:${handle.id}`, handle);

    // Step 5: Load from store (simulating new serverless invocation)
    const loaded = await store.get<typeof handle>(`interrupt:${handle.id}`);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(handle.id);

    // Step 6: Human approves
    const { messages, previousUsage } = resolveInterrupt(loaded!, [
      { toolCallId: 'tc_2', action: 'approve' },
    ]);

    // Verify messages are valid for generateText
    expect(messages.length).toBeGreaterThan(handle.messages.length);
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.role).toBe('tool');
    expect(lastMsg.content[0].output.value).toContain('[APPROVED]');

    // Budget continuity preserved
    expect(previousUsage.totalTokens).toBe(450);

    // Step 7: Clean up
    await store.delete(`interrupt:${handle.id}`);
    expect(await store.get(`interrupt:${handle.id}`)).toBeNull();
  });

  it('full cycle: detect → deny → agent sees denial', async () => {
    const result = fakeGenerateResult({
      completedSteps: [],
      pendingStep: {
        toolCalls: [{ toolCallId: 'tc_1', toolName: 'sendEmail', args: { to: 'ceo@co.com', body: 'Hi' } }],
        usage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
      },
    });

    const pending = extractPendingApprovals(result);
    const handle = createInterruptHandle(result, pending);

    // Human denies
    const { messages } = resolveInterrupt(handle, [
      { toolCallId: 'tc_1', action: 'deny' },
    ]);

    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.content[0].output.type).toBe('execution-denied');
    expect(lastMsg.content[0].output.reason).toContain('sendEmail');
  });

  it('full cycle: approve with edited args', async () => {
    const result = fakeGenerateResult({
      completedSteps: [],
      pendingStep: {
        toolCalls: [{ toolCallId: 'tc_1', toolName: 'sendEmail', args: { to: 'wrong@co.com', body: 'Report' } }],
        usage: { inputTokens: 300, outputTokens: 100, totalTokens: 400 },
      },
    });

    const pending = extractPendingApprovals(result);
    const handle = createInterruptHandle(result, pending);

    // Human edits the recipient and approves
    const { messages } = resolveInterrupt(handle, [
      { toolCallId: 'tc_1', action: 'approve', editedArgs: { to: 'correct@co.com', body: 'Report' } },
    ]);

    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.content[0].output.value).toContain('[APPROVED]');
    expect(lastMsg.content[0].output.value).toContain('correct@co.com');
  });

  it('JSON round-trip: handle survives KV serialization', async () => {
    const result = fakeGenerateResult({
      completedSteps: [{
        toolCalls: [{ toolCallId: 'tc_1', toolName: 'readFile', args: { path: '/x' } }],
        toolResults: [{ toolCallId: 'tc_1', result: 'data' }],
        usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
      }],
      pendingStep: {
        toolCalls: [{ toolCallId: 'tc_2', toolName: 'deleteFile', args: { path: '/y' } }],
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
    });

    const pending = extractPendingApprovals(result);
    const handle = createInterruptHandle(result, pending);

    // Simulate KV: JSON.stringify → JSON.parse
    const serialized = JSON.stringify(handle);
    const deserialized = JSON.parse(serialized);

    // Resolve from deserialized handle
    const { messages, previousUsage } = resolveInterrupt(deserialized, [
      { toolCallId: 'tc_2', action: 'approve' },
    ]);

    expect(messages[messages.length - 1].content[0].output.value).toContain('[APPROVED]');
    expect(previousUsage.totalTokens).toBe(225);
  });

  it('multiple CONFIRM tools in one step — all-or-nothing', () => {
    const result = fakeGenerateResult({
      completedSteps: [],
      pendingStep: {
        toolCalls: [
          { toolCallId: 'tc_1', toolName: 'deleteFile', args: { path: '/a' } },
          { toolCallId: 'tc_2', toolName: 'sendEmail', args: { to: 'x@co.com', body: 'hi' } },
        ],
        usage: { inputTokens: 400, outputTokens: 200, totalTokens: 600 },
      },
    });

    const pending = extractPendingApprovals(result);
    expect(pending).toHaveLength(2);

    const handle = createInterruptHandle(result, pending);

    // Approve one, deny the other
    const { messages } = resolveInterrupt(handle, [
      { toolCallId: 'tc_1', action: 'approve' },
      { toolCallId: 'tc_2', action: 'deny' },
    ]);

    const toolMsg = messages[messages.length - 1];
    expect(toolMsg.content).toHaveLength(2);
    expect(toolMsg.content[0].output.value).toContain('[APPROVED]');
    expect(toolMsg.content[1].output.type).toBe('execution-denied');
  });

  it('cost tracker works alongside interrupts', () => {
    const tracker = createCostTracker({
      budget: 0.10,
      pricing: DEFAULT_MODEL_PRICING,
    });

    // Simulate 3 steps worth of onStepFinish events
    tracker.onStepFinish({
      usage: { inputTokens: 1000, outputTokens: 500 },
      response: { modelId: 'gpt-4o-mini' },
    });
    tracker.onStepFinish({
      usage: { inputTokens: 2000, outputTokens: 1000 },
      response: { modelId: 'gpt-4o-mini' },
    });

    const snap = tracker.snapshot();
    expect(snap.totalInputTokens).toBe(3000);
    expect(snap.totalOutputTokens).toBe(1500);
    expect(snap.steps).toBe(2);
    expect(snap.totalCostUsd).toBeGreaterThan(0);
    expect(snap.byModel['gpt-4o-mini']).toBeDefined();
  });

  it('idempotency: delete-before-execute pattern', async () => {
    const store = new InMemoryStore();

    const result = fakeGenerateResult({
      completedSteps: [],
      pendingStep: {
        toolCalls: [{ toolCallId: 'tc_1', toolName: 'deleteFile', args: { path: '/z' } }],
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
    });

    const pending = extractPendingApprovals(result);
    const handle = createInterruptHandle(result, pending);
    await store.set(`interrupt:${handle.id}`, handle);

    // First approval: works
    const loaded1 = await store.get<typeof handle>(`interrupt:${handle.id}`);
    expect(loaded1).not.toBeNull();
    await store.delete(`interrupt:${handle.id}`);
    const { messages: msgs1 } = resolveInterrupt(loaded1!, [{ toolCallId: 'tc_1', action: 'approve' }]);
    expect(msgs1[msgs1.length - 1].content[0].output.value).toContain('[APPROVED]');

    // Second approval (webhook retry): handle gone
    const loaded2 = await store.get<typeof handle>(`interrupt:${handle.id}`);
    expect(loaded2).toBeNull(); // Already processed — bail
  });
});
