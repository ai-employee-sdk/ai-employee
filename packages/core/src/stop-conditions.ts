import type { BudgetConfig, VelocityConfig } from './types';

/**
 * Stop condition that fires when the total token or USD budget is exceeded.
 *
 * Supports two cost modes:
 * 1. Flat rate: costPerInputToken + costPerOutputToken (v0.1 API)
 * 2. Pricing map: per-model pricing keyed by modelId from step.response (v0.2)
 *
 * When pricing map is set and step has modelId, pricing map takes precedence.
 * Falls back to flat rate when modelId is missing or not in pricing map.
 */
export function budgetExceeded(config: BudgetConfig) {
  return ({
    steps,
  }: {
    steps: Array<{
      usage: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
        reasoningTokens?: number;
      };
      response?: { modelId?: string };
    }>;
  }) => {
    let totalTokens = 0;
    let totalCost = 0;

    for (const step of steps) {
      if (!step.usage) continue;

      const input = step.usage.inputTokens ?? 0;
      const output = step.usage.outputTokens ?? 0;
      const reasoning = step.usage.reasoningTokens ?? 0;
      totalTokens += step.usage.totalTokens ?? (input + output);

      if (config.maxCostUsd !== undefined) {
        const modelId = step.response?.modelId;

        if (config.pricing && modelId && config.pricing[modelId]) {
          // Per-model pricing (v0.2)
          const p = config.pricing[modelId]!;
          totalCost +=
            (input / 1_000_000) * p.inputPerMToken +
            (output / 1_000_000) * p.outputPerMToken +
            (reasoning / 1_000_000) * (p.reasoningPerMToken ?? 0);
        } else {
          // Flat rate fallback (v0.1)
          totalCost +=
            input * (config.costPerInputToken ?? 0) +
            output * (config.costPerOutputToken ?? 0);
        }
      }
    }

    if (config.maxTokens !== undefined && totalTokens >= config.maxTokens) {
      return true;
    }

    if (config.maxCostUsd !== undefined && totalCost >= config.maxCostUsd) {
      return true;
    }

    return false;
  };
}

/**
 * Stop condition that fires when average tokens per step exceeds threshold.
 * Detects runaway loops where the agent generates increasingly verbose output.
 */
export function tokenVelocityExceeded(config: VelocityConfig) {
  return ({ steps }: { steps: Array<{ usage: { totalTokens?: number } }> }) => {
    if (steps.length === 0) return false;

    const window = config.windowSize ? steps.slice(-config.windowSize) : steps;

    const totalTokens = window.reduce(
      (sum, step) => sum + (step.usage?.totalTokens ?? 0),
      0,
    );
    const avg = totalTokens / window.length;

    return avg > config.maxAvgPerStep;
  };
}
