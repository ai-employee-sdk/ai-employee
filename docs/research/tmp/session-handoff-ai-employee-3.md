# Session Handoff — AI Employee SDK v0.2.0 Publish + Junior Example (Session 3)
### Continue from here in the next session

*Session date: 2026-03-21 (Saturday, ~6 AM - 10:45 AM PKT)*
*Previous sessions: `docs/research/tmp/session-handoff-ai-employee-1.md`, `docs/research/tmp/session-handoff-ai-employee-2.md`*
*Status: v0.2.0 publish-ready (all fixes applied, 216 tests). Junior example fully designed. GitHub org + npm scope secured. Not yet pushed or published.*

---

## What This Session Was About

This session had three phases:

1. **Chat SDK evaluation** — Researched Vercel's Chat SDK (`vercel/chat`, v4.20.2) and asked Lars whether to integrate. Verdict: **stay independent** — "a toolbox, not a framework." Chat SDK is a transport layer, our SDK stays below that. Can build a second Slack example using Chat SDK later.

2. **Publish readiness** — Executed the full publish checklist: LICENSE, README (root + core), package.json cleanup, old examples deleted, version bumped to 0.2.0, peer dep pinned. Then Lars did a full code review and found 3 must-fix bugs + export cleanup issues. All fixed. 216 tests passing, 49.6KB packed.

3. **Junior example design** — Deep research into Junior (junior.so) — read their blog posts, use cases, LinkedIn, press coverage. Then had Lars design the full implementation blueprint for a "Build your own AI employee" template.

## What We Decided

### 1. Stay independent from Chat SDK
`@ai-employee-sdk/core` stays as pure functions with zero transport deps. Chat SDK integration is a separate example (`examples/slack-coworker-chat-sdk/`), not a dependency.
**Why:** Interrupt resolution is an agent autonomy concern, not a chat platform concern. Coupling to any transport narrows the audience.

### 2. Keep EmployeeAgent (against Lars's recommendation)
Lars recommended cutting it. Moiz wants to keep it.
**Why:** Convenience wrapper is useful for getting started quickly.

### 3. GitHub org: `ai-employee-sdk`
Both GitHub org and npm scope (`@ai-employee-sdk`) secured by Moiz.
**Why:** Clean namespace for multiple repos (core, starter templates, examples). Matches npm scope.

### 4. Package renamed: `@ai-employee-sdk/core`
Was `@aiemployee/core`. All references updated across monorepo (14 files).
**Why:** Namespace alignment with GitHub org.

### 5. Junior as the flagship example
One killer example at `ai-employee-sdk/junior` showing how to build what Junior (junior.so) claims to be — an AI employee in Slack with memory, learning, cron jobs, and permission gates.

### 6. Lars Grammel to write SDK documentation
He wrote the AI SDK docs. Our SDK extends AI SDK. Same style, same progressive disclosure.

## What Changed in the Codebase

### Bug fixes (from Lars's code review)
| File | What changed |
|------|-------------|
| `packages/core/src/employee-agent.ts` | `maxSteps` now wired — converts to `stepCountIs(maxSteps)` composed with user's `stopWhen`. Added `stepCountIs` + `StopCondition` imports from `ai`. |
| `packages/core/src/types.ts` | Removed `heartbeat?: HeartbeatConfig` from `EmployeeAgentConfig` (was dead config, never wired). |
| `packages/core/package.json` | Peer dep pinned: `"ai": ">=7.0.0-beta.30 <8.0.0"` (was unbounded `>=7.0.0-beta.0`). |
| `packages/core/src/index.ts` | Added `resolveTier` export. Removed `FileStoreConfig`, `KVStoreConfig` phantom type exports. |

### Publish prep
| File | What changed |
|------|-------------|
| `LICENSE` | Created — Apache-2.0, copyright Abdul Moiz Farooq |
| `README.md` (root) | Created — problem statement, packages table, quick start, features |
| `packages/core/README.md` | Rewritten — exports table, 3 code examples (membrane, cost, interrupts), tier system, types |
| `packages/core/package.json` | Version 0.2.0, removed `"src"` from files, added repository/homepage/bugs/keywords |
| `examples/01-* through 10-*` | Deleted (old `wrapTools` API, never published) |

### Rename to `@ai-employee-sdk`
All `@aiemployee/` references replaced with `@ai-employee-sdk/` across 14 files:
- `packages/core/package.json`, `packages/store-file/package.json`, `packages/store-kv/package.json`
- `examples/slack-coworker/package.json`, `tsconfig.json`, `next.config.ts`
- All source files importing from `@aiemployee/*`
- Both READMEs
- `pnpm install` run to update workspace resolution

## What Was NOT Done Yet

1. **GitHub repo not created** — org `ai-employee-sdk` exists, repo `core` not created, code not pushed
2. **npm not published** — `@ai-employee-sdk/core` scope secured, package not published
3. **SDK documentation** — Lars to write full docs (decided, not started)
4. **Junior example** — fully designed (see below), not built
5. **store-file / store-kv** — not publishing in v0.2.0 (Lars recommended: publish core first, validate MemoryStore interface)
6. **CI/CD** — no GitHub Actions
7. **CHANGELOG.md** — not created
8. **Chat SDK example** — `examples/slack-coworker-chat-sdk/` discussed but not built

## Junior Example Blueprint

Full implementation design at Lars's recommendation. Key architecture:

### Repo structure: `ai-employee-sdk/junior`
```
examples/junior/
  src/
    app/api/
      slack/events/route.ts           # Bolt event handler
      cron/
        morning-briefing/route.ts     # 8 AM weekdays
        daily-digest/route.ts         # 6 PM weekdays
        channel-scan/route.ts         # Every 30 min
        metric-check/route.ts         # Every 1h
        memory-consolidation/route.ts # Sunday 4 AM
    lib/
      agent.ts                        # EmployeeAgent + runJunior()
      tools/
        slack-read.ts                 # Read channels, threads, users (auto)
        slack-write.ts                # Post messages, DM (draft/confirm)
        memory-tools.ts               # Save/search/consolidate (draft)
        learning-tools.ts             # Record lessons, promote rules (draft)
        analysis-tools.ts             # Summarize, detect anomalies (draft)
      memory/
        store.ts                      # MemoryStore factory
        schema.ts                     # 4-layer memory types
        consolidation.ts              # Weekly compression
        person-profile.ts             # Per-person profile management
      learning/
        lessons.ts                    # LESSONS registry
        rules.ts                      # RULES registry (promoted firmware)
        promotion.ts                  # 3-strike promotion logic
      cron/
        jobs.ts                       # All checkWork functions
      slack/
        app.ts                        # Bolt setup
        listeners.ts                  # Event handlers + passive ingestion
        audience.ts                   # Who can see this response?
        identity.ts                   # Channel ID mapping, verified lookups
      instructions.ts                 # Dynamic system prompt builder
```

### 4-Layer Memory System
1. **Short-term buffer** — raw observations, 48h TTL, keyed by `memory:buffer:{channel}:{ts}`
2. **Per-person profiles** — communication style, topics, preferences, keyed by `memory:person:{userId}`
3. **Domain context** — topic-scoped knowledge (pricing, engineering, product), keyed by `memory:domain:{domain}`
4. **Consolidated** — weekly compressed summaries, keyed by `memory:consolidated:{weekOf}`

### Learning Loop
- `recordLesson` tool → saves to `learning:lessons` with pattern + correction
- 3 occurrences → `checkPromotion()` promotes to `learning:rules`
- `createRulesPrepareStep` injects rules into system prompt as `<permanent-rules>`
- Rules are "firmware" — injected into every conversation

### Permission Tiers (17 tools)
- **auto** (7): readChannel, readThread, lookupUser, searchMemory, getPersonProfile, getDomainContext, listRules, reactToMessage
- **draft** (6): replyInThread, saveMemory, updatePersonProfile, updateDomainContext, recordLesson, compileSummary
- **confirm** (3): postToChannel, dmUser, deleteMemory
- **block** (1): deleteChannel + `admin_*` glob pattern

### 5 Cron Jobs via Vercel Cron + createHeartbeat
- Morning briefing (8 AM weekdays)
- Daily digest (6 PM weekdays)
- Channel scan (every 30 min)
- Metric check (every 1h)
- Memory consolidation (Sunday 4 AM)

### Passive Ingestion
Every message in every channel the bot is in gets buffered (no LLM call). Person profiles updated incrementally. Proactive triggers checked cheaply.

### Audience Awareness
Custom `audiencePrepareStep` injects channel type (public/private), member count, and visibility rules before every response.

### Stack
Next.js + Vercel Cron + Slack Bolt + Upstash Redis + OpenAI gpt-4o

### What's Cut (v2)
- Meeting attendance (Recall.ai)
- Own email (SMTP/IMAP)
- Own calendar (Google OAuth)
- Notion CRM building
- GitHub integration

## Key Insights Worth Remembering

1. **Chat SDK is transport, our SDK is autonomy.** Different layers. Don't couple them.
2. **Lars's code review found `maxSteps` was silently ignored** in EmployeeAgent — config accepted it but never passed to ToolLoopAgent. Fixed by composing with `stepCountIs()`.
3. **Peer dep `>=7.0.0-beta.0` with no upper bound is dangerous** — pins to a future that doesn't exist. Fixed to `<8.0.0`.
4. **Phantom type exports confuse users** — `FileStoreConfig`/`KVStoreConfig` exported with no implementation. Removed.
5. **The learning loop is pure application code**, not an SDK primitive. The SDK gives memory injection and composePrepareStep — the lesson→rule promotion is built on top.
6. **Every cron job is a heartbeat with a different `checkWork`.** That's the SDK pattern.
7. **Passive ingestion (buffering every message) is the key to proactive behavior.** No LLM call on ingest — just buffer + increment.

## File Paths Quick Reference

### SDK Core
- `~/Documents/Code/ai-employee/packages/core/src/` — all source
- `~/Documents/Code/ai-employee/packages/core/package.json` — v0.2.0, `@ai-employee-sdk/core`
- `~/Documents/Code/ai-employee/README.md` — root README
- `~/Documents/Code/ai-employee/packages/core/README.md` — npm README
- `~/Documents/Code/ai-employee/LICENSE` — Apache-2.0

### Research
- `~/Documents/Code/ai-employee-patterns/chat/` — Vercel Chat SDK (cloned)
- `~/Documents/Code/ai-employee-research/paperclip/` — Paperclip (cloned)
- `~/Documents/Code/ai-employee-research/ralph-loop-agent/` — Ralph loop agent (cloned)

### Handoffs
- `~/Documents/Code/ai-employee/docs/research/tmp/session-handoff-ai-employee-1.md`
- `~/Documents/Code/ai-employee/docs/research/tmp/session-handoff-ai-employee-2.md`
- `~/Documents/Code/ai-employee/docs/research/tmp/session-handoff-ai-employee-3.md` (this file)

## How to Start Next Session

### Option 1: Push core SDK to GitHub + npm
```
Read docs/research/tmp/session-handoff-ai-employee-3.md. The SDK is publish-ready (216 tests, 49.6KB). Create the repo at ai-employee-sdk/core, push, and publish to npm as @ai-employee-sdk/core@0.2.0.
```

### Option 2: Write SDK documentation
```
Read docs/research/tmp/session-handoff-ai-employee-3.md. Use Lars Grammel agent to write full SDK documentation for @ai-employee-sdk/core — same style as AI SDK docs. All source is in packages/core/src/.
```

### Option 3: Build the Junior example
```
Read docs/research/tmp/session-handoff-ai-employee-3.md. The Junior example blueprint is in the handoff. Build it at examples/junior/ — an AI employee in Slack with 4-layer memory, learning loop, 5 cron jobs, 17 tools with membrane permissions, and interrupt-based approval flow.
```
