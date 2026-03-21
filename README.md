# AI Employee

Composable autonomy primitives for the [Vercel AI SDK](https://ai-sdk.dev). Add permissions, cost tracking, and server-side interrupts to any `generateText()` call.

This is a toolbox, not a framework. Each primitive is a standalone function that composes with raw AI SDK — no wrappers, no lock-in.

## Packages

| Package | Description |
|---------|-------------|
| [`@ai-employee-sdk/core`](packages/core) | Membrane permissions, cost tracker, interrupts, heartbeat, memory |

## Quick Start

```bash
npm install @ai-employee-sdk/core ai@latest
```

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { membrane, createCostTracker, DEFAULT_MODEL_PRICING } from '@ai-employee-sdk/core';

// 1. Wrap tools with 4-tier permissions
const m = membrane({
  tools: { readFile, writeFile, sendEmail, deleteDB },
  tiers: {
    auto: ['readFile'],        // runs freely
    draft: ['writeFile'],      // runs + audited
    confirm: ['sendEmail'],    // needs human approval
    block: ['deleteDB'],       // never runs
  },
});

// 2. Track costs per model
const tracker = createCostTracker({
  budget: 1.00,
  pricing: DEFAULT_MODEL_PRICING,
});

// 3. Use with standard generateText
const result = await generateText({
  model: openai('gpt-4o-mini'),
  tools: m.tools,
  prepareStep: m.prepareStep,
  onStepFinish: tracker.onStepFinish,
  stopWhen: tracker.stopCondition,
  maxSteps: 20,
  prompt: 'Summarize the project and email the team.',
});

console.log(m.auditLog);          // what the agent did
console.log(tracker.snapshot());  // what it cost
```

## Key Features

- **Membrane** — 4-tier tool permissions (auto/draft/confirm/block) with glob patterns and custom resolvers
- **Cost Tracker** — Real-time USD tracking per model with shared budgets across agents
- **Server-Side Interrupts** — Serialize agent state to KV, notify humans, resume hours later
- **Heartbeat** — Concurrency guard + circuit breaker for always-on agents
- **Memory** — Inject persistent context into system prompts from any MemoryStore
- **EmployeeAgent** — Convenience wrapper that composes all primitives together

## Examples

See [`examples/slack-coworker`](examples/slack-coworker) for a full Slack bot with interrupt-based approval flow.

## Requirements

- Node.js >= 18
- AI SDK v7 (`ai` >= 7.0.0-beta.0)

## License

Apache-2.0
