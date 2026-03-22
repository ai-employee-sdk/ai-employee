# @ai-employee-sdk/core

Composable autonomy primitives for the [Vercel AI SDK](https://ai-sdk.dev). A toolbox, not a framework.

Add permissions, cost tracking, and server-side interrupts to any `generateText()` call — without replacing your existing agent code.

> **Note:** This library requires AI SDK v7 (currently in beta). APIs may change as AI SDK v7 stabilizes.

## Install

```bash
npm install @ai-employee-sdk/core ai@latest
```

## Exports

| Export | What it does |
|--------|-------------|
| `membrane({ tools, tiers })` | 4-tier tool permissions (AUTO / DRAFT / CONFIRM / BLOCK) |
| `createCostTracker({ budget, pricing })` | Stateful USD cost tracking with per-model pricing |
| `extractPendingApprovals(result)` | Detect CONFIRM tools awaiting human approval |
| `createInterruptHandle(result, pending)` | Serialize agent state for KV storage |
| `resolveInterrupt(handle, decisions)` | Rebuild messages from approve/deny/edit decisions |
| `composePrepareStep(...fns)` | Merge N PrepareStepFunctions |
| `budgetExceeded(config)` | Stop condition for token/USD budgets |
| `tokenVelocityExceeded(config)` | Stop condition for token velocity |
| `createHeartbeat(config)` | Concurrency guard + circuit breaker for polling agents |
| `createMemoryPrepareStep(store, config)` | Inject memory snapshots into system prompt |
| `EmployeeAgent` | Convenience wrapper composing membrane + memory + heartbeat |
| `InMemoryStore` | Map-based MemoryStore for testing |
| `explainTier(toolName, config)` | Debug API — shows why a tool got its tier |
| `DEFAULT_MODEL_PRICING` | Pricing for 13 common models (GPT-4o, Claude, Gemini, etc.) |

## Quick Start

### Membrane — Tool Permissions

```typescript
import { generateText, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { membrane } from '@ai-employee-sdk/core';

const m = membrane({
  tools: { readFile, writeFile, deleteFile, sendEmail },
  tiers: {
    auto: ['readFile'],           // runs freely
    draft: ['writeFile'],         // runs + logged
    confirm: ['sendEmail'],       // needs human approval
    block: ['deleteFile'],        // never runs
  },
});

const result = await generateText({
  model: openai('gpt-4o-mini'),
  tools: m.tools,
  prepareStep: m.prepareStep,
  stopWhen: stepCountIs(10),
  prompt: 'Summarize the project and email the team.',
});

console.log(m.auditLog); // every tool call, all tiers
```

### Cost Tracking

```typescript
import { createCostTracker, DEFAULT_MODEL_PRICING } from '@ai-employee-sdk/core';

const tracker = createCostTracker({
  budget: 0.50, // USD
  pricing: DEFAULT_MODEL_PRICING,
});

const result = await generateText({
  model: openai('gpt-4o-mini'),
  tools: m.tools,
  onStepFinish: tracker.onStepFinish,
  stopWhen: [stepCountIs(20), tracker.stopCondition],
  prompt: 'Research this topic thoroughly.',
});

const snap = tracker.snapshot();
console.log(`Cost: $${snap.totalCostUsd.toFixed(4)}, remaining: $${snap.remainingUsd.toFixed(4)}`);
```

### Server-Side Interrupts

For agents that run on cron jobs, webhooks, or serverless functions — where there's no UI to show approval dialogs.

```typescript
import { generateText, stepCountIs } from 'ai';
import {
  extractPendingApprovals,
  createInterruptHandle,
  resolveInterrupt,
} from '@ai-employee-sdk/core';

// 1. Agent runs, hits a CONFIRM tool -> needsApproval stops the loop
const result = await generateText({ model, tools: m.tools, stopWhen: stepCountIs(10), prompt });

// 2. Check if any CONFIRM tools are waiting
const pending = extractPendingApprovals(result);

if (pending.length > 0) {
  // 3. Serialize state -> save to KV -> notify human (Slack, email, etc.)
  const handle = createInterruptHandle(result, pending, {
    originalMessages: [{ role: 'user', content: prompt }],
  });
  await kv.set(`interrupt:${handle.id}`, handle);
  await notifyHuman(pending); // your notification logic
  return; // function exits -- no compute cost while waiting
}

// ... hours later, human responds ...

// 4. Load handle, resolve decisions, resume agent
const handle = await kv.get(`interrupt:${handleId}`);
await kv.delete(`interrupt:${handleId}`); // idempotency: delete before execute

const { messages, previousUsage } = resolveInterrupt(handle, [
  { toolCallId: 'tc_3', action: 'approve', editedArgs: { days: 30 } },
]);

// 5. Resume with the approved messages
const resumed = await generateText({
  model,
  tools: m.tools,
  messages,
  stopWhen: stepCountIs(10),
});
```

## Tier System

| Tier | Behavior | Use for |
|------|----------|---------|
| `auto` | Runs freely, logged to auditLog | Read-only tools, lookups |
| `draft` | Runs + logged to auditLog | Low-risk writes, tagging |
| `confirm` | `needsApproval` — stops the loop | Destructive actions, sending messages |
| `block` | Tool removed from agent entirely | Dangerous tools you want to define but never allow |

Resolution order: explicit tiers > `resolve()` function > glob patterns > default (`'confirm'`).

```typescript
const m = membrane({
  tools,
  tiers: { auto: ['readFile'] },
  patterns: [
    { match: 'mcp_*', tier: 'confirm', description: 'All MCP tools need approval' },
  ],
  resolve: (name) => name.includes('admin') ? 'block' : undefined,
  default: 'confirm', // unknown tools require approval (secure by default)
});

// Debug why a tool got its tier
import { explainTier } from '@ai-employee-sdk/core';
const info = explainTier('mcp_slack_post', m);
// { tier: 'confirm', source: 'pattern', description: 'All MCP tools need approval', patternIndex: 0 }
```

## Types

All types are exported from `@ai-employee-sdk/core`:

```typescript
import type {
  Tier,
  TierPattern,
  TierResolution,
  MembraneConfig,
  MembraneResult,
  AuditEntry,
  MemoryStore,
  ModelPricing,
  CostTrackerConfig,
  CostSnapshot,
  CostTrackerResult,
  PendingApproval,
  InterruptDecision,
  InterruptHandle,
  BudgetConfig,
  VelocityConfig,
  HeartbeatConfig,
  HeartbeatResult,
  EmployeeAgentConfig,
} from '@ai-employee-sdk/core';
```

## License

Apache-2.0
