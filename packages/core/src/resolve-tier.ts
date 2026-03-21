import type { Tier, MembraneConfig, TierResolution } from './types';

/**
 * Converts a glob pattern string to a RegExp.
 * Supports '*' at start and/or end: 'mcp_*', '*_dangerous', '*admin*', 'exactName'.
 */
function globToRegExp(pattern: string): RegExp {
  // Escape regex special chars except *
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  // Replace * with .*
  const regexStr = '^' + escaped.replace(/\*/g, '.*') + '$';
  return new RegExp(regexStr, 'i');
}

/**
 * Resolves a tool name to its tier.
 * Order: explicit tiers → resolve function → pattern matching → default tier.
 */
export function resolveTier(
  toolName: string,
  config: MembraneConfig,
): Tier {
  return explainTier(toolName, config).tier;
}

/**
 * Resolves a tool name to its tier with full explanation.
 * Useful for debugging — tells you WHY a tool got a specific tier.
 *
 * Resolution order: explicit tiers → resolve() → patterns (first match) → default.
 */
export function explainTier(
  toolName: string,
  config: MembraneConfig,
): TierResolution {
  // 1. Check explicit tiers
  if (config.tiers) {
    for (const [tier, tools] of Object.entries(config.tiers)) {
      if (tools?.includes(toolName)) {
        return { tier: tier as Tier, source: 'explicit' };
      }
    }
  }

  // 2. Check custom resolve function
  if (config.resolve) {
    const resolved = config.resolve(toolName);
    if (resolved !== undefined) {
      return { tier: resolved, source: 'resolve' };
    }
  }

  // 3. Check patterns (first match wins)
  if (config.patterns) {
    for (let i = 0; i < config.patterns.length; i++) {
      const pattern = config.patterns[i]!;
      const regex = globToRegExp(pattern.match);
      if (regex.test(toolName)) {
        return {
          tier: pattern.tier,
          source: 'pattern',
          description: pattern.description,
          patternIndex: i,
        };
      }
    }
  }

  // 4. Fall back to default (confirm = secure by default)
  return { tier: config.default ?? 'confirm', source: 'default' };
}
