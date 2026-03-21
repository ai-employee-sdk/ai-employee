import type { MembraneConfig, MembraneResult, AuditEntry, Tier } from './types';
import { resolveTier } from './resolve-tier';

const MAX_AUDIT_LOG = 1000;

/**
 * Creates a membrane — a 4-tier permission system for AI SDK tools.
 *
 * Returns { tools, prepareStep, onToolCallFinish, auditLog }.
 *
 * - tools: wrapped with tier permissions applied
 *   - BLOCK → execute: undefined (belt + suspenders with activeTools filter)
 *   - CONFIRM → needsApproval: true
 *   - DRAFT → tracked for audit
 *   - AUTO → unchanged
 * - prepareStep: removes BLOCK-tier tools from activeTools
 * - onToolCallFinish: logs ALL tier executions to auditLog
 * - auditLog: array of all logged actions
 */
export function membrane<TOOLS extends Record<string, any>>(
  config: MembraneConfig<TOOLS>,
): MembraneResult<TOOLS> {
  const auditLog: AuditEntry[] = [];
  const draftTools = new Set<string>();
  const tierMap = new Map<string, Tier>();

  // Pre-compute tier map for all explicitly listed tools
  if (config.tiers) {
    for (const [tier, tools] of Object.entries(config.tiers)) {
      for (const tool of tools ?? []) {
        tierMap.set(tool, tier as Tier);
      }
    }
  }

  function getTier(toolName: string): Tier {
    if (tierMap.has(toolName)) return tierMap.get(toolName)!;
    const tier = resolveTier(toolName, config);
    tierMap.set(toolName, tier);
    return tier;
  }

  // --- Wrap tools immediately ---
  const wrapped: Record<string, any> = {};

  for (const [name, tool] of Object.entries(config.tools)) {
    const tier = getTier(name);
    switch (tier) {
      case 'block':
        wrapped[name] = { ...tool, execute: undefined };
        break;
      case 'confirm':
        wrapped[name] = {
          ...tool,
          needsApproval: (tool as any).needsApproval ?? true,
        };
        break;
      case 'draft':
        draftTools.add(name);
        wrapped[name] = tool;
        break;
      case 'auto':
      default:
        wrapped[name] = tool;
        break;
    }
  }

  // activeToolNames computed immediately — no lazy guard needed
  const activeToolNames = Object.keys(config.tools).filter(
    (name) => getTier(name) !== 'block',
  );

  // --- prepareStep ---
  function prepareStep(options: {
    steps: any[];
    stepNumber: number;
    model: any;
    messages: any[];
    experimental_context: unknown;
  }) {
    const prevContext =
      (options.experimental_context as Record<string, any>) ?? {};

    return {
      experimental_context: {
        ...prevContext,
        __membrane: {
          tierMap: Object.fromEntries(tierMap),
          draftTools: Array.from(draftTools),
        },
      },
      activeTools: activeToolNames,
    };
  }

  // --- onToolCallFinish (ALL tiers) ---
  function onToolCallFinish(event: {
    toolCall: { toolName: string; args: unknown };
    success?: boolean;
    output?: unknown;
    error?: unknown;
    stepNumber: number;
  }) {
    const tier = getTier(event.toolCall.toolName);

    if (auditLog.length >= MAX_AUDIT_LOG) {
      auditLog.shift();
    }

    auditLog.push({
      timestamp: Date.now(),
      toolName: event.toolCall.toolName,
      input: event.toolCall.args,
      output: event.success ? event.output : undefined,
      tier,
      blocked: tier === 'block' ? true : undefined,
      stepNumber: event.stepNumber,
    });
  }

  return {
    tools: wrapped as TOOLS,
    prepareStep: prepareStep as import('ai').PrepareStepFunction,
    onToolCallFinish,
    auditLog,
  };
}
