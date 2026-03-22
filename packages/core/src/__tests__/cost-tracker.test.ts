import { describe, it, expect, vi } from 'vitest';
import { createCostTracker, DEFAULT_MODEL_PRICING } from '../cost-tracker';

function stepEvent(
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    cachedInputTokens?: number;
  },
  modelId = 'gpt-4o',
) {
  return {
    usage,
    response: { modelId },
    stepNumber: 0,
    finishReason: 'tool-calls',
  };
}

describe('createCostTracker', () => {
  describe('onStepFinish', () => {
    it('accumulates input/output tokens', () => {
      const t = createCostTracker({ budget: 1, pricing: { 'gpt-4o': { inputPerMToken: 2.50, outputPerMToken: 10 } } });
      t.onStepFinish(stepEvent({ inputTokens: 1000, outputTokens: 500 }));
      t.onStepFinish(stepEvent({ inputTokens: 2000, outputTokens: 1000 }));
      const s = t.snapshot();
      expect(s.totalInputTokens).toBe(3000);
      expect(s.totalOutputTokens).toBe(1500);
      expect(s.steps).toBe(2);
    });

    it('computes cost using pricing map', () => {
      const t = createCostTracker({ budget: 100, pricing: { 'gpt-4o': { inputPerMToken: 2.50, outputPerMToken: 10 } } });
      t.onStepFinish(stepEvent({ inputTokens: 1_000_000, outputTokens: 1_000_000 }));
      expect(t.snapshot().totalCostUsd).toBeCloseTo(12.50, 4);
    });

    it('reads modelId from event.response.modelId', () => {
      const t = createCostTracker({ budget: 1, pricing: { 'custom-model': { inputPerMToken: 5, outputPerMToken: 20 } } });
      t.onStepFinish(stepEvent({ inputTokens: 1_000_000, outputTokens: 0 }, 'custom-model'));
      expect(t.snapshot().totalCostUsd).toBeCloseTo(5, 4);
    });

    it('tracks reasoning tokens separately', () => {
      const t = createCostTracker({ budget: 100, pricing: { 'o3': { inputPerMToken: 2, outputPerMToken: 8, reasoningPerMToken: 12 } } });
      t.onStepFinish(stepEvent({ inputTokens: 0, outputTokens: 1_000_000, reasoningTokens: 600_000 }, 'o3'));
      // output: 1M * $8/M = $8, reasoning: 600K * $12/M = $7.20
      expect(t.snapshot().totalCostUsd).toBeCloseTo(15.20, 2);
      expect(t.snapshot().totalReasoningTokens).toBe(600_000);
    });

    it('tracks cached input tokens', () => {
      const t = createCostTracker({ budget: 100, pricing: { 'claude': { inputPerMToken: 3, outputPerMToken: 15, cachedInputPerMToken: 0.30 } } });
      t.onStepFinish(stepEvent({ inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 800_000 }, 'claude'));
      // input: 1M * $3/M = $3, cached: 800K * $0.30/M = $0.24
      expect(t.snapshot().totalCostUsd).toBeCloseTo(3.24, 4);
      expect(t.snapshot().totalCachedInputTokens).toBe(800_000);
    });

    it('no-ops when event.usage is undefined', () => {
      const t = createCostTracker({ budget: 1, pricing: {} });
      t.onStepFinish({ stepNumber: 0 });
      expect(t.snapshot().steps).toBe(0);
    });
  });

  describe('stopCondition', () => {
    it('returns false when under budget', () => {
      const t = createCostTracker({ budget: 1, pricing: { 'gpt-4o': { inputPerMToken: 2.50, outputPerMToken: 10 } } });
      t.onStepFinish(stepEvent({ inputTokens: 100, outputTokens: 0 }));
      expect(t.stopCondition({ steps: [] })).toBe(false);
    });

    it('returns true when at/over budget', () => {
      const t = createCostTracker({ budget: 0.01, pricing: { 'gpt-4o': { inputPerMToken: 10, outputPerMToken: 30 } } });
      t.onStepFinish(stepEvent({ inputTokens: 1000, outputTokens: 0 }));
      expect(t.stopCondition({ steps: [] })).toBe(true);
    });
  });

  describe('snapshot', () => {
    it('byModel breaks down by model ID', () => {
      const t = createCostTracker({
        budget: 100,
        pricing: {
          'gpt-4o': { inputPerMToken: 2.50, outputPerMToken: 10 },
          'claude': { inputPerMToken: 3, outputPerMToken: 15 },
        },
      });
      t.onStepFinish(stepEvent({ inputTokens: 1000, outputTokens: 500 }, 'gpt-4o'));
      t.onStepFinish(stepEvent({ inputTokens: 2000, outputTokens: 1000 }, 'claude'));
      const s = t.snapshot();
      expect(s.byModel['gpt-4o']?.inputTokens).toBe(1000);
      expect(s.byModel['claude']?.inputTokens).toBe(2000);
    });

    it('byModel is a deep copy', () => {
      const t = createCostTracker({ budget: 1, pricing: { 'gpt-4o': { inputPerMToken: 2.50, outputPerMToken: 10 } } });
      t.onStepFinish(stepEvent({ inputTokens: 100, outputTokens: 0 }));
      const s1 = t.snapshot();
      t.onStepFinish(stepEvent({ inputTokens: 200, outputTokens: 0 }));
      const s2 = t.snapshot();
      expect(s1.byModel['gpt-4o']?.inputTokens).toBe(100);
      expect(s2.byModel['gpt-4o']?.inputTokens).toBe(300);
    });

    it('remainingUsd can be negative', () => {
      const t = createCostTracker({ budget: 0.001, pricing: { 'gpt-4o': { inputPerMToken: 10, outputPerMToken: 30 } } });
      t.onStepFinish(stepEvent({ inputTokens: 10000, outputTokens: 0 }));
      expect(t.snapshot().remainingUsd).toBeLessThan(0);
    });
  });

  describe('reset', () => {
    it('resets all accumulators', () => {
      const t = createCostTracker({ budget: 1, pricing: { 'gpt-4o': { inputPerMToken: 2.50, outputPerMToken: 10 } } });
      t.onStepFinish(stepEvent({ inputTokens: 1000, outputTokens: 500 }));
      t.reset();
      const s = t.snapshot();
      expect(s.totalCostUsd).toBe(0);
      expect(s.totalInputTokens).toBe(0);
      expect(s.steps).toBe(0);
      expect(Object.keys(s.byModel)).toHaveLength(0);
    });
  });

  describe('shared budget', () => {
    it('two agents accumulate into same tracker', () => {
      const t = createCostTracker({
        budget: 0.10,
        pricing: {
          'gpt-4o': { inputPerMToken: 2.50, outputPerMToken: 10 },
          'claude': { inputPerMToken: 3, outputPerMToken: 15 },
        },
      });
      t.onStepFinish(stepEvent({ inputTokens: 10_000, outputTokens: 5_000 }, 'gpt-4o'));
      t.onStepFinish(stepEvent({ inputTokens: 10_000, outputTokens: 5_000 }, 'claude'));
      expect(t.snapshot().steps).toBe(2);
      expect(Object.keys(t.snapshot().byModel)).toHaveLength(2);
      expect(t.stopCondition({ steps: [] })).toBe(true);
    });
  });

  describe('DEFAULT_MODEL_PRICING', () => {
    it('includes common models', () => {
      expect(DEFAULT_MODEL_PRICING['gpt-4o']).toBeDefined();
      expect(DEFAULT_MODEL_PRICING['gpt-4o-mini']).toBeDefined();
      expect(DEFAULT_MODEL_PRICING['claude-sonnet-4']).toBeDefined();
      expect(DEFAULT_MODEL_PRICING['gemini-2.5-pro']).toBeDefined();
    });

    it('every entry has inputPerMToken and outputPerMToken', () => {
      for (const [, pricing] of Object.entries(DEFAULT_MODEL_PRICING)) {
        expect(pricing.inputPerMToken).toBeGreaterThan(0);
        expect(pricing.outputPerMToken).toBeGreaterThan(0);
      }
    });
  });
});
