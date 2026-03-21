import { describe, it, expect, vi } from 'vitest';
import { createAuditLogger } from '../audit';

describe('createAuditLogger', () => {
  it('returns expected shape', () => {
    const logger = createAuditLogger({});
    expect(typeof logger.onToolCallStart).toBe('function');
    expect(typeof logger.onToolCallFinish).toBe('function');
    expect(typeof logger.onStepFinish).toBe('function');
  });

  it('onToolCallStart calls config.onToolCall with tool name, input, stepNumber, timestamp', () => {
    const onToolCall = vi.fn();
    const logger = createAuditLogger({ onToolCall });

    logger.onToolCallStart({
      toolCall: { toolName: 'readFile', args: { path: '/tmp/x' } },
      stepNumber: 1,
    });

    expect(onToolCall).toHaveBeenCalledOnce();
    const call = onToolCall.mock.calls[0]![0];
    expect(call.toolName).toBe('readFile');
    expect(call.input).toEqual({ path: '/tmp/x' });
    expect(call.stepNumber).toBe(1);
    expect(typeof call.timestamp).toBe('number');
  });

  it('onToolCallFinish calls config.onToolCall with output and success when success=true', () => {
    const onToolCall = vi.fn();
    const logger = createAuditLogger({ onToolCall });

    logger.onToolCallFinish({
      toolCall: { toolName: 'writeFile', args: { path: '/tmp/out' } },
      stepNumber: 2,
      success: true,
      output: 'ok',
    });

    expect(onToolCall).toHaveBeenCalledOnce();
    const call = onToolCall.mock.calls[0]![0];
    expect(call.toolName).toBe('writeFile');
    expect(call.output).toBe('ok');
    expect(call.success).toBe(true);
  });

  it('onToolCallFinish marks success=false when success is false', () => {
    const onToolCall = vi.fn();
    const logger = createAuditLogger({ onToolCall });

    logger.onToolCallFinish({
      toolCall: { toolName: 'writeFile', args: {} },
      stepNumber: 3,
      success: false,
      error: new Error('disk full'),
    });

    const call = onToolCall.mock.calls[0]![0];
    expect(call.success).toBe(false);
  });

  it('onStepFinish calls config.onStep with stepNumber, finishReason, usage, timestamp', () => {
    const onStep = vi.fn();
    const logger = createAuditLogger({ onStep });

    logger.onStepFinish({
      stepNumber: 0,
      finishReason: 'tool-calls',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });

    expect(onStep).toHaveBeenCalledOnce();
    const call = onStep.mock.calls[0]![0];
    expect(call.stepNumber).toBe(0);
    expect(call.finishReason).toBe('tool-calls');
    expect(call.usage.totalTokens).toBe(150);
    expect(typeof call.timestamp).toBe('number');
  });

  it('does not throw when no callbacks configured', () => {
    const logger = createAuditLogger({});
    expect(() => {
      logger.onToolCallStart({ toolCall: { toolName: 'tool', args: {} }, stepNumber: 0 });
      logger.onToolCallFinish({ toolCall: { toolName: 'tool', args: {} }, stepNumber: 0, success: true });
      logger.onStepFinish({ stepNumber: 0, finishReason: 'stop', usage: {} });
    }).not.toThrow();
  });

  it('handles missing fields gracefully (defaults)', () => {
    const onToolCall = vi.fn();
    const onStep = vi.fn();
    const logger = createAuditLogger({ onToolCall, onStep });

    logger.onToolCallStart({ toolCall: {}, stepNumber: undefined });
    expect(onToolCall.mock.calls[0]![0].toolName).toBe('unknown');
    expect(onToolCall.mock.calls[0]![0].stepNumber).toBe(0);

    logger.onStepFinish({});
    expect(onStep.mock.calls[0]![0].stepNumber).toBe(0);
    expect(onStep.mock.calls[0]![0].finishReason).toBe('unknown');
  });
});
