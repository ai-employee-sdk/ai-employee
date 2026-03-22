# AI Employee SDK

Composable autonomy primitives for Vercel AI SDK v7. A toolbox, not a framework.

- **npm**: `@ai-employee-sdk/core@0.2.0` (published)
- **GitHub**: github.com/ai-employee-sdk/ai-employee
- **Docs**: ai-employee-sdk.vercel.app

## Build & Test

```bash
pnpm install          # install all workspace deps
pnpm build            # build all packages (core, store-file, store-kv)
pnpm test             # run all tests (vitest, 216 tests)
pnpm lint             # typecheck all packages
```

### Package-specific

```bash
cd packages/core && pnpm test          # 216 tests
cd packages/core && pnpm build         # tsup -> dist/
cd packages/store-file && pnpm build
cd packages/store-kv && pnpm build
```

### Docs site

```bash
cd apps/docs && npm run dev            # local preview
cd apps/docs && npm run build          # production build
```

### Pack audit (before publish)

```bash
cd packages/core && npm pack --dry-run
```

## Architecture

### Monorepo structure

```
packages/
  core/            -> @ai-employee-sdk/core (published, v0.2.0)
  store-file/      -> @ai-employee-sdk/store-file (not published yet)
  store-kv/        -> @ai-employee-sdk/store-kv (not published yet)
apps/
  docs/            -> Fumadocs site (deployed to Vercel)
examples/
  slack-coworker/  -> Full Slack bot with interrupt-based approval flow
docs/
  v0.2.0-implementation-plan.md
  research/tmp/    -> Session handoff files (4 sessions so far)
```

### Core exports (packages/core/src/index.ts)

| Export | File | What |
|--------|------|------|
| `membrane()` | membrane.ts | 4-tier tool permissions (auto/draft/confirm/block) |
| `resolveTier()` / `explainTier()` | resolve-tier.ts | Tier resolution + debug API |
| `createCostTracker()` | cost-tracker.ts | Stateful USD tracking per model |
| `extractPendingApprovals()` | interrupts.ts | Detect CONFIRM tools awaiting approval |
| `createInterruptHandle()` | interrupts.ts | Serialize agent state for KV |
| `resolveInterrupt()` | interrupts.ts | Rebuild messages from decisions (pure function) |
| `composePrepareStep()` | compose-prepare-step.ts | Merge N PrepareStepFunctions |
| `createHeartbeat()` | heartbeat.ts | Concurrency guard + circuit breaker |
| `createMemoryPrepareStep()` | memory.ts | Inject memory into system prompt |
| `EmployeeAgent` | employee-agent.ts | Convenience wrapper |
| `InMemoryStore` | in-memory-store.ts | Map-based MemoryStore for testing |
| `budgetExceeded()` | stop-conditions.ts | Stop condition (token/USD) |
| `tokenVelocityExceeded()` | stop-conditions.ts | Stop condition (velocity) |
| `createAuditLogger()` | audit.ts | Standalone audit logger |
| `DEFAULT_MODEL_PRICING` | cost-tracker.ts | 13 model pricing table |

### Key types (packages/core/src/types.ts)

All types live in one file. Key ones: `Tier`, `MembraneConfig`, `MembraneResult`, `AuditEntry`, `CostTrackerConfig`, `CostSnapshot`, `PendingApproval`, `InterruptDecision`, `InterruptHandle`, `MemoryStore`.

### Docs site (apps/docs/)

- Fumadocs (Next.js 16) deployed to Vercel
- 12 MDX pages in `apps/docs/content/docs/`
- 6 diagrams in `apps/docs/public/images/` (Gemini-generated, light theme only)
- `<Diagram>` component auto-inverts for dark mode via CSS `dark:invert dark:hue-rotate-180`
- Geist font + Vercel-exact color overrides in `apps/docs/app/global.css`
- Sidebar structure in `apps/docs/content/docs/meta.json`

## Design Principles

1. **Toolbox, not framework.** Every primitive is a standalone function. No base classes, no runtime.
2. **Compose with generateText(), don't replace it.** We use AI SDK's `prepareStep`, `onStepFinish`, `stopWhen`, `needsApproval`.
3. **Pure functions where possible.** `resolveInterrupt` has no side effects. User handles storage + transport.
4. **Secure by default.** Unknown tools default to `'confirm'` tier.
5. **AI SDK messages are the ONLY state.** Between `generateText` calls, the conversation is in the messages array.

## Conventions

- TypeScript strict mode
- All source in `src/`, tests in `src/__tests__/`
- tsup for bundling (ESM + CJS + DTS)
- vitest for testing
- `ai` is a peer dependency (`>=7.0.0-beta.30 <8.0.0`), not bundled
- No `src/` shipped to npm, only `dist/` + `README.md`
- Docs: no em dashes in prose (AI writing tell). Use periods or commas.
- Docs: no `# Title` in MDX body (Fumadocs renders from frontmatter)
- Docs: use `<Diagram>` component for images, not raw `<img>`

## Common Patterns

### Adding a new primitive

1. Add types to `src/types.ts`
2. Create `src/{name}.ts` with implementation
3. Create `src/__tests__/{name}.test.ts`
4. Export from `src/index.ts` (runtime + types)
5. `pnpm build && pnpm test`

### Adding a docs page

1. Create `apps/docs/content/docs/{name}.mdx` with frontmatter
2. Add to `apps/docs/content/docs/meta.json` in the right section
3. If adding a diagram: generate with `scripts/generate-image.mjs --theme light`, save to `apps/docs/public/images/`
4. Use `<Diagram src="/images/{name}.png" alt="..." />` in the MDX
5. `cd apps/docs && npm run build`

### The interrupt flow (most important pattern)

```
Agent runs -> hits CONFIRM tool -> needsApproval stops loop
  -> extractPendingApprovals(result) finds unanswered tool calls
  -> createInterruptHandle(result, pending) serializes to JSON
  -> Save handle to KV, notify human
  -> ... hours pass, zero compute ...
  -> Human responds (approve/deny/edit)
  -> Load handle from KV, delete it (idempotency)
  -> resolveInterrupt(handle, decisions) rebuilds messages
  -> generateText(messages) resumes the agent
```
