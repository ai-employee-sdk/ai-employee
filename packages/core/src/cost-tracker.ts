import type { CostTrackerConfig, CostTrackerResult, CostSnapshot, ModelPricing } from './types';

/**
 * Default pricing for 120+ models from the Vercel AI Gateway.
 * Prices as of March 2026 — verify before production use.
 * Source: https://ai-gateway.vercel.sh/v1/models
 */
export const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  // Alibaba
  'qwen-3-14b': { inputPerMToken: 0.12, outputPerMToken: 0.24 },
  'qwen-3-235b': { inputPerMToken: 0.07, outputPerMToken: 0.46 },
  'qwen-3-30b': { inputPerMToken: 0.08, outputPerMToken: 0.29 },
  'qwen-3-32b': { inputPerMToken: 0.29, outputPerMToken: 0.59, cachedInputPerMToken: 0.14 },
  'qwen3-coder': { inputPerMToken: 0.40, outputPerMToken: 1.60, cachedInputPerMToken: 0.02 },
  'qwen3-coder-plus': { inputPerMToken: 1.00, outputPerMToken: 5.00, cachedInputPerMToken: 0.20 },
  'qwen3-max': { inputPerMToken: 1.20, outputPerMToken: 6.00, cachedInputPerMToken: 0.24 },
  'qwen3.5-flash': { inputPerMToken: 0.10, outputPerMToken: 0.40 },
  'qwen3.5-plus': { inputPerMToken: 0.40, outputPerMToken: 2.40, cachedInputPerMToken: 0.04 },

  // Amazon
  'nova-2-lite': { inputPerMToken: 0.30, outputPerMToken: 2.50, cachedInputPerMToken: 0.07 },
  'nova-lite': { inputPerMToken: 0.06, outputPerMToken: 0.24 },
  'nova-micro': { inputPerMToken: 0.04, outputPerMToken: 0.14 },
  'nova-pro': { inputPerMToken: 0.80, outputPerMToken: 3.20 },

  // Anthropic
  'claude-3-haiku': { inputPerMToken: 0.25, outputPerMToken: 1.25, cachedInputPerMToken: 0.03 },
  'claude-3-opus': { inputPerMToken: 15.00, outputPerMToken: 75.00, cachedInputPerMToken: 1.50 },
  'claude-3.5-haiku': { inputPerMToken: 0.80, outputPerMToken: 4.00, cachedInputPerMToken: 0.08 },
  'claude-3.5-sonnet': { inputPerMToken: 3.00, outputPerMToken: 15.00, cachedInputPerMToken: 0.30 },
  'claude-3.7-sonnet': { inputPerMToken: 3.00, outputPerMToken: 15.00, cachedInputPerMToken: 0.30 },
  'claude-haiku-4.5': { inputPerMToken: 1.00, outputPerMToken: 5.00, cachedInputPerMToken: 0.10 },
  'claude-opus-4': { inputPerMToken: 15.00, outputPerMToken: 75.00, cachedInputPerMToken: 1.50 },
  'claude-opus-4.1': { inputPerMToken: 15.00, outputPerMToken: 75.00, cachedInputPerMToken: 1.50 },
  'claude-opus-4.5': { inputPerMToken: 5.00, outputPerMToken: 25.00, cachedInputPerMToken: 0.50 },
  'claude-opus-4.6': { inputPerMToken: 5.00, outputPerMToken: 25.00, cachedInputPerMToken: 0.50 },
  'claude-sonnet-4': { inputPerMToken: 3.00, outputPerMToken: 15.00, cachedInputPerMToken: 0.30 },
  'claude-sonnet-4.5': { inputPerMToken: 3.00, outputPerMToken: 15.00, cachedInputPerMToken: 0.30 },
  'claude-sonnet-4.6': { inputPerMToken: 3.00, outputPerMToken: 15.00, cachedInputPerMToken: 0.30 },

  // ByteDance
  'seed-1.6': { inputPerMToken: 0.25, outputPerMToken: 2.00, cachedInputPerMToken: 0.05 },
  'seed-1.8': { inputPerMToken: 0.25, outputPerMToken: 2.00, cachedInputPerMToken: 0.05 },

  // Cohere
  'command-a': { inputPerMToken: 2.50, outputPerMToken: 10.00 },

  // DeepSeek
  'deepseek-r1': { inputPerMToken: 1.35, outputPerMToken: 5.40 },
  'deepseek-v3': { inputPerMToken: 0.77, outputPerMToken: 0.77 },
  'deepseek-v3.1': { inputPerMToken: 0.50, outputPerMToken: 1.50 },
  'deepseek-v3.1-terminus': { inputPerMToken: 0.27, outputPerMToken: 1.00, cachedInputPerMToken: 0.14 },
  'deepseek-v3.2': { inputPerMToken: 0.28, outputPerMToken: 0.42, cachedInputPerMToken: 0.03 },
  'deepseek-v3.2-thinking': { inputPerMToken: 0.28, outputPerMToken: 0.42, cachedInputPerMToken: 0.03 },

  // Google
  'gemini-2.0-flash': { inputPerMToken: 0.15, outputPerMToken: 0.60, cachedInputPerMToken: 0.02 },
  'gemini-2.0-flash-lite': { inputPerMToken: 0.07, outputPerMToken: 0.30, cachedInputPerMToken: 0.02 },
  'gemini-2.5-flash': { inputPerMToken: 0.30, outputPerMToken: 2.50, cachedInputPerMToken: 0.03 },
  'gemini-2.5-flash-lite': { inputPerMToken: 0.10, outputPerMToken: 0.40, cachedInputPerMToken: 0.01 },
  'gemini-2.5-pro': { inputPerMToken: 1.25, outputPerMToken: 10.00, cachedInputPerMToken: 0.13 },
  'gemini-3-flash': { inputPerMToken: 0.50, outputPerMToken: 3.00, cachedInputPerMToken: 0.05 },
  'gemini-3-pro-preview': { inputPerMToken: 2.00, outputPerMToken: 12.00, cachedInputPerMToken: 0.20 },
  'gemini-3.1-pro-preview': { inputPerMToken: 2.00, outputPerMToken: 12.00, cachedInputPerMToken: 0.20 },

  // Inception
  'mercury-2': { inputPerMToken: 0.25, outputPerMToken: 0.75, cachedInputPerMToken: 0.02 },

  // Meta
  'llama-3.1-70b': { inputPerMToken: 0.72, outputPerMToken: 0.72 },
  'llama-3.1-8b': { inputPerMToken: 0.10, outputPerMToken: 0.10 },
  'llama-3.3-70b': { inputPerMToken: 0.72, outputPerMToken: 0.72 },
  'llama-4-maverick': { inputPerMToken: 0.24, outputPerMToken: 0.97 },
  'llama-4-scout': { inputPerMToken: 0.17, outputPerMToken: 0.66 },

  // Minimax
  'minimax-m2.7': { inputPerMToken: 0.30, outputPerMToken: 1.20, cachedInputPerMToken: 0.06 },

  // Mistral
  'codestral': { inputPerMToken: 0.30, outputPerMToken: 0.90 },
  'devstral-2': { inputPerMToken: 0.40, outputPerMToken: 2.00 },
  'devstral-small': { inputPerMToken: 0.10, outputPerMToken: 0.30 },
  'magistral-medium': { inputPerMToken: 2.00, outputPerMToken: 5.00 },
  'magistral-small': { inputPerMToken: 0.50, outputPerMToken: 1.50 },
  'mistral-large-3': { inputPerMToken: 0.50, outputPerMToken: 1.50 },
  'mistral-medium': { inputPerMToken: 0.40, outputPerMToken: 2.00 },
  'mistral-small': { inputPerMToken: 0.10, outputPerMToken: 0.30 },

  // Moonshot
  'kimi-k2': { inputPerMToken: 0.60, outputPerMToken: 2.50, cachedInputPerMToken: 0.15 },
  'kimi-k2.5': { inputPerMToken: 0.60, outputPerMToken: 3.00, cachedInputPerMToken: 0.10 },

  // Nvidia
  'nemotron-3-nano-30b-a3b': { inputPerMToken: 0.05, outputPerMToken: 0.24 },

  // OpenAI
  'gpt-3.5-turbo': { inputPerMToken: 0.50, outputPerMToken: 1.50 },
  'gpt-4-turbo': { inputPerMToken: 10.00, outputPerMToken: 30.00 },
  'gpt-4.1': { inputPerMToken: 2.00, outputPerMToken: 8.00, cachedInputPerMToken: 0.50 },
  'gpt-4.1-mini': { inputPerMToken: 0.40, outputPerMToken: 1.60, cachedInputPerMToken: 0.10 },
  'gpt-4.1-nano': { inputPerMToken: 0.10, outputPerMToken: 0.40, cachedInputPerMToken: 0.02 },
  'gpt-4o': { inputPerMToken: 2.50, outputPerMToken: 10.00, cachedInputPerMToken: 1.25 },
  'gpt-4o-mini': { inputPerMToken: 0.15, outputPerMToken: 0.60, cachedInputPerMToken: 0.07 },
  'gpt-5': { inputPerMToken: 1.25, outputPerMToken: 10.00, cachedInputPerMToken: 0.13 },
  'gpt-5-mini': { inputPerMToken: 0.25, outputPerMToken: 2.00, cachedInputPerMToken: 0.02 },
  'gpt-5-nano': { inputPerMToken: 0.05, outputPerMToken: 0.40, cachedInputPerMToken: 0.01 },
  'gpt-5-pro': { inputPerMToken: 15.00, outputPerMToken: 120.00 },
  'gpt-5.4': { inputPerMToken: 2.50, outputPerMToken: 15.00, cachedInputPerMToken: 0.25 },
  'gpt-5.4-mini': { inputPerMToken: 0.75, outputPerMToken: 4.50, cachedInputPerMToken: 0.07 },
  'gpt-5.4-nano': { inputPerMToken: 0.20, outputPerMToken: 1.25, cachedInputPerMToken: 0.02 },
  'gpt-5.4-pro': { inputPerMToken: 30.00, outputPerMToken: 180.00 },
  'o1': { inputPerMToken: 15.00, outputPerMToken: 60.00, cachedInputPerMToken: 7.50 },
  'o3': { inputPerMToken: 2.00, outputPerMToken: 8.00, cachedInputPerMToken: 0.50 },
  'o3-mini': { inputPerMToken: 1.10, outputPerMToken: 4.40, cachedInputPerMToken: 0.55 },
  'o3-pro': { inputPerMToken: 20.00, outputPerMToken: 80.00 },
  'o4-mini': { inputPerMToken: 1.10, outputPerMToken: 4.40, cachedInputPerMToken: 0.28 },

  // Perplexity
  'sonar': { inputPerMToken: 1.00, outputPerMToken: 1.00 },
  'sonar-pro': { inputPerMToken: 3.00, outputPerMToken: 15.00 },

  // xAI
  'grok-3': { inputPerMToken: 3.00, outputPerMToken: 15.00, cachedInputPerMToken: 0.75 },
  'grok-3-mini': { inputPerMToken: 0.30, outputPerMToken: 0.50, cachedInputPerMToken: 0.07 },
  'grok-4': { inputPerMToken: 3.00, outputPerMToken: 15.00, cachedInputPerMToken: 0.75 },
  'grok-4.1-fast-non-reasoning': { inputPerMToken: 0.20, outputPerMToken: 0.50, cachedInputPerMToken: 0.05 },
  'grok-4.1-fast-reasoning': { inputPerMToken: 0.20, outputPerMToken: 0.50, cachedInputPerMToken: 0.05 },
  'grok-code-fast-1': { inputPerMToken: 0.20, outputPerMToken: 1.50, cachedInputPerMToken: 0.02 },
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
