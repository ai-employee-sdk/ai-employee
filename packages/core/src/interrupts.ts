import { randomUUID } from 'node:crypto';
import type {
  PendingApproval,
  InterruptHandle,
  InterruptDecision,
} from './types';

/**
 * Extracts pending approvals from a generateText result.
 *
 * A tool call is "pending" when it exists in step content or toolCalls
 * but has no matching tool result. This happens when needsApproval
 * stops the agentic loop.
 *
 * Reads from step.content (AI SDK v7) or step.toolCalls (legacy).
 */
export function extractPendingApprovals(result: any): PendingApproval[] {
  const pending: PendingApproval[] = [];

  if (!result?.steps) return pending;

  for (let i = 0; i < result.steps.length; i++) {
    const step = result.steps[i];

    // AI SDK v7: check step.content for tool-approval-request parts
    if (step?.content) {
      const approvalRequests = step.content.filter(
        (part: any) => part.type === 'tool-approval-request',
      );

      for (const req of approvalRequests) {
        const toolCall = req.toolCall ?? step.content.find(
          (p: any) => p.type === 'tool-call' && p.toolCallId === req.toolCallId,
        );
        if (toolCall) {
          pending.push({
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            args: toolCall.input ?? toolCall.args,
            stepNumber: i,
          });
        }
      }

      if (approvalRequests.length > 0) continue;
    }

    // Fallback: check toolCalls/toolResults
    if (!step?.toolCalls) continue;

    for (const toolCall of step.toolCalls) {
      const matchingResult = step.toolResults?.find(
        (r: any) => r.toolCallId === toolCall.toolCallId,
      );

      const hasOutput = matchingResult && (matchingResult.output !== undefined || matchingResult.result !== undefined);
      if (!hasOutput) {
        pending.push({
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          args: toolCall.input ?? toolCall.args,
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
 *
 * @param result - The generateText result
 * @param pendingApprovals - Pending approvals from extractPendingApprovals
 * @param options - Optional: original input messages/prompt to include in handle
 */
export function createInterruptHandle(
  result: any,
  pendingApprovals: PendingApproval[],
  options?: { originalMessages?: any[] },
): InterruptHandle {
  // AI SDK v7: result.response.messages (response only, no user prompt)
  // Older: result.messages or result.responseMessages
  const responseMessages = result.response?.messages ?? result.messages ?? result.responseMessages ?? [];

  // Prepend original input messages if provided (so the handle is self-contained)
  const messages = [
    ...(options?.originalMessages ?? []),
    ...responseMessages,
  ];

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
 * - 'approve': injects a tool-result with the approval marker
 * - 'deny': injects a tool-result with execution-denied output
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
        output: {
          type: 'execution-denied',
          reason: `Tool "${pending.toolName}" was denied by human reviewer.`,
        },
      });
    } else {
      toolResults.push({
        type: 'tool-result',
        toolCallId: pending.toolCallId,
        toolName: pending.toolName,
        output: {
          type: 'text',
          value: `[APPROVED] Tool "${pending.toolName}" executed successfully.${
            decision.editedArgs
              ? ` Args edited to: ${JSON.stringify(decision.editedArgs)}`
              : ''
          }`,
        },
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
