import { describe, it, expect, vi } from 'vitest';
import { membrane } from '../membrane';
import type { LanguageModel } from 'ai';

const mockOptions = {
  steps: [],
  stepNumber: 0,
  model: {} as LanguageModel,
  messages: [],
  experimental_context: {},
};

describe('membrane', () => {
  describe('shape', () => {
    it('returns { tools, prepareStep, onToolCallFinish, auditLog }', () => {
      const m = membrane({ tools: {} });
      expect(m).toHaveProperty('tools');
      expect(typeof m.prepareStep).toBe('function');
      expect(typeof m.onToolCallFinish).toBe('function');
      expect(Array.isArray(m.auditLog)).toBe(true);
    });

    it('does NOT have wrapTools property', () => {
      const m = membrane({ tools: {} });
      expect(m).not.toHaveProperty('wrapTools');
    });
  });

  describe('tool wrapping', () => {
    it('BLOCK tool gets execute: undefined', () => {
      const m = membrane({
        tools: { sudo: { description: 'run sudo', execute: vi.fn() } },
        tiers: { block: ['sudo'] },
      });
      expect((m.tools['sudo'] as any)?.execute).toBeUndefined();
    });

    it('BLOCK tool removed from activeTools in prepareStep', () => {
      const m = membrane({
        tools: { sudo: { execute: vi.fn() }, readFile: { execute: vi.fn() } },
        tiers: { block: ['sudo'], auto: ['readFile'] },
      });
      const result = (m.prepareStep as any)(mockOptions);
      expect(result.activeTools).not.toContain('sudo');
      expect(result.activeTools).toContain('readFile');
    });

    it('CONFIRM tool gets needsApproval: true', () => {
      const m = membrane({
        tools: { sendEmail: { execute: vi.fn() } },
        tiers: { confirm: ['sendEmail'] },
      });
      expect((m.tools['sendEmail'] as any)?.needsApproval).toBe(true);
    });

    it('CONFIRM tool preserves existing needsApproval function', () => {
      const customApproval = vi.fn(() => true);
      const m = membrane({
        tools: { sendEmail: { execute: vi.fn(), needsApproval: customApproval } },
        tiers: { confirm: ['sendEmail'] },
      });
      expect((m.tools['sendEmail'] as any)?.needsApproval).toBe(customApproval);
    });

    it('DRAFT tool is unchanged (same reference)', () => {
      const execute = vi.fn();
      const m = membrane({
        tools: { writeFile: { execute } },
        tiers: { draft: ['writeFile'] },
      });
      expect((m.tools['writeFile'] as any)?.execute).toBe(execute);
    });

    it('AUTO tool is unchanged (same reference)', () => {
      const execute = vi.fn();
      const m = membrane({
        tools: { readFile: { execute } },
        tiers: { auto: ['readFile'] },
      });
      expect((m.tools['readFile'] as any)?.execute).toBe(execute);
      expect((m.tools['readFile'] as any)?.needsApproval).toBeUndefined();
    });

    it('default tier (confirm) applied to unlisted tools', () => {
      const execute = vi.fn();
      const m = membrane({ tools: { unknownTool: { execute } } });
      expect((m.tools['unknownTool'] as any)?.needsApproval).toBe(true);
      expect((m.tools['unknownTool'] as any)?.execute).toBe(execute);
    });

    it('custom default: auto makes all unknown tools AUTO', () => {
      const execute = vi.fn();
      const m = membrane({ tools: { toolA: { execute } }, default: 'auto' });
      expect((m.tools['toolA'] as any)?.needsApproval).toBeUndefined();
      expect((m.tools['toolA'] as any)?.execute).toBe(execute);
    });

    it('glob patterns are respected', () => {
      const m = membrane({
        tools: { deleteFile: { execute: vi.fn() }, readFile: { execute: vi.fn() } },
        patterns: [{ match: 'delete*', tier: 'block' }],
        default: 'auto',
      });
      expect((m.tools['deleteFile'] as any)?.execute).toBeUndefined();
      expect((m.tools['readFile'] as any)?.execute).toBeDefined();
    });

    it('explicit tier overrides pattern', () => {
      const m = membrane({
        tools: { deleteFile: { execute: vi.fn() } },
        tiers: { auto: ['deleteFile'] },
        patterns: [{ match: 'delete*', tier: 'block' }],
      });
      expect((m.tools['deleteFile'] as any)?.execute).toBeDefined();
    });
  });

  describe('prepareStep', () => {
    it('injects __membrane into experimental_context', () => {
      const m = membrane({
        tools: { sudo: { execute: vi.fn() } },
        tiers: { block: ['sudo'] },
      });
      const result = (m.prepareStep as any)(mockOptions);
      expect(result.experimental_context.__membrane).toBeDefined();
      expect(result.experimental_context.__membrane.tierMap).toBeDefined();
      expect(result.experimental_context.__membrane.draftTools).toBeDefined();
    });

    it('preserves existing experimental_context', () => {
      const m = membrane({ tools: { a: { execute: vi.fn() } }, default: 'auto' });
      const result = (m.prepareStep as any)({
        ...mockOptions,
        experimental_context: { existing: 'data' },
      });
      expect(result.experimental_context.existing).toBe('data');
      expect(result.experimental_context.__membrane).toBeDefined();
    });

    it('never throws (no wrapTools guard)', () => {
      const m = membrane({ tools: {} });
      expect(() => (m.prepareStep as any)(mockOptions)).not.toThrow();
    });
  });

  describe('auditLog — all tiers', () => {
    it('AUTO tool call logged with tier: auto', () => {
      const m = membrane({
        tools: { readFile: { execute: vi.fn() } },
        tiers: { auto: ['readFile'] },
      });
      m.onToolCallFinish({
        toolCall: { toolName: 'readFile', args: {} },
        success: true,
        output: 'data',
        stepNumber: 0,
      });
      expect(m.auditLog).toHaveLength(1);
      expect(m.auditLog[0]?.tier).toBe('auto');
      expect(m.auditLog[0]?.blocked).toBeUndefined();
    });

    it('DRAFT tool call logged with tier: draft', () => {
      const m = membrane({
        tools: { writeFile: { execute: vi.fn() } },
        tiers: { draft: ['writeFile'] },
      });
      m.onToolCallFinish({
        toolCall: { toolName: 'writeFile', args: { path: '/tmp' } },
        success: true,
        output: 'ok',
        stepNumber: 1,
      });
      expect(m.auditLog).toHaveLength(1);
      expect(m.auditLog[0]?.tier).toBe('draft');
      expect(m.auditLog[0]?.input).toEqual({ path: '/tmp' });
    });

    it('CONFIRM tool call logged with tier: confirm', () => {
      const m = membrane({
        tools: { sendEmail: { execute: vi.fn() } },
        tiers: { confirm: ['sendEmail'] },
      });
      m.onToolCallFinish({
        toolCall: { toolName: 'sendEmail', args: {} },
        success: true,
        output: 'sent',
        stepNumber: 2,
      });
      expect(m.auditLog).toHaveLength(1);
      expect(m.auditLog[0]?.tier).toBe('confirm');
    });

    it('BLOCK tool call logged with tier: block, blocked: true', () => {
      const m = membrane({
        tools: { sudo: { execute: vi.fn() } },
        tiers: { block: ['sudo'] },
      });
      m.onToolCallFinish({
        toolCall: { toolName: 'sudo', args: {} },
        success: false,
        stepNumber: 3,
      });
      expect(m.auditLog).toHaveLength(1);
      expect(m.auditLog[0]?.tier).toBe('block');
      expect(m.auditLog[0]?.blocked).toBe(true);
      expect(m.auditLog[0]?.output).toBeUndefined();
    });

    it('caps auditLog at 1000 entries', () => {
      const m = membrane({
        tools: { tool: { execute: vi.fn() } },
        tiers: { auto: ['tool'] },
      });
      for (let i = 0; i < 1005; i++) {
        m.onToolCallFinish({
          toolCall: { toolName: 'tool', args: {} },
          success: true,
          output: i,
          stepNumber: i,
        });
      }
      expect(m.auditLog.length).toBe(1000);
    });
  });
});
