# Session Handoff — AI Employee SDK v0.2.0 (Session 2)
### Continue from here in the next session

*Session date: 2026-03-21 (Saturday, ~12 AM - 5:45 AM PKT)*
*Previous sessions: `docs/research/tmp/session-handoff-ai-employee-1.md`*
*Status: v0.2.0 fully built. 215 tests passing. 6 new features. Slack coworker example updated with interrupt flow. Not yet pushed to GitHub or published to npm.*

---

## What This Session Was About

This session took the AI Employee SDK from v0.1.0 (membrane, heartbeat, memory, budget) to v0.2.0 by adding three major features: CostTracker (stateful USD tracking per model), Rich Interrupts (server-side agent approval flow for CONFIRM tools), and InMemoryStore (testing utility). We also fixed the membrane API (tools as input, no more `wrapTools` ordering dependency) and made the audit log track all 4 tiers instead of just DRAFT.

The session began with Lars Grammel (expert agent) reviewing the v0.1 membrane implementation. He identified 3 ship-blockers (wrapTools ordering footgun, regex global flag bug, MCP dynamic tools limitation) which we fixed — changing TierPattern from `RegExp` to string globs, adding a `resolve()` function escape hatch, and changing the default tier from `'auto'` to `'confirm'` (secure by default). We also added `explainTier()` debug API and `TierResolution` type.

Then we did deep research: cloned 12 new repos (Eliza, LangGraph.js, KaibanJS, TypedAI, AI Legion, CopilotKit, Langfuse, Inferable, Inngest, agent-inbox, CashClaw, OpenAgentsControl) into `~/Documents/Code/ai-employee-research/` and compared against our SDK. Found 6 systems we were missing: agent-to-agent comms, rich interrupts, agent identity, tool profiles, durable execution, cost tracking. After consulting Lars and Guillermo (Vercel CEO agent), we narrowed to 3 features both agreed on + 3 improvements.

Multiple rounds of expert review refined the interrupt design from a full InterruptStore/InterruptHandle/resume() system down to 3 pure functions: `extractPendingApprovals`, `createInterruptHandle`, `resolveInterrupt`. Key insight: server-side agents die after hitting CONFIRM (serverless timeout), state must be serialized to KV, human responds hours later via webhook, a NEW function invocation loads state and resumes. The SDK handles serialization + message reconstruction; user handles storage + transport.

## What We Decided

### 1. Membrane API: tools as input (breaking change)
`membrane({ tools, tiers })` replaces `membrane(config)` + `m.wrapTools(tools)`. Eliminates the temporal coupling footgun. The throw guard is gone — `activeToolNames` is always populated.
**Why:** Lars identified that `wrapTools` must be called before `prepareStep` as a design smell. Moving tools into the constructor makes it impossible to get wrong.

### 2. AuditLog: log all tiers
`onToolCallFinish` now logs AUTO, DRAFT, CONFIRM, and BLOCK tool calls. Added `blocked?: boolean` to `AuditEntry` for BLOCK tier (tool requested but never executed).
**Why:** An audit log that only captures one tier (DRAFT) is misleading. Users asking "what did the agent do?" need the full picture.

### 3. Default tier: 'auto' → 'confirm' (from earlier fix)
Unknown tools default to `'confirm'` (needsApproval). Changed from `'auto'` which was too permissive for a safety SDK.
**Why:** Lars argued MCP tools appearing dynamically should require approval, not run freely.

### 4. TierPattern: RegExp → string globs (from earlier fix)
Patterns use simple glob strings (`'mcp_*'`, `'*_dangerous'`) instead of RegExp. Added `description?: string` field.
**Why:** RegExp doesn't serialize to JSON, has global flag footgun, and is overkill for prefix matching.

### 5. CostTracker: separate stateful primitive
`createCostTracker({ budget, pricing })` returns `{ onStepFinish, stopCondition, snapshot, reset }`. NOT merged into `budgetExceeded`.
**Why:** Lars initially suggested merging, then walked it back after analyzing AI SDK source — a stop condition is a predicate (`boolean`), it can't provide `snapshot()`, shared budgets, or O(1) accumulation.

### 6. budgetExceeded: extended with pricing map
Added `pricing?: Record<string, ModelPricing>` to `BudgetConfig`. Reads `step.response.modelId` for per-model cost. Backward compatible.
**Why:** Simple single-agent guard that doesn't need the full CostTracker.

### 7. Interrupts: 3 functions, no framework opinions
- `extractPendingApprovals(result)` — detects CONFIRM tools in generateText result
- `createInterruptHandle(result, pending)` — serializes state to plain JSON
- `resolveInterrupt(handle, decisions)` — PURE function, rebuilds messages with approve/deny/edit
**Why:** Server-side agents die after hitting CONFIRM. No InterruptStore (user picks storage). No loop helper (15 lines of user code). No defer (v0.3). All-or-nothing per step. Idempotency is user's problem (delete-before-execute).

### 8. InMemoryStore: testing utility
Map-based, lazy TTL, `clear()` for test teardown. Implements `MemoryStore` interface.
**Why:** Lars said this is "more useful than memoizeTool, composeCallbacks, and CostTracker combined" for adoption.

### 9. What we did NOT build (and why)
- **Agent-to-agent comms** — "agent as tool" is 5 lines. Document, don't ship.
- **Agent identity** — application-level config. `instructions` is the integration point.
- **Tool profiles** — glob patterns already handle most cases.
- **memoizeTool** — agents rarely call same tool with same args. Caching belongs in tool implementation.
- **composeCallbacks** — one-liner. Internal util only, not exported.
- **Defer** — needs full InterruptStore lifecycle (expiry, cleanup, pending queries). v0.3.

### 10. Slack coworker updated for v0.2
Replaced `EmployeeAgent` with raw `generateText` + `membrane()` + `createCostTracker`. Added full interrupt flow: agent hits CONFIRM → post Slack buttons → approve/deny handlers → `resolveInterrupt` → resume. Handles chained interrupts (agent hits another CONFIRM after resume).

## What Changed in the Codebase

### New files
| File | What |
|------|------|
| `packages/core/src/in-memory-store.ts` | `InMemoryStore` class |
| `packages/core/src/cost-tracker.ts` | `createCostTracker()`, `DEFAULT_MODEL_PRICING` (13 models) |
| `packages/core/src/interrupts.ts` | `extractPendingApprovals`, `createInterruptHandle`, `resolveInterrupt` |
| `packages/core/src/__tests__/in-memory-store.test.ts` | 15 tests |
| `packages/core/src/__tests__/cost-tracker.test.ts` | 15 tests |
| `packages/core/src/__tests__/interrupts.test.ts` | 22 tests |
| `packages/core/src/__tests__/interrupt-flow.test.ts` | 9 integration tests |
| `packages/core/src/__tests__/interrupt-flow-visual.test.ts` | 1 visual walkthrough test with full logs |
| `docs/v0.2.0-implementation-plan.md` | Complete implementation blueprint (rewritten twice) |

### Modified files
| File | What changed |
|------|-------------|
| `packages/core/src/types.ts` | `MembraneConfig<TOOLS>` + `tools` field. `MembraneResult<TOOLS>` + `tools` property (no `wrapTools`). `AuditEntry` + `blocked?`. `EmployeeAgentConfig.membrane` → `Omit<MembraneConfig, 'tools'>`. Added: `ModelPricing`, `CostTrackerConfig`, `CostSnapshot`, `CostTrackerResult`, `PendingApproval`, `InterruptDecision`, `InterruptHandle`. |
| `packages/core/src/membrane.ts` | Full rewrite: tools wrapped in constructor, `wrapTools` removed, throw guard removed, `onToolCallFinish` logs ALL tiers with `blocked` flag. |
| `packages/core/src/employee-agent.ts` | Constructor: `membrane({ ...config.membrane, tools })` + `this._membrane.tools as TOOLS`. |
| `packages/core/src/stop-conditions.ts` | `budgetExceeded`: added pricing map lookup with `step.response.modelId`, reasoning token support. Backward compatible. |
| `packages/core/src/resolve-tier.ts` | (Earlier fix) `globToRegExp()`, `explainTier()` export, `resolve()` function support, default → `'confirm'`. |
| `packages/core/src/index.ts` | Added 6 runtime exports + 8 type exports. |
| `packages/core/src/__tests__/membrane.test.ts` | Full rewrite for new API (tools in config). |
| `packages/core/src/__tests__/resolve-tier.test.ts` | (Earlier) Added glob, resolve function, explainTier tests. |
| `packages/core/src/__tests__/integration.test.ts` | Updated membrane tests from `wrapTools` to `tools` in config. Updated audit test (now logs all tiers). |
| `examples/slack-coworker/src/lib/ai/agent.ts` | Replaced `EmployeeAgent` with raw `generateText` + `membrane()` + `createCostTracker`. Added `runCoworker()` and `resumeCoworker()` functions. |
| `examples/slack-coworker/src/lib/bolt/listeners.ts` | Added interrupt handling: `extractPendingApprovals` → Slack buttons → `interrupt_approve`/`interrupt_deny` action handlers → `resolveInterrupt` → resume. Handles chained interrupts. |
| `examples/slack-coworker/src/lib/store.ts` | Added `InMemoryStore` as fallback option. |
| `examples/slack-coworker/package.json` | Added `@aiemployee/core`, `store-file`, `store-kv` as workspace deps. Bumped to v0.2.0. |

## What Was NOT Done Yet

1. **GitHub repo not created** — `progrmoiz/ai-employee` needs `gh repo create` + push
2. **npm not published** — `@aiemployee/core`, `@aiemployee/store-file`, `@aiemployee/store-kv`
3. **LICENSE file** — Apache-2.0 decided, file not created
4. **Root README** — no README at repo root
5. **Update remaining 10 examples** — `examples/01-*` through `examples/10-*` still use old `wrapTools` API
6. **CI/CD** — no GitHub Actions for test + build
7. **CONFIRM tier e2e test with real model** — `needsApproval` flow verified in unit tests but not with actual LLM
8. **Slack coworker not tested live** — code builds conceptually but no Slack app created/connected
9. **HN launch post not written**
10. **Tweet thread not drafted**
11. **@aiemployee npm scope** — renamed from `@ai-employee` (not available). Verify `@aiemployee` is available.

## Research Conducted

### Repos cloned this session (12 new, in `~/Documents/Code/ai-employee-research/`)
- `elizaOS/eliza` (17.8K stars) — full autonomous agent platform, Character type, tool policies, task scheduling
- `TrafficGuard/typedai` (1.2K) — budget tracking, checkpoint system, OpenTelemetry
- `eumemic/ai-legion` (1.4K) — agent-to-agent message bus, task queues
- `moltlaunch/cashclaw` (732) — heartbeat, personality config
- `darrenhinde/OpenAgentsControl` (2.9K) — plan-first agent framework

### Pattern repos (in `~/Documents/Code/ai-employee-patterns/`)
- `langchain-ai/langgraphjs` (2.7K) — state machine graphs, interrupt/resume, supervisor handoff
- `kaiban-ai/KaibanJS` (1.4K) — Team > Agent > Task orchestration
- `inferablehq/inferable` (438) — durable workflows, memo/result caching
- `langchain-ai/agent-inbox` (951) — HITL UI, HumanInterrupt types
- `inngest/inngest-js` (892) — durable step functions, middleware
- `CopilotKit/CopilotKit` (29.6K) — AG-UI protocol
- `langfuse/langfuse` (23.5K) — LLM observability, trace/span modeling

### Key findings
1. Every competitor has agent identity (Character type). We skipped it — `instructions` is sufficient.
2. LangGraph's `interrupt()` + agent-inbox's approve/edit/respond is the gold standard for approval UX. We adapted it for serverless (serialize → store → die → resume).
3. TypedAI has the richest cost tracking (per-call via AsyncLocalStorage). We chose explicit passing over magic globals.
4. AI SDK's `needsApproval` returns `toolApprovalRequests` — the SDK does NOT deep-clone messages, does NOT hash-check tool call args, does NOT re-validate against `inputSchema` when executing approved calls. This means editing args via message mutation works.
5. `collectToolApprovals` in AI SDK source reads tool calls FROM messages by `toolCallId`. Mutating `toolCall.input` in the message before re-calling `generateText` causes the SDK to execute with edited args. This is the key trick for the "edit args" flow.

## Current State of Key Files

| File | Status |
|------|--------|
| `packages/core/src/types.ts` | Complete — all v0.2 types added |
| `packages/core/src/membrane.ts` | Complete — rewritten for v0.2 API |
| `packages/core/src/cost-tracker.ts` | Complete — new file |
| `packages/core/src/interrupts.ts` | Complete — new file |
| `packages/core/src/in-memory-store.ts` | Complete — new file |
| `packages/core/src/stop-conditions.ts` | Complete — extended with pricing map |
| `packages/core/src/index.ts` | Complete — all exports added |
| `packages/core/src/employee-agent.ts` | Complete — adapted for new membrane API |
| `examples/slack-coworker/` | Complete — updated for v0.2 with full interrupt flow |
| `examples/01-* through 10-*` | OUTDATED — still use old `wrapTools` API |
| `docs/v0.2.0-implementation-plan.md` | Complete — final blueprint |

## Key Insights Worth Remembering

1. **Stop conditions are predicates, not trackers.** `StopCondition` receives `{ steps }` and returns `boolean`. You can't bolt `snapshot()` or shared state onto it. That's why CostTracker is a separate primitive.

2. **AI SDK messages are the ONLY state.** Between `generateText` calls, there's zero internal state. The entire conversation is in the messages array. This is what makes interrupt serialization possible — save messages, restore messages, call `generateText` again.

3. **`collectToolApprovals` reads from messages.** It finds tool calls by scanning messages for `tool-call` parts keyed by `toolCallId`. If you mutate `input` on the tool-call part before re-calling, the SDK executes with your modified args. No deep clone, no hash check, no re-validation.

4. **All-or-nothing per step.** If the LLM called 3 CONFIRM tools in one step, decide ALL 3 before resuming. Partial approval creates states the LLM never intended.

5. **`resolveInterrupt` is a PURE FUNCTION.** No side effects, no state mutation. Idempotency is the caller's problem (delete-before-execute pattern).

6. **Budget resets across invocations.** Each `generateText` call starts token counts from zero. `InterruptHandle.previousUsage` captures cumulative tokens so the user can aggregate across interrupt cycles.

7. **The membrane's `resolve()` function escape hatch** handles edge cases that globs can't (dynamic logic, complex matching). Resolution order: explicit tiers → `resolve()` → glob patterns → default.

8. **`structuredClone`** is available in Node 17+ and used in `resolveInterrupt` for deep-copying handles without JSON roundtrip issues.

## File Paths Quick Reference

### SDK Core
- `~/Documents/Code/ai-employee/packages/core/src/types.ts`
- `~/Documents/Code/ai-employee/packages/core/src/membrane.ts`
- `~/Documents/Code/ai-employee/packages/core/src/cost-tracker.ts`
- `~/Documents/Code/ai-employee/packages/core/src/interrupts.ts`
- `~/Documents/Code/ai-employee/packages/core/src/in-memory-store.ts`
- `~/Documents/Code/ai-employee/packages/core/src/stop-conditions.ts`
- `~/Documents/Code/ai-employee/packages/core/src/employee-agent.ts`
- `~/Documents/Code/ai-employee/packages/core/src/resolve-tier.ts`
- `~/Documents/Code/ai-employee/packages/core/src/index.ts`

### Tests
- `~/Documents/Code/ai-employee/packages/core/src/__tests__/membrane.test.ts`
- `~/Documents/Code/ai-employee/packages/core/src/__tests__/cost-tracker.test.ts`
- `~/Documents/Code/ai-employee/packages/core/src/__tests__/interrupts.test.ts`
- `~/Documents/Code/ai-employee/packages/core/src/__tests__/interrupt-flow.test.ts`
- `~/Documents/Code/ai-employee/packages/core/src/__tests__/interrupt-flow-visual.test.ts`
- `~/Documents/Code/ai-employee/packages/core/src/__tests__/in-memory-store.test.ts`
- `~/Documents/Code/ai-employee/packages/core/src/__tests__/resolve-tier.test.ts`
- `~/Documents/Code/ai-employee/packages/core/src/__tests__/integration.test.ts`

### Slack Coworker Example
- `~/Documents/Code/ai-employee/examples/slack-coworker/src/lib/ai/agent.ts`
- `~/Documents/Code/ai-employee/examples/slack-coworker/src/lib/bolt/listeners.ts`
- `~/Documents/Code/ai-employee/examples/slack-coworker/src/lib/store.ts`
- `~/Documents/Code/ai-employee/examples/slack-coworker/package.json`

### Docs
- `~/Documents/Code/ai-employee/docs/v0.2.0-implementation-plan.md`
- `~/Documents/Code/ai-employee/docs/research/tmp/session-handoff-ai-employee-1.md`

### Research Repos
- `~/Documents/Code/ai-employee-research/` — 38 competitor/concept repos
- `~/Documents/Code/ai-employee-patterns/` — 14 pattern/framework repos

## How to Start Next Session

### Option 1: Push to GitHub + publish to npm
```
Read docs/research/tmp/session-handoff-ai-employee-2.md for full context. This is session 3 of the AI Employee SDK.

v0.2.0 is fully built (215 tests, all passing, build clean). We need to:
1. Create GitHub repo: progrmoiz/ai-employee
2. Create LICENSE (Apache-2.0)
3. Write root README
4. Update the 10 old examples (01-10) to use new membrane API (tools in config, no wrapTools)
5. Push to GitHub
6. Publish to npm: @aiemployee/core, @aiemployee/store-file, @aiemployee/store-kv

Let's get this shipped.
```

### Option 2: Test Slack coworker live
```
Read docs/research/tmp/session-handoff-ai-employee-2.md for context. v0.2.0 is built.

The Slack coworker example at examples/slack-coworker/ has full interrupt handling (CONFIRM → Slack buttons → approve/deny → resume). I want to test it live:
1. Create a Slack app using the manifest.json
2. Set up ngrok tunnel for local dev
3. Run pnpm dev
4. @mention the bot and trigger a CONFIRM tool
5. Test the approve/deny/edit flow

Walk me through the setup.
```

### Option 3: Build showcase examples (AI SDR, AI Customer Support)
```
Read docs/research/tmp/session-handoff-ai-employee-2.md for context. v0.2.0 is built with membrane, CostTracker, and interrupts.

I want to build trending showcase examples that demonstrate the SDK's value:
- AI SDR: monitors leads, drafts outreach (CONFIRM), tracks costs
- AI Customer Support: reads tickets, drafts responses (DRAFT), escalates (CONFIRM)
- AI GitHub Triage: monitors repos, labels issues (AUTO), closes stale (CONFIRM)

Each example should use the full v0.2 feature set: membrane tiers, CostTracker, interrupt flow with serialization.
```
