# AI Employee SDK

Composable autonomy primitives for the [Vercel AI SDK](https://ai-sdk.dev).

> The SDK gives you primitives. You build the employee.

Every AI agent framework wants to own your stack. AI Employee SDK takes the opposite approach: standalone functions that compose with raw `generateText()`. Need tool permissions? Import `membrane()`. Need cost tracking? Import `createCostTracker()`. Need to pause an agent for human approval and resume it hours later with zero compute cost? Import the interrupt primitives. Each one is a pure function. No base classes, no runtime, no lock-in. Built for the Vercel AI SDK, not around it.

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
- **Server-Side Interrupts** — Serialize agent state to KV, notify humans, resume hours later with zero compute cost
- **Heartbeat** — Concurrency guard + circuit breaker for always-on agents
- **Memory** — Inject persistent context into system prompts from any MemoryStore
- **EmployeeAgent** — Convenience wrapper that composes all primitives together

## Examples

See [`examples/slack-coworker`](examples/slack-coworker) for a full Slack bot with interrupt-based approval flow.

## Requirements

- Node.js >= 18
- AI SDK v7 (`ai` >= 7.0.0-beta.30)

## License

Apache-2.0
