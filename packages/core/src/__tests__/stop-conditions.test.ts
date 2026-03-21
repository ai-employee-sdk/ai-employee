import { describe, it, expect } from 'vitest';
import { budgetExceeded, tokenVelocityExceeded } from '../stop-conditions';

function makeStep(
  totalTokens: number,
  inputTokens = 0,
  outputTokens = 0,
) {
  return { usage: { totalTokens, inputTokens, outputTokens } };
}

describe('budgetExceeded', () => {
  it('returns a function', () => {
    const fn = budgetExceeded({ maxTokens: 1000 });
    expect(typeof fn).toBe('function');
  });

  it('returns false when no steps', () => {
    const fn = budgetExceeded({ maxTokens: 1000 });
    expect(fn({ steps: [] })).toBe(false);
  });

  it('returns false when under token budget', () => {
    const fn = budgetExceeded({ maxTokens: 1000 });
    expect(fn({ steps: [makeStep(500), makeStep(400)] })).toBe(false);
  });

  it('returns true when at token budget', () => {
    const fn = budgetExceeded({ maxTokens: 1000 });
    expect(fn({ steps: [makeStep(500), makeStep(500)] })).toBe(true);
  });

  it('returns true when over token budget', () => {
    const fn = budgetExceeded({ maxTokens: 1000 });
    expect(fn({ steps: [makeStep(1001)] })).toBe(true);
  });

  it('returns false when no budget config set', () => {
    const fn = budgetExceeded({});
    expect(fn({ steps: [makeStep(999999)] })).toBe(false);
  });

  it('returns false when under USD budget', () => {
    const fn = budgetExceeded({
      maxCostUsd: 0.01,
      costPerInputToken: 0.000001,
      costPerOutputToken: 0.000002,
    });
    // 100 input * 0.000001 + 100 output * 0.000002 = 0.0001 + 0.0002 = 0.0003
    const steps = [{ usage: { inputTokens: 100, outputTokens: 100, totalTokens: 200 } }];
    expect(fn({ steps })).toBe(false);
  });

  it('returns true when at USD budget', () => {
    const fn = budgetExceeded({
      maxCostUsd: 0.01,
      costPerInputToken: 0.00001,
      costPerOutputToken: 0,
    });
    // 1000 input * 0.00001 = 0.01
    const steps = [{ usage: { inputTokens: 1000, outputTokens: 0, totalTokens: 1000 } }];
    expect(fn({ steps })).toBe(true);
  });

  it('accumulates tokens across multiple steps', () => {
    const fn = budgetExceeded({ maxTokens: 100 });
    const steps = [makeStep(40), makeStep(40), makeStep(40)];
    expect(fn({ steps })).toBe(true);
  });

  it('handles missing usage gracefully', () => {
    const fn = budgetExceeded({ maxTokens: 100 });
    const steps = [{ usage: {} } as any, makeStep(50)];
    expect(fn({ steps })).toBe(false);
  });
});

describe('tokenVelocityExceeded', () => {
  it('returns a function', () => {
    const fn = tokenVelocityExceeded({ maxAvgPerStep: 500 });
    expect(typeof fn).toBe('function');
  });

  it('returns false when no steps', () => {
    const fn = tokenVelocityExceeded({ maxAvgPerStep: 500 });
    expect(fn({ steps: [] })).toBe(false);
  });

  it('returns false when avg under threshold', () => {
    const fn = tokenVelocityExceeded({ maxAvgPerStep: 500 });
    expect(fn({ steps: [makeStep(400), makeStep(400)] })).toBe(false);
  });

  it('returns true when avg over threshold', () => {
    const fn = tokenVelocityExceeded({ maxAvgPerStep: 500 });
    expect(fn({ steps: [makeStep(600), makeStep(600)] })).toBe(true);
  });

  it('returns false when avg equals threshold (not strictly greater)', () => {
    const fn = tokenVelocityExceeded({ maxAvgPerStep: 500 });
    expect(fn({ steps: [makeStep(500)] })).toBe(false);
  });

  it('uses windowSize to limit steps considered', () => {
    const fn = tokenVelocityExceeded({ maxAvgPerStep: 500, windowSize: 2 });
    // Last 2 steps: 600, 600 → avg 600 > 500 → true
    // Earlier steps are ignored
    const steps = [makeStep(100), makeStep(100), makeStep(600), makeStep(600)];
    expect(fn({ steps })).toBe(true);
  });

  it('windowSize larger than steps uses all steps', () => {
    const fn = tokenVelocityExceeded({ maxAvgPerStep: 500, windowSize: 10 });
    expect(fn({ steps: [makeStep(400), makeStep(400)] })).toBe(false);
  });

  it('single step: fires when that step is over threshold', () => {
    const fn = tokenVelocityExceeded({ maxAvgPerStep: 100 });
    expect(fn({ steps: [makeStep(200)] })).toBe(true);
  });
});
