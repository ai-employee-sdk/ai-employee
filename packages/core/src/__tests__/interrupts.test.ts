import { describe, it, expect } from 'vitest';
import { extractPendingApprovals, createInterruptHandle, resolveInterrupt } from '../interrupts';

// Helper: fake generateText result (AI SDK v7 format)
function fakeResult(steps: any[], messages?: any[]) {
  return {
    steps,
    // v7: messages are at result.response.messages, not result.messages
    response: {
      messages: messages ?? [{ role: 'user', content: 'test' }],
    },
    text: 'done',
  };
}

describe('extractPendingApprovals', () => {
  it('returns empty array when result has no steps', () => {
    expect(extractPendingApprovals({})).toEqual([]);
    expect(extractPendingApprovals({ steps: [] })).toEqual([]);
  });

  it('returns empty array when all tool calls have results', () => {
    const result = fakeResult([{
      toolCalls: [{ toolCallId: 'tc1', toolName: 'read', args: {} }],
      toolResults: [{ toolCallId: 'tc1', result: 'data' }],
    }]);
    expect(extractPendingApprovals(result)).toEqual([]);
  });

  it('finds tool calls with no matching toolResult', () => {
    const result = fakeResult([{
      toolCalls: [{ toolCallId: 'tc1', toolName: 'delete', args: { id: 42 } }],
      toolResults: [],
    }]);
    const pending = extractPendingApprovals(result);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toEqual({
      toolCallId: 'tc1',
      toolName: 'delete',
      args: { id: 42 },
      stepNumber: 0,
    });
  });

  it('finds tool calls with undefined result', () => {
    const result = fakeResult([{
      toolCalls: [{ toolCallId: 'tc1', toolName: 'delete', args: {} }],
      toolResults: [{ toolCallId: 'tc1', result: undefined }],
    }]);
    expect(extractPendingApprovals(result)).toHaveLength(1);
  });

  it('finds multiple pending approvals across steps', () => {
    const result = fakeResult([
      {
        toolCalls: [{ toolCallId: 'tc1', toolName: 'read', args: {} }],
        toolResults: [{ toolCallId: 'tc1', result: 'ok' }],
      },
      {
        toolCalls: [
          { toolCallId: 'tc2', toolName: 'delete', args: {} },
          { toolCallId: 'tc3', toolName: 'sendEmail', args: {} },
        ],
        toolResults: [],
      },
    ]);
    const pending = extractPendingApprovals(result);
    expect(pending).toHaveLength(2);
    expect(pending[0]?.stepNumber).toBe(1);
    expect(pending[1]?.stepNumber).toBe(1);
  });

  it('reads args from toolCall.input as fallback', () => {
    const result = fakeResult([{
      toolCalls: [{ toolCallId: 'tc1', toolName: 'delete', input: { id: 99 } }],
      toolResults: [],
    }]);
    const pending = extractPendingApprovals(result);
    expect(pending[0]?.args).toEqual({ id: 99 });
  });
});

describe('createInterruptHandle', () => {
  it('returns an InterruptHandle with all required fields', () => {
    const pending = [{ toolCallId: 'tc1', toolName: 'delete', args: { id: 1 }, stepNumber: 0 }];
    const result = fakeResult([{
      toolCalls: [{ toolCallId: 'tc1', toolName: 'delete', args: { id: 1 } }],
      toolResults: [],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    }]);

    const handle = createInterruptHandle(result, pending);

    expect(handle.id).toBeDefined();
    expect(handle.createdAt).toBeDefined();
    expect(handle.messages).toEqual(result.response.messages);
    expect(handle.pendingApprovals).toEqual(pending);
    expect(handle.interruptedStepToolCalls).toEqual([{ toolCallId: 'tc1', toolName: 'delete', args: { id: 1 } }]);
    expect(handle.previousUsage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
  });

  it('messages is a deep clone', () => {
    const messages = [{ role: 'user', content: 'hello' }];
    const result = fakeResult([], messages);
    const handle = createInterruptHandle(result, []);
    messages[0].content = 'mutated';
    expect(handle.messages[0].content).toBe('hello');
  });

  it('handle is JSON-serializable', () => {
    const handle = createInterruptHandle(
      fakeResult([{ usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } }]),
      [{ toolCallId: 'tc1', toolName: 'x', args: {}, stepNumber: 0 }],
    );
    const roundtripped = JSON.parse(JSON.stringify(handle));
    expect(roundtripped.id).toBe(handle.id);
    expect(roundtripped.pendingApprovals).toEqual(handle.pendingApprovals);
  });

  it('previousUsage accumulates from all steps', () => {
    const result = fakeResult([
      { usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } },
      { usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 } },
    ]);
    const handle = createInterruptHandle(result, []);
    expect(handle.previousUsage).toEqual({ inputTokens: 300, outputTokens: 150, totalTokens: 450 });
  });
});

describe('resolveInterrupt', () => {
  const baseHandle = {
    id: 'test-id',
    createdAt: '2026-03-21T00:00:00Z',
    messages: [{ role: 'user', content: 'do it' }, { role: 'assistant', content: 'calling tool' }],
    pendingApprovals: [{ toolCallId: 'tc1', toolName: 'deleteFile', args: { path: '/tmp' }, stepNumber: 0 }],
    interruptedStepToolCalls: [{ toolCallId: 'tc1', toolName: 'deleteFile', args: { path: '/tmp' } }],
    previousUsage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
  };

  it('is a pure function (does not mutate handle)', () => {
    const original = JSON.parse(JSON.stringify(baseHandle));
    resolveInterrupt(baseHandle, [{ toolCallId: 'tc1', action: 'approve' }]);
    expect(baseHandle.messages).toHaveLength(2); // not mutated
    expect(baseHandle).toEqual(original);
  });

  it('returns { messages, previousUsage }', () => {
    const result = resolveInterrupt(baseHandle, [{ toolCallId: 'tc1', action: 'approve' }]);
    expect(result.messages).toBeDefined();
    expect(result.previousUsage).toBeDefined();
  });

  describe('approve', () => {
    it('appends tool message with [APPROVED] output', () => {
      const { messages } = resolveInterrupt(baseHandle, [{ toolCallId: 'tc1', action: 'approve' }]);
      expect(messages).toHaveLength(3);
      const toolMsg = messages[2];
      expect(toolMsg.role).toBe('tool');
      expect(toolMsg.content[0].output.value).toContain('[APPROVED]');
    });

    it('includes editedArgs in output when provided', () => {
      const { messages } = resolveInterrupt(baseHandle, [
        { toolCallId: 'tc1', action: 'approve', editedArgs: { path: '/home' } },
      ]);
      expect(messages[2].content[0].output.value).toContain('Args edited to');
      expect(messages[2].content[0].output.value).toContain('/home');
    });
  });

  describe('deny', () => {
    it('appends tool message with execution-denied output', () => {
      const { messages } = resolveInterrupt(baseHandle, [{ toolCallId: 'tc1', action: 'deny' }]);
      expect(messages[2].content[0].output.type).toBe('execution-denied');
      expect(messages[2].content[0].output.reason).toContain('denied');
    });

    it('missing decision treated as deny', () => {
      const { messages } = resolveInterrupt(baseHandle, []);
      expect(messages[2].content[0].output.type).toBe('execution-denied');
    });
  });

  describe('all-or-nothing', () => {
    const multiHandle = {
      ...baseHandle,
      pendingApprovals: [
        { toolCallId: 'tc1', toolName: 'deleteFile', args: { path: '/a' }, stepNumber: 0 },
        { toolCallId: 'tc2', toolName: 'sendEmail', args: { to: 'x' }, stepNumber: 0 },
      ],
      interruptedStepToolCalls: [
        { toolCallId: 'tc1', toolName: 'deleteFile', args: { path: '/a' } },
        { toolCallId: 'tc2', toolName: 'sendEmail', args: { to: 'x' } },
      ],
    };

    it('handles mix of approve and deny', () => {
      const { messages } = resolveInterrupt(multiHandle, [
        { toolCallId: 'tc1', action: 'approve' },
        { toolCallId: 'tc2', action: 'deny' },
      ]);
      const toolMsg = messages[2];
      expect(toolMsg.content).toHaveLength(2);
      expect(toolMsg.content[0].output.value).toContain('[APPROVED]');
      expect(toolMsg.content[1].output.type).toBe('execution-denied');
    });

    it('undecided approvals default to deny', () => {
      const { messages } = resolveInterrupt(multiHandle, [
        { toolCallId: 'tc1', action: 'approve' },
        // tc2 not in decisions → denied
      ]);
      expect(messages[2].content[1].output.type).toBe('execution-denied');
    });
  });

  describe('previousUsage', () => {
    it('returns previousUsage from handle', () => {
      const { previousUsage } = resolveInterrupt(baseHandle, []);
      expect(previousUsage).toEqual({ inputTokens: 500, outputTokens: 200, totalTokens: 700 });
    });

    it('previousUsage is a copy', () => {
      const { previousUsage } = resolveInterrupt(baseHandle, []);
      previousUsage.inputTokens = 999;
      expect(baseHandle.previousUsage.inputTokens).toBe(500);
    });
  });

  describe('round-trip', () => {
    it('create → serialize → deserialize → resolve → valid messages', () => {
      const result = fakeResult(
        [{ toolCalls: [{ toolCallId: 'tc1', toolName: 'delete', args: {} }], toolResults: [], usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } }],
        [{ role: 'user', content: 'clean up' }],
      );
      const pending = extractPendingApprovals(result);
      const handle = createInterruptHandle(result, pending);

      // Serialize to JSON and back (simulating KV storage)
      const restored = JSON.parse(JSON.stringify(handle));

      const { messages } = resolveInterrupt(restored, [{ toolCallId: 'tc1', action: 'approve' }]);

      expect(messages[0].role).toBe('user');
      expect(messages[messages.length - 1].role).toBe('tool');
      expect(messages[messages.length - 1].content[0].output.value).toContain('[APPROVED]');
    });
  });
});
