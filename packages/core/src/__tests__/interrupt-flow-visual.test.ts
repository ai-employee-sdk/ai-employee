/**
 * Visual integration test: Full interrupt round-trip with logs.
 * Run with: npx vitest run interrupt-flow-visual
 *
 * Shows the complete serverless agent flow step by step.
 */
import { describe, it, expect, vi } from 'vitest';
import { membrane } from '../membrane';
import { extractPendingApprovals, createInterruptHandle, resolveInterrupt } from '../interrupts';
import { createCostTracker, DEFAULT_MODEL_PRICING } from '../cost-tracker';
import { InMemoryStore } from '../in-memory-store';

// Pretty logger
const log = (label: string, data?: any) => {
  console.log(`\n${'━'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('━'.repeat(60));
  if (data !== undefined) {
    console.log(typeof data === 'string' ? `  ${data}` : JSON.stringify(data, null, 2));
  }
};

describe('🦞 Interrupt Flow — Visual Walkthrough', () => {
  it('Scenario: Cron agent at 3 AM wants to delete backups + send email', async () => {
    const store = new InMemoryStore();

    // ═══════════════════════════════════════════════════════
    // SETUP: Define tools and membrane
    // ═══════════════════════════════════════════════════════

    log('SETUP: Creating membrane with 4 tools');

    const m = membrane({
      tools: {
        checkStatus: {
          description: 'Check system status',
          execute: vi.fn(async () => 'All systems healthy'),
        },
        deleteBackups: {
          description: 'Delete old backups',
          execute: vi.fn(async ({ days }: any) => `Deleted backups older than ${days} days`),
        },
        sendReport: {
          description: 'Send maintenance report via email',
          execute: vi.fn(async ({ to }: any) => `Report sent to ${to}`),
        },
        addLabel: {
          description: 'Add a label to a resource',
          execute: vi.fn(async ({ label }: any) => `Label "${label}" added`),
        },
      } as any,
      tiers: {
        auto: ['checkStatus'],
        draft: ['addLabel'],
        confirm: ['deleteBackups', 'sendReport'],
      },
    });

    console.log('\n  Tools:');
    console.log('    checkStatus   → AUTO    (runs freely)');
    console.log('    addLabel      → DRAFT   (runs + logged)');
    console.log('    deleteBackups → CONFIRM (needs approval)');
    console.log('    sendReport    → CONFIRM (needs approval)');
    console.log(`\n  needsApproval on deleteBackups: ${(m.tools['deleteBackups'] as any).needsApproval}`);
    console.log(`  needsApproval on sendReport:    ${(m.tools['sendReport'] as any).needsApproval}`);
    console.log(`  execute on checkStatus:         ${typeof (m.tools['checkStatus'] as any).execute}`);

    // ═══════════════════════════════════════════════════════
    // COST TRACKER
    // ═══════════════════════════════════════════════════════

    const tracker = createCostTracker({
      budget: 0.50,
      pricing: DEFAULT_MODEL_PRICING,
    });

    // ═══════════════════════════════════════════════════════
    // RUN 1: Agent executes, hits CONFIRM on deleteBackups
    // ═══════════════════════════════════════════════════════

    log('3:00 AM — CRON FIRES: Agent starts running');

    // Simulate what generateText would produce:
    // Step 0: checkStatus (AUTO) → ran fine
    // Step 1: addLabel (DRAFT) → ran + logged
    // Step 2: deleteBackups (CONFIRM) → needsApproval → loop STOPS

    const fakeResult = {
      steps: [
        {
          toolCalls: [{ toolCallId: 'tc_1', toolName: 'checkStatus', args: {} }],
          toolResults: [{ toolCallId: 'tc_1', result: 'All systems healthy' }],
          usage: { inputTokens: 800, outputTokens: 200, totalTokens: 1000 },
        },
        {
          toolCalls: [{ toolCallId: 'tc_2', toolName: 'addLabel', args: { label: 'maintenance-checked' } }],
          toolResults: [{ toolCallId: 'tc_2', result: 'Label added' }],
          usage: { inputTokens: 600, outputTokens: 150, totalTokens: 750 },
        },
        {
          // This step has a tool call but NO result — needsApproval stopped execution
          toolCalls: [{ toolCallId: 'tc_3', toolName: 'deleteBackups', args: { days: 7 } }],
          toolResults: [],
          usage: { inputTokens: 500, outputTokens: 100, totalTokens: 600 },
        },
      ],
      text: 'I need to delete old backups.',
      // AI SDK v7: messages at result.response.messages
      response: {
        modelId: 'gpt-4o-mini',
        messages: [
          { role: 'user', content: 'Run nightly maintenance' },
          { role: 'assistant', content: 'Checking status...' },
          { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'tc_1', toolName: 'checkStatus', output: { type: 'text', value: 'All systems healthy' } }] },
          { role: 'assistant', content: 'Adding label and cleaning backups...' },
          { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'tc_2', toolName: 'addLabel', output: { type: 'text', value: 'Label added' } }] },
          { role: 'assistant', content: 'I need to delete backups older than 7 days.' },
        ],
      },
    };

    // Simulate onStepFinish for cost tracking
    for (const step of fakeResult.steps) {
      tracker.onStepFinish({ usage: step.usage, response: fakeResult.response });
    }

    // Log what happened
    console.log('\n  Step 0: checkStatus()        → AUTO    → ✅ Executed: "All systems healthy"');
    console.log('  Step 1: addLabel("maint...")  → DRAFT   → ✅ Executed + logged');
    console.log('  Step 2: deleteBackups({7})    → CONFIRM → ⏸️  STOPPED (needsApproval)');

    // Also log audit entries from the membrane
    m.onToolCallFinish({ toolCall: { toolName: 'checkStatus', args: {} }, success: true, output: 'healthy', stepNumber: 0 });
    m.onToolCallFinish({ toolCall: { toolName: 'addLabel', args: { label: 'x' } }, success: true, output: 'done', stepNumber: 1 });

    console.log(`\n  Audit log entries: ${m.auditLog.length}`);
    for (const entry of m.auditLog) {
      console.log(`    [${entry.tier}] ${entry.toolName} @ step ${entry.stepNumber}`);
    }

    // ═══════════════════════════════════════════════════════
    // DETECT: Extract pending approvals
    // ═══════════════════════════════════════════════════════

    log('DETECT: Checking for pending approvals');

    const pending = extractPendingApprovals(fakeResult);

    console.log(`\n  Found ${pending.length} pending approval(s):`);
    for (const p of pending) {
      console.log(`    Tool:    ${p.toolName}`);
      console.log(`    Args:    ${JSON.stringify(p.args)}`);
      console.log(`    Step:    ${p.stepNumber}`);
      console.log(`    CallID:  ${p.toolCallId}`);
    }

    expect(pending).toHaveLength(1);
    expect(pending[0]!.toolName).toBe('deleteBackups');

    // ═══════════════════════════════════════════════════════
    // SERIALIZE: Create interrupt handle
    // ═══════════════════════════════════════════════════════

    log('SERIALIZE: Creating interrupt handle');

    const handle = createInterruptHandle(fakeResult, pending);

    console.log(`\n  Handle ID:        ${handle.id}`);
    console.log(`  Created:          ${handle.createdAt}`);
    console.log(`  Messages:         ${handle.messages.length} messages preserved`);
    console.log(`  Pending:          ${handle.pendingApprovals.length} approval(s)`);
    console.log(`  Previous usage:   ${JSON.stringify(handle.previousUsage)}`);

    // ═══════════════════════════════════════════════════════
    // STORE: Save to KV (InMemoryStore simulating Vercel KV)
    // ═══════════════════════════════════════════════════════

    log('STORE: Saving handle to KV');

    await store.set(`interrupt:${handle.id}`, handle, 86400_000); // 24h TTL
    const storeSize = store.size;

    console.log(`\n  Key:     interrupt:${handle.id}`);
    console.log(`  TTL:     24 hours`);
    console.log(`  Store:   ${storeSize} item(s)`);

    // ═══════════════════════════════════════════════════════
    // NOTIFY: What Slack would show
    // ═══════════════════════════════════════════════════════

    log('NOTIFY: Slack message posted');
    console.log(`
  ┌──────────────────────────────────────────────────┐
  │ 🚨 Approval needed: deleteBackups               │
  │                                                  │
  │ \`\`\`                                              │
  │ {                                                │
  │   "days": 7                                      │
  │ }                                                │
  │ \`\`\`                                              │
  │                                                  │
  │ [✅ Approve]  [❌ Deny]                           │
  └──────────────────────────────────────────────────┘`);

    const costSnap = tracker.snapshot();
    console.log(`\n  Cost so far: $${costSnap.totalCostUsd.toFixed(6)}`);
    console.log(`  Budget:      $${costSnap.remainingUsd.toFixed(6)} remaining`);
    console.log(`  Function exits. No state in memory. ✅`);

    // ═══════════════════════════════════════════════════════
    // ... 6 HOURS PASS ...
    // ═══════════════════════════════════════════════════════

    log('⏰ 6 HOURS PASS — No compute, no tokens, no cost');

    // ═══════════════════════════════════════════════════════
    // 9:00 AM: Human clicks Approve (with edited args!)
    // ═══════════════════════════════════════════════════════

    log('9:00 AM — HUMAN RESPONDS: Approve with edit (30 days instead of 7)');

    // Load handle from store (new serverless invocation)
    const loaded = await store.get<typeof handle>(`interrupt:${handle.id}`);
    expect(loaded).not.toBeNull();

    console.log(`\n  Loaded handle: ${loaded!.id}`);
    console.log(`  Original args: ${JSON.stringify(loaded!.pendingApprovals[0]!.args)}`);
    console.log(`  Edited args:   { "days": 30 }`);

    // ═══════════════════════════════════════════════════════
    // RESOLVE: Build messages for resumed generateText
    // ═══════════════════════════════════════════════════════

    log('RESOLVE: Building messages for agent resume');

    const { messages, previousUsage } = resolveInterrupt(loaded!, [
      {
        toolCallId: 'tc_3',
        action: 'approve',
        editedArgs: { days: 30 }, // Human changed 7 → 30
      },
    ]);

    console.log(`\n  Messages in array: ${messages.length}`);
    console.log(`  Last message role: ${messages[messages.length - 1].role}`);

    const toolMsg = messages[messages.length - 1];
    console.log(`  Tool result:`);
    console.log(`    ${toolMsg.content[0].output.value}`);

    console.log(`\n  Previous usage carried forward: ${JSON.stringify(previousUsage)}`);

    expect(toolMsg.content[0].output.value).toContain('[APPROVED]');
    expect(toolMsg.content[0].output.value).toContain('"days":30');

    // ═══════════════════════════════════════════════════════
    // CLEANUP: Delete handle (idempotency)
    // ═══════════════════════════════════════════════════════

    log('CLEANUP: Delete handle from store (idempotency)');

    await store.delete(`interrupt:${loaded!.id}`);
    const afterDelete = await store.get(`interrupt:${loaded!.id}`);

    console.log(`\n  Handle deleted: ${afterDelete === null ? 'yes ✅' : 'no ❌'}`);
    console.log(`  Store size:     ${store.size} items`);
    console.log(`  Second webhook retry would get null → bail ✅`);

    // ═══════════════════════════════════════════════════════
    // RESUME: generateText would be called with these messages
    // ═══════════════════════════════════════════════════════

    log('RESUME: Agent continues with edited args');
    console.log(`
  generateText({
    model: openai('gpt-4o-mini'),
    tools: m.tools,
    messages: [...${messages.length} messages including approval...],
    maxSteps: 10,
  })

  → Agent sees: "deleteBackups approved with { days: 30 }"
  → Agent continues: maybe calls sendReport → another CONFIRM → cycle repeats
  → Or agent finishes: "Maintenance complete. Deleted backups >30 days old."

  ═══════════════════════════════════════════════════════════
  ✅ FULL CYCLE COMPLETE
  ═══════════════════════════════════════════════════════════

  Timeline:
    3:00 AM  │ Cron fires
             │ Step 0: checkStatus   (AUTO)    → ✅ ran
             │ Step 1: addLabel      (DRAFT)   → ✅ ran + logged
             │ Step 2: deleteBackups (CONFIRM) → ⏸️  stopped
             │ → Handle saved to KV
             │ → Slack notification sent
             │ → Function exited
             │
             │ ... 6 hours, $0.00 cost ...
             │
    9:00 AM  │ Human approves (edits days: 7 → 30)
             │ → Handle loaded from KV
             │ → resolveInterrupt built messages
             │ → Handle deleted (idempotency)
             │ → generateText called with approved messages
             │ → Agent resumes with corrected args ✅`);
  });
});
