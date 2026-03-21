# Session Handoff — AI Employee SDK (Session 1)
### Continue from here in the next session

*Session date: March 20, 2026 (8:00 AM – 9:44 PM PKT)*
*Previous sessions: This is session 1. Prior research session at `/Users/moiz/Documents/Code/life-os/content/research/ai-employee-blueprint/` (19 files from Mar 19-20)*
*Status: SDK built, tested with real LLM, 141 unit tests passing, 10 examples working, Slack coworker Next.js app scaffolded. Not yet pushed to GitHub or published to npm.*

---

## What This Session Was About

We built the AI Employee SDK (`@aiemployee/core`) — an npm package that extends the Vercel AI SDK with autonomous agent primitives: permissions (membrane), scheduling (heartbeat), memory persistence, and an agent wrapper (EmployeeAgent). The session started with continuing research from a prior conversation (21 research files, 35 cloned repos, 11 expert consultations), then moved into implementation.

The core insight driving the architecture: we don't build a framework, we build composable primitives that snap onto the Vercel AI SDK's existing hooks (`prepareStep`, `needsApproval`, `StopCondition`, `onStepFinish`). Every export works independently with raw `generateText()` — no framework lock-in.

We also did 4 rounds of deep-dive with Lars Grammel (AI SDK architect persona), who traced actual code paths in the AI SDK source and verified our integration approach. Key finding: `membrane()` is a `prepareStep` function (not `LanguageModelV4Middleware`), because prepareStep can filter `activeTools` and inject context, while middleware can't see tool names.

## What We Decided

### Architecture: membrane returns 4 things, not 1
- `prepareStep` — removes BLOCK-tier tools from `activeTools` (LLM can't see them)
- `wrapTools(tools)` — sets `needsApproval:true` on CONFIRM tools, `execute:undefined` on BLOCK tools
- `onToolCallFinish` — logs DRAFT-tier executions to audit log
- `auditLog` — array of all DRAFT actions for review
- **Why:** Verified against AI SDK source. `prepareStep` can't modify `needsApproval` dynamically. `needsApproval` is set at tool definition time but can be a function that reads from `experimental_context`. So we need both layers.

### EmployeeAgent wraps ToolLoopAgent (~50 lines)
- `ToolLoopAgent` IS publicly exported from `ai` package
- Delegates `generate()` and `stream()` directly
- Composes membrane + memory + user prepareStep via `composePrepareStep()`
- **Why:** Proper `Agent` interface compliance for free. Less code than raw `generateText` approach.

### Package naming: `@aiemployee/core` (not `@ai-employee/core`)
- `@ai-employee` scope not available on npm
- Checked: `@aiemployee` is available
- **Why:** npm scope availability.

### Storage: `MemoryStore` interface with `get/set/list/delete`
- Renamed from `read/write` to `get/set` — matches Vercel Chat SDK pattern (Redis, Map convention)
- Added `ttlMs` on `set` — solves budget reset and rate limit windows
- Generic `<T>` on get/set for type safety
- **Why:** Traced storage patterns across 5 Vercel ecosystem projects. `get/set` is the convention.

### Harness decomposed into utility functions
- Not a separate primitive. It's `budgetExceeded()`, `tokenVelocityExceeded()`, `createAuditLogger()`.
- **Why:** After reading AI SDK source, stop conditions and callbacks are already first-class. No need for a wrapper.

### Heartbeat is a pure tick function
- User brings the scheduler (setInterval, Vercel Cron, Workflow)
- Concurrency guard (skip-if-running)
- Circuit breaker (maxConsecutiveErrors)
- **Why:** Different deployment targets need different schedulers. We ship logic, not timers.

### Slack coworker follows Vercel's official pattern
- Found `vercel-partner-solutions/slack-bolt-with-next` — their official template
- Uses `VercelReceiver` + `createHandler` + Next.js route handlers
- Our version replaces their `ToolLoopAgent` with `EmployeeAgent` (same pattern, plus membrane/memory)
- **Why:** Vercel-native pattern = deployable with one click.

## What Changed in the Codebase

### Created: `~/Documents/Code/ai-employee/` (the entire SDK)

**Root files:**
- `package.json` — pnpm workspace root
- `pnpm-workspace.yaml` — `packages: ['packages/*']`
- `tsconfig.json` — ES2022, strict, bundler resolution
- `.gitignore`, `.npmrc`

**Package: `packages/core/` (`@aiemployee/core` v0.1.0)**
- `src/types.ts` — ALL types (MemoryStore, MembraneConfig, Tier, AuditEntry, HeartbeatConfig, EmployeeAgentConfig, etc.)
- `src/resolve-tier.ts` — resolveTier(toolName, config) → explicit tiers → patterns → default
- `src/membrane.ts` — membrane() → { prepareStep, wrapTools, onToolCallFinish, auditLog }
- `src/compose-prepare-step.ts` — composePrepareStep(...fns) with merge rules (system: concatenate, activeTools: intersect, model/toolChoice: last writer wins, context: deep merge)
- `src/stop-conditions.ts` — budgetExceeded(), tokenVelocityExceeded()
- `src/audit.ts` — createAuditLogger()
- `src/memory.ts` — createMemoryPrepareStep() (frozen snapshot at step 0)
- `src/heartbeat.ts` — createHeartbeat() → { tick, isRunning }
- `src/employee-agent.ts` — EmployeeAgent class wrapping ToolLoopAgent
- `src/index.ts` — barrel exports (8 runtime + types)
- `src/__tests__/` — 8 test files, 120+ tests
- `dist/` — ESM + CJS + DTS built

**Package: `packages/store-file/` (`@aiemployee/store-file` v0.1.0)**
- `src/file-store.ts` — NDJSON on disk, TTL check on read, compaction on write >1MB
- `src/__tests__/file-store.test.ts` — 21 tests

**Package: `packages/store-kv/` (`@aiemployee/store-kv` v0.1.0)**
- `src/kv-store.ts` — wraps @vercel/kv, ~15 lines

**Examples (10 files):**
- `examples/01-membrane-only.ts` — just permissions on generateText
- `examples/02-employee-agent.ts` — named agent with identity
- `examples/03-with-memory.ts` — persistent memory across runs
- `examples/04-heartbeat.ts` — continuous monitoring loop
- `examples/05-codebase-guardian.ts` — protect repo from AI coding agent
- `examples/06-research-with-budget.ts` — budget cap + velocity detection
- `examples/07-audited-support-bot.ts` — JSONL audit trail
- `examples/08-daily-digest.ts` — heartbeat digest on timer
- `examples/09-composed-concerns.ts` — 3 prepareStep layers composed
- `examples/10-github-employee.ts` — REAL GitHub triage using `gh` CLI

**Slack Coworker Next.js App: `examples/slack-coworker/`**
- `src/app/api/slack/events/route.ts` — Vercel's createHandler pattern
- `src/lib/bolt/app.ts` — VercelReceiver + lazy init
- `src/lib/bolt/listeners.ts` — app_mention handler
- `src/lib/ai/agent.ts` — EmployeeAgent with 6 Slack tools + membrane + memory
- `src/lib/store.ts` — auto-picks FileStore or KV
- `manifest.json` — paste into Slack to create app
- `next.config.ts`, `package.json`, `vercel.json`, `README.md`

### Created: `~/Documents/Code/ai-employee-research/` (26 cloned repos)
Paperclip, hermes-agent, oh-my-openagent, rowboat, agent-control, agent-governance-toolkit, gambit, ralph-loop-agent, temm1e, opencrabs, Aegis, agentward, mission-control, agentd, aura, agent-coworker, agent-identity-management, ClawWork, Clawith, mem0, MemOS, SimpleMem, Acontext, scheduled, SlackAgents, Daemora

### Created: `~/Documents/Code/ai-employee-patterns/` (12 cloned repos)
vercel/ai, vercel/chat, vercel/ai-chatbot, vercel/workflow, vercel/sandbox, vercel-labs/bash-tool, vercel-labs/just-bash, vercel-partner-solutions/slack-bolt-with-next, mastra-ai/mastra, vargHQ/sdk, anthropic-sdk-typescript, openai-node, openai-agents-js

### Created in life-os: Research files
- `content/research/ai-employee-blueprint/18-open-source-landscape.md` — 35+ repos mapped
- `content/research/ai-employee-blueprint/19-sdk-architecture-final.md` — first architecture synthesis
- `content/research/ai-employee-blueprint/20-expert-deep-dive-vercel-integration.md` — 4 experts × 4 rounds
- `content/research/ai-employee-blueprint/21-lars-final-architecture.md` — v0.1.0 scope
- `content/research/ai-employee-blueprint/22-showcase-examples.md` — trending use cases from Twitter
- `content/research/ai-employee-blueprint/blueprint-v0.1.0.md` — complete implementation blueprint
- `content/research/ai-employee-blueprint/_index.md` — updated with all 23 files

## What Was NOT Done Yet

1. **GitHub repo not created** — `progrmoiz/ai-employee` doesn't exist yet. Need to `gh repo create`, push code.
2. **npm not published** — packages built locally but not published to npm.
3. **CONFIRM tier not fully tested** — `restartServer` in example 02 ran without pausing for approval. The `needsApproval:true` is set, but the tool loop might be auto-approving. Need to investigate the approval flow with a real user interaction.
4. **Slack coworker not tested live** — Next.js app builds but hasn't been connected to a real Slack workspace. Needs Slack app creation + tokens.
5. **Vercel deployment not tested** — Slack coworker has `vercel.json` and route handler but hasn't been deployed.
6. **HN launch post not written**
7. **Tweet thread not drafted**
8. **README for root repo** — only package-level READMEs exist
9. **CI/CD** — no GitHub Actions configured
10. **LICENSE file** — decided Apache-2.0 but file not created
11. **`inputSchema` vs `parameters`** — AI SDK v7 uses `inputSchema` (not `parameters`). Our examples are fixed but documentation should mention this.

## Research Conducted

### 23 research files in life-os (`content/research/ai-employee-blueprint/`)
Key findings:
1. **Vercel AI SDK v7 extension points** (from reading actual source): `prepareStep`, `needsApproval`, `stopWhen`, `experimental_context`, `onStepFinish`, `experimental_onToolCallFinish`
2. **membrane is prepareStep, NOT middleware** — middleware can't see tool names or interact with approval flow
3. **Paperclip (29.6K stars)** has no real memory, crude permissions (1 flag), 3,467-line heartbeat.ts monolith
4. **Mastra (25K stars)** vendors the AI SDK internally (maintenance hell), 5,379-line Agent class
5. **26 real GitHub issues/tweets** validating the pain — needsApproval is buggy, no BLOCK tier exists, horror stories weekly
6. **`toolCall.args` not `toolCall.input`** — AI SDK uses different property names in StepResult vs OnToolCallFinishEvent
7. **Token counts are `number | undefined`** — need `?? 0` everywhere
8. **Pin `ai@7.0.0-beta.30` exactly** — breaking changes between betas
9. **Need `zod@3.25.76`** (Standard Schema version)

## Current State of Key Files

| File | Status |
|------|--------|
| `~/Documents/Code/ai-employee/packages/core/dist/` | ✅ Built (ESM+CJS+DTS) |
| `~/Documents/Code/ai-employee/packages/store-file/dist/` | ✅ Built |
| `~/Documents/Code/ai-employee/packages/store-kv/dist/` | ✅ Built |
| `~/Documents/Code/ai-employee/examples/01-09` | ✅ Tested with real OpenAI |
| `~/Documents/Code/ai-employee/examples/10-github-employee.ts` | ✅ Tested with real GitHub data |
| `~/Documents/Code/ai-employee/examples/slack-coworker/` | ✅ Builds, NOT tested live |
| `~/Documents/Code/life-os/content/research/ai-employee-blueprint/` | ✅ 23 files + blueprint |

## Key Insights Worth Remembering

1. **AI SDK v7 uses `inputSchema` not `parameters`** for tool definitions. All examples must use `inputSchema` or OpenAI rejects with "Invalid schema" error.
2. **`toolCall.input` on StepResult, `toolCall.args` on OnToolCallFinishEvent** — different property names in different contexts. Confusing but verified.
3. **`OnToolCallFinishEvent` is a discriminated union** — must check `event.success` before accessing `event.output`.
4. **`activeTools` in prepareStep actually STRIPS tools** from the LLM request payload — verified by reading `prepare-tools-and-tool-choice.ts`.
5. **But `parseToolCall` resolves against FULL tools object** — belt+suspenders needed (activeTools filter + execute:undefined on BLOCK tools).
6. **Vercel's official Slack template** (`slack-bolt-with-next`) uses `ToolLoopAgent` directly — our `EmployeeAgent` is a drop-in replacement.
7. **FileStore shouldn't be installed into the SDK monorepo** — examples that need external deps (Slack, Next.js) should be separate folders with their own package.json.
8. **`@vercel/slack-bolt`** exists — handles Slack webhooks as Vercel serverless functions. No Socket Mode needed in production.

## File Paths Quick Reference

### SDK Source
- `~/Documents/Code/ai-employee/packages/core/src/` — all core primitives
- `~/Documents/Code/ai-employee/packages/store-file/src/` — FileStore
- `~/Documents/Code/ai-employee/packages/store-kv/src/` — KVStore

### Examples
- `~/Documents/Code/ai-employee/examples/01-09*.ts` — simple examples
- `~/Documents/Code/ai-employee/examples/10-github-employee.ts` — real GitHub agent
- `~/Documents/Code/ai-employee/examples/slack-coworker/` — Next.js Slack app

### Research
- `~/Documents/Code/life-os/content/research/ai-employee-blueprint/` — 23 files + blueprint
- `~/Documents/Code/ai-employee-research/` — 26 cloned competitor repos
- `~/Documents/Code/ai-employee-patterns/` — 12 cloned pattern repos

### Key Pattern References
- `~/Documents/Code/ai-employee-patterns/ai/packages/ai/src/agent/` — AI SDK Agent interface
- `~/Documents/Code/ai-employee-patterns/slack-bolt-with-next/` — Vercel's official Slack+Next template

## How to Start Next Session

### Option 1: Push to GitHub + Publish to npm
```
Continue the AI Employee SDK. Session handoff: ~/Documents/Code/ai-employee/docs/research/tmp/session-handoff-ai-employee-1.md

The SDK is built and tested (141 tests, 10 examples working). Next: create GitHub repo progrmoiz/ai-employee, push code, publish @aiemployee/core + @aiemployee/store-file + @aiemployee/store-kv to npm. Then write the HN launch post.
```

### Option 2: Test Slack Coworker live
```
Continue the AI Employee SDK. Session handoff: ~/Documents/Code/ai-employee/docs/research/tmp/session-handoff-ai-employee-1.md

The Slack coworker Next.js app is built but not tested live. Set up a Slack app (manifest.json is ready), connect tokens, test locally with ngrok, then deploy to Vercel.
```

### Option 3: Fix CONFIRM tier + build more showcase examples
```
Continue the AI Employee SDK. Session handoff: ~/Documents/Code/ai-employee/docs/research/tmp/session-handoff-ai-employee-1.md

The CONFIRM tier (needsApproval) needs testing — in example 02, restartServer ran without pausing. Also want to build the trending showcase examples: AI SDR, AI Customer Support, AI Employee Fleet (from research file 22-showcase-examples.md).
```
