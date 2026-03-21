import type { AuditLoggerConfig, AuditLoggerResult } from './types';

/**
 * Creates an audit logger that captures tool call and step events.
 *
 * Returns callbacks that plug into ToolLoopAgent's callback system:
 * - experimental_onToolCallStart
 * - experimental_onToolCallFinish
 * - onStepFinish
 */
export function createAuditLogger(config: AuditLoggerConfig): AuditLoggerResult {
  return {
    onToolCallStart: (event: any) => {
      config.onToolCall?.({
        toolName: event.toolCall?.toolName ?? 'unknown',
        input: event.toolCall?.args,
        stepNumber: event.stepNumber ?? 0,
        timestamp: Date.now(),
      });
    },

    onToolCallFinish: (event: any) => {
      // OnToolCallFinishEvent is a discriminated union:
      //   { success: true, output } | { success: false, error }
      config.onToolCall?.({
        toolName: event.toolCall?.toolName ?? 'unknown',
        input: event.toolCall?.args,
        stepNumber: event.stepNumber ?? 0,
        timestamp: Date.now(),
        ...(event.success === true ? { output: event.output, success: true } : { success: false }),
      } as any);
    },

    onStepFinish: (event: any) => {
      config.onStep?.({
        stepNumber: event.stepNumber ?? 0,
        finishReason: event.finishReason ?? 'unknown',
        usage: event.usage ?? {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
        timestamp: Date.now(),
      });
    },
  };
}
