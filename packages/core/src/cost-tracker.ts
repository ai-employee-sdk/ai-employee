import type { CostTrackerConfig, CostTrackerResult, CostSnapshot, ModelPricing } from './types';

/**
 * Default pricing for common models.
 * Prices as of March 2025 — verify before production use.
 */
export const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  'gpt-4o': { inputPerMToken: 2.50, outputPerMToken: 10.00 },
  'gpt-4o-mini': { inputPerMToken: 0.15, outputPerMToken: 0.60 },
  'gpt-4.1': { inputPerMToken: 2.00, outputPerMToken: 8.00 },
  'gpt-4.1-mini': { inputPerMToken: 0.40, outputPerMToken: 1.60 },
  'gpt-4.1-nano': { inputPerMToken: 0.10, outputPerMToken: 0.40 },
  'o3': { inputPerMToken: 2.00, outputPerMToken: 8.00, reasoningPerMToken: 12.00 },
  'o3-mini': { inputPerMToken: 1.10, outputPerMToken: 4.40, reasoningPerMToken: 4.40 },
  'o4-mini': { inputPerMToken: 1.10, outputPerMToken: 4.40, reasoningPerMToken: 4.40 },
  // Anthropic
  'claude-sonnet-4-20250514': {
    inputPerMToken: 3.00,
    outputPerMToken: 15.00,
    cachedInputPerMToken: 0.30,
  },
  'claude-3-5-haiku-20241022': {
    inputPerMToken: 0.80,
    outputPerMToken: 4.00,
    cachedInputPerMToken: 0.08,
  },
  // Google
  'gemini-2.5-pro': { inputPerMToken: 1.25, outputPerMToken: 10.00 },
  'gemini-2.5-flash': { inputPerMToken: 0.15, outputPerMToken: 0.60, reasoningPerMToken: 3.50 },
  'gemini-2.0-flash': { inputPerMToken: 0.10, outputPerMToken: 0.40 },
};

interface ModelAccumulator {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  costUsd: number;
}

interface TrackerState {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalReasoningTokens: number;
  totalCachedInputTokens: number;
  steps: number;
  byModel: Record<string, ModelAccumulator>;
}

function createEmptyState(): TrackerState {
  return {
    totalCostUsd: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalReasoningTokens: 0,
    totalCachedInputTokens: 0,
    steps: 0,
    byModel: {},
  };
}

/**
 * Creates a stateful cost tracker.
 *
 * Wire `onStepFinish` and `stopCondition` into generateText/streamText.
 * Share a single tracker across multiple agents for shared budget.
 * Call `snapshot()` for per-model breakdown and remaining budget.
 */
export function createCostTracker(config: CostTrackerConfig): CostTrackerResult {
  let state = createEmptyState();

  function onStepFinish(event: any) {
    const usage = event.usage;
    if (!usage) return;

    const modelId: string =
      event.response?.modelId ?? event.modelId ?? 'unknown';

    const inputTokens = usage.inputTokens ?? 0;
    const outputTokens = usage.outputTokens ?? 0;
    const reasoningTokens = usage.reasoningTokens ?? 0;
    const cachedInputTokens = usage.cachedInputTokens ?? 0;

    const pricing = config.pricing[modelId];
    let stepCost = 0;

    if (pricing) {
      stepCost =
        (inputTokens / 1_000_000) * pricing.inputPerMToken +
        (outputTokens / 1_000_000) * pricing.outputPerMToken +
        (reasoningTokens / 1_000_000) * (pricing.reasoningPerMToken ?? 0) +
        (cachedInputTokens / 1_000_000) *
          (pricing.cachedInputPerMToken ?? pricing.inputPerMToken);
    } else if (
      typeof globalThis !== 'undefined' &&
      (globalThis as any).process?.env?.['NODE_ENV'] !== 'production'
    ) {
      console.warn(
        `[ai-employee] CostTracker: no pricing for model "${modelId}". ` +
          'Cost not tracked for this step.',
      );
    }

    state.totalCostUsd += stepCost;
    state.totalInputTokens += inputTokens;
    state.totalOutputTokens += outputTokens;
    state.totalReasoningTokens += reasoningTokens;
    state.totalCachedInputTokens += cachedInputTokens;
    state.steps += 1;

    if (!state.byModel[modelId]) {
      state.byModel[modelId] = {
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        costUsd: 0,
      };
    }
    const m = state.byModel[modelId]!;
    m.inputTokens += inputTokens;
    m.outputTokens += outputTokens;
    m.reasoningTokens += reasoningTokens;
    m.cachedInputTokens += cachedInputTokens;
    m.costUsd += stepCost;
  }

  function stopCondition(_options: { steps: any[] }): boolean {
    return state.totalCostUsd >= config.budget;
  }

  function snapshot(): CostSnapshot {
    return {
      totalCostUsd: state.totalCostUsd,
      remainingUsd: config.budget - state.totalCostUsd,
      totalInputTokens: state.totalInputTokens,
      totalOutputTokens: state.totalOutputTokens,
      totalReasoningTokens: state.totalReasoningTokens,
      totalCachedInputTokens: state.totalCachedInputTokens,
      steps: state.steps,
      byModel: structuredClone(state.byModel),
      budgetExhausted: state.totalCostUsd >= config.budget,
    };
  }

  function reset() {
    state = createEmptyState();
  }

  return { onStepFinish, stopCondition, snapshot, reset };
}
