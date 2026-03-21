import { describe, it, expect } from 'vitest';
import { resolveTier, explainTier } from '../resolve-tier';
import type { MembraneConfig } from '../types';

describe('resolveTier', () => {
  it('returns confirm for unknown tool with empty config (secure by default)', () => {
    const config: MembraneConfig = {};
    expect(resolveTier('unknownTool', config)).toBe('confirm');
  });

  it('returns custom default tier when no match', () => {
    const config: MembraneConfig = { default: 'block' };
    expect(resolveTier('unknownTool', config)).toBe('block');
  });

  it('resolves explicit block tier', () => {
    const config: MembraneConfig = {
      tiers: { block: ['sudo', 'rm'] },
    };
    expect(resolveTier('sudo', config)).toBe('block');
    expect(resolveTier('rm', config)).toBe('block');
  });

  it('resolves explicit confirm tier', () => {
    const config: MembraneConfig = {
      tiers: { confirm: ['sendEmail'] },
    };
    expect(resolveTier('sendEmail', config)).toBe('confirm');
  });

  it('resolves explicit draft tier', () => {
    const config: MembraneConfig = {
      tiers: { draft: ['writeFile'] },
    };
    expect(resolveTier('writeFile', config)).toBe('draft');
  });

  it('resolves explicit auto tier', () => {
    const config: MembraneConfig = {
      tiers: { auto: ['readFile'] },
    };
    expect(resolveTier('readFile', config)).toBe('auto');
  });

  it('matches glob pattern "delete*" to block', () => {
    const config: MembraneConfig = {
      patterns: [{ match: 'delete*', tier: 'block' }],
    };
    expect(resolveTier('deleteFile', config)).toBe('block');
    expect(resolveTier('DeleteUser', config)).toBe('block');
  });

  it('matches glob pattern "*_dangerous" suffix', () => {
    const config: MembraneConfig = {
      patterns: [{ match: '*_dangerous', tier: 'block' }],
    };
    expect(resolveTier('rm_dangerous', config)).toBe('block');
    expect(resolveTier('readFile', config)).toBe('confirm'); // default
  });

  it('matches glob pattern "mcp_slack_*" prefix', () => {
    const config: MembraneConfig = {
      patterns: [{ match: 'mcp_slack_*', tier: 'confirm' }],
    };
    expect(resolveTier('mcp_slack_sendMessage', config)).toBe('confirm');
    expect(resolveTier('mcp_github_listPRs', config)).toBe('confirm'); // falls to default
  });

  it('matches glob pattern with wildcard in middle "*admin*"', () => {
    const config: MembraneConfig = {
      patterns: [{ match: '*admin*', tier: 'block' }],
    };
    expect(resolveTier('userAdminPanel', config)).toBe('block');
    expect(resolveTier('adminDelete', config)).toBe('block');
  });

  it('first matching pattern wins', () => {
    const config: MembraneConfig = {
      patterns: [
        { match: 'delete*', tier: 'block' },
        { match: 'delete*', tier: 'draft' },
      ],
    };
    expect(resolveTier('deleteFile', config)).toBe('block');
  });

  it('explicit tier overrides pattern', () => {
    const config: MembraneConfig = {
      tiers: { auto: ['deleteFile'] },
      patterns: [{ match: 'delete*', tier: 'block' }],
    };
    // Explicit tier checked first → 'auto' wins over pattern 'block'
    expect(resolveTier('deleteFile', config)).toBe('auto');
  });

  it('resolve function checked after explicit tiers, before patterns', () => {
    const config: MembraneConfig = {
      tiers: { auto: ['readFile'] },
      resolve: (name) => (name.startsWith('mcp_') ? 'confirm' : undefined),
      patterns: [{ match: 'mcp_*', tier: 'block' }],
    };
    // Explicit tier wins for readFile
    expect(resolveTier('readFile', config)).toBe('auto');
    // resolve() wins for mcp_ tools (before patterns)
    expect(resolveTier('mcp_slack_send', config)).toBe('confirm');
  });

  it('resolve function returning undefined falls through to patterns', () => {
    const config: MembraneConfig = {
      resolve: () => undefined,
      patterns: [{ match: 'delete*', tier: 'block' }],
    };
    expect(resolveTier('deleteFile', config)).toBe('block');
  });

  it('falls through to default when no pattern matches', () => {
    const config: MembraneConfig = {
      patterns: [{ match: 'delete*', tier: 'block' }],
      default: 'auto',
    };
    expect(resolveTier('readFile', config)).toBe('auto');
  });
});

describe('explainTier', () => {
  it('returns source: explicit for explicit tiers', () => {
    const config: MembraneConfig = { tiers: { block: ['sudo'] } };
    const result = explainTier('sudo', config);
    expect(result).toEqual({ tier: 'block', source: 'explicit' });
  });

  it('returns source: resolve for resolve function', () => {
    const config: MembraneConfig = {
      resolve: () => 'draft',
    };
    const result = explainTier('anything', config);
    expect(result).toEqual({ tier: 'draft', source: 'resolve' });
  });

  it('returns source: pattern with index and description', () => {
    const config: MembraneConfig = {
      patterns: [
        { match: 'mcp_*', tier: 'confirm', description: 'MCP tools need approval' },
      ],
    };
    const result = explainTier('mcp_slack_send', config);
    expect(result).toEqual({
      tier: 'confirm',
      source: 'pattern',
      description: 'MCP tools need approval',
      patternIndex: 0,
    });
  });

  it('returns source: default when nothing matches', () => {
    const config: MembraneConfig = {};
    const result = explainTier('unknown', config);
    expect(result).toEqual({ tier: 'confirm', source: 'default' });
  });

  it('returns custom default tier', () => {
    const config: MembraneConfig = { default: 'block' };
    const result = explainTier('unknown', config);
    expect(result).toEqual({ tier: 'block', source: 'default' });
  });
});
