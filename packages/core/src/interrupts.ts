import { randomUUID } from 'node:crypto';
import type {
  PendingApproval,
  InterruptHandle,
  InterruptDecision,
} from './types';

/**
 * Extracts pending approvals from a generateText result.
 *
 * A tool call is "pending" when:
 * 1. It exists in step.toolCalls
 * 2. There's no matching toolResult with a defined result
 *
 * This happens when needsApproval fires — AI SDK stops the loop,
 * leaving tool calls without results.
 */
export function extractPendingApprovals(result: any): PendingApproval[] {
  const pending: PendingApproval[] = [];

  if (!result?.steps) return pending;

  for (let i = 0; i < result.steps.length; i++) {
    const step = result.steps[i];
    if (!step?.toolCalls) continue;

    for (const toolCall of step.toolCalls) {
      const matchingResult = step.toolResults?.find(
        (r: any) => r.toolCallId === toolCall.toolCallId,
      );

      // Pending if no result or result is undefined
      if (!matchingResult || matchingResult.result === undefined) {
        pending.push({
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          args: toolCall.args ?? toolCall.input,
          stepNumber: i,
        });
      }
    }
  }

  return pending;
}

/**
 * Creates a serializable handle from a generateText result + pending approvals.
 *
 * The handle contains everything needed to resume the agent later.
 * It is pure JSON — safe for KV, database, or wire transmission.
 *
 * Captures cumulative usage for budget continuity across interrupt cycles.
 */
export function createInterruptHandle(
  result: any,
  pendingApprovals: PendingApproval[],
): InterruptHandle {
  const messages = result.messages ?? result.responseMessages ?? [];

  const interruptedStepToolCalls = pendingApprovals.map((p) => ({
    toolCallId: p.toolCallId,
    toolName: p.toolName,
    args: p.args,
  }));

  // Compute cumulative usage across all steps
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  if (result.steps) {
    for (const step of result.steps) {
      if (step.usage) {
        inputTokens += step.usage.inputTokens ?? 0;
        outputTokens += step.usage.outputTokens ?? 0;
        totalTokens += step.usage.totalTokens ?? 0;
      }
    }
  }

  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    messages: JSON.parse(JSON.stringify(messages)),
    pendingApprovals,
    interruptedStepToolCalls,
    previousUsage: { inputTokens, outputTokens, totalTokens },
  };
}

/**
 * Resolves an interrupt handle with human decisions.
 * PURE FUNCTION — no side effects.
 *
 * For each pending approval:
 * - 'approve': injects a tool-result message with [APPROVED] marker
 *   If editedArgs provided, includes them in the result
 * - 'deny': injects a tool-result message with [DENIED] marker
 *
 * All-or-nothing: decisions must cover ALL pending approvals.
 * Missing decisions are treated as deny.
 *
 * Returns { messages, previousUsage } ready to pass to generateText.
 */
export function resolveInterrupt(
  handle: InterruptHandle,
  decisions: InterruptDecision[],
): { messages: any[]; previousUsage: { inputTokens: number; outputTokens: number; totalTokens: number } } {
  const decisionMap = new Map(decisions.map((d) => [d.toolCallId, d]));
  const messages = structuredClone(handle.messages);

  const toolResults: any[] = [];

  for (const pending of handle.pendingApprovals) {
    const decision = decisionMap.get(pending.toolCallId);

    if (!decision || decision.action === 'deny') {
      toolResults.push({
        type: 'tool-result',
        toolCallId: pending.toolCallId,
        toolName: pending.toolName,
        result: `[DENIED] Tool call "${pending.toolName}" was denied by human reviewer.`,
      });
    } else {
      toolResults.push({
        type: 'tool-result',
        toolCallId: pending.toolCallId,
        toolName: pending.toolName,
        result: `[APPROVED] Tool "${pending.toolName}" approved.${
          decision.editedArgs
            ? ` Args edited to: ${JSON.stringify(decision.editedArgs)}`
            : ''
        }`,
        args: decision.editedArgs ?? pending.args,
        approved: true,
      });
    }
  }

  if (toolResults.length > 0) {
    messages.push({
      role: 'tool',
      content: toolResults,
    });
  }

  return {
    messages,
    previousUsage: { ...handle.previousUsage },
  };
}
