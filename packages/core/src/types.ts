// ============================================================
// src/types.ts — ALL types in one file
// ============================================================

// --- Tier System ---

export type Tier = 'auto' | 'draft' | 'confirm' | 'block';

export interface TierPattern {
  /** Glob pattern: 'mcp_*', '*_dangerous', 'exactName'. Supports * at start/end. */
  match: string;
  tier: Tier;
  /** Human-readable reason for this pattern (useful for debugging) */
  description?: string;
}

export interface TierResolution {
  tier: Tier;
  source: 'explicit' | 'resolve' | 'pattern' | 'default';
  description?: string;
  /** Index of the matched pattern (only when source is 'pattern') */
  patternIndex?: number;
}

// --- MemoryStore Interface ---

export interface MemoryStore {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

// --- Membrane ---

export interface MembraneConfig<TOOLS extends Record<string, any> = Record<string, any>> {
  /** The tools to wrap with tier permissions */
  tools: TOOLS;
  /** Explicit tool-to-tier mapping */
  tiers?: {
    auto?: string[];
    draft?: string[];
    confirm?: string[];
    block?: string[];
  };
  /** Custom resolver. Checked after explicit tiers, before patterns. */
  resolve?: (toolName: string) => Tier | undefined;
  /** Glob patterns applied in order for tools not in explicit tiers */
  patterns?: TierPattern[];
  /** Default tier for tools not matching any rule. Default: 'confirm' */
  default?: Tier;
}

export interface AuditEntry {
  timestamp: number;
  toolName: string;
  input: unknown;
  output: unknown;
  tier: Tier;
  /** For BLOCK tier: the tool was requested but never executed */
  blocked?: boolean;
  stepNumber: number;
}

export interface MembraneResult<TOOLS extends Record<string, any> = Record<string, any>> {
  /** Tools with tier permissions applied (BLOCK=execute:undefined, CONFIRM=needsApproval, etc.) */
  tools: TOOLS;
  /** PrepareStepFunction — removes BLOCK tools from activeTools, injects membrane context */
  prepareStep: import('ai').PrepareStepFunction;
  /** Callback for experimental_onToolCallFinish — logs all tier executions */
  onToolCallFinish: (event: {
    toolCall: { toolName: string; args: unknown };
    success?: boolean;
    output?: unknown;
    error?: unknown;
    stepNumber: number;
  }) => void;
  /** Audit log of all tool executions across all tiers */
  auditLog: AuditEntry[];
}

// --- Heartbeat ---

export type CheckWorkFn = () => Promise<string | null>;

export interface HeartbeatConfig {
  /** Function that checks for work. Returns prompt string or null (HEARTBEAT_OK). */
  checkWork: CheckWorkFn;
  /** MemoryStore for state persistence between ticks */
  state?: MemoryStore;
  /** Max consecutive errors before circuit breaker opens. Default: 5 */
  maxConsecutiveErrors?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

export interface HeartbeatResult {
  /** Execute one heartbeat tick. Returns the agent's response or null if no work. */
  tick: () => Promise<{ prompt: string; response: unknown } | null>;
  /** Whether a tick is currently running */
  isRunning: () => boolean;
}

// --- Memory ---

export interface MemoryPrepareStepConfig {
  /** Max tokens budget for memory injection. Default: 2000 */
  maxTokenBudget?: number;
  /** Specific memory keys to inject. Default: all keys with 'memory:' prefix */
  memoryKeys?: string[];
  /** Prefix for memory keys in the store. Default: 'memory:' */
  prefix?: string;
}

// --- Stop Conditions ---

// --- Model Pricing ---

export interface ModelPricing {
  /** Cost per 1M input tokens in USD */
  inputPerMToken: number;
  /** Cost per 1M output tokens in USD */
  outputPerMToken: number;
  /** Cost per 1M reasoning/thinking tokens in USD (for o3, etc.) */
  reasoningPerMToken?: number;
  /** Cost per 1M cached input tokens in USD (for Anthropic prompt caching, etc.) */
  cachedInputPerMToken?: number;
}

export interface BudgetConfig {
  /** Max total tokens (input + output) across all steps */
  maxTokens?: number;
  /** Max total cost in USD across all steps */
  maxCostUsd?: number;
  /** Cost per input token (for USD budget). Default: 0. Used when `pricing` is not set. */
  costPerInputToken?: number;
  /** Cost per output token (for USD budget). Default: 0. Used when `pricing` is not set. */
  costPerOutputToken?: number;
  /** Per-model pricing map. Takes precedence over costPerInputToken/costPerOutputToken when modelId is available. */
  pricing?: Record<string, ModelPricing>;
}

export interface VelocityConfig {
  /** Max average tokens per step */
  maxAvgPerStep: number;
  /** Number of recent steps to consider. Default: all steps */
  windowSize?: number;
}

// --- Audit Logger ---

export interface AuditLoggerConfig {
  /** Called when any tool execution starts */
  onToolCall?: (entry: {
    toolName: string;
    input: unknown;
    stepNumber: number;
    timestamp: number;
  }) => void;
  /** Called when a step finishes */
  onStep?: (entry: {
    stepNumber: number;
    finishReason: string;
    usage: { inputTokens: number; outputTokens: number; totalTokens: number };
    timestamp: number;
  }) => void;
}

export interface AuditLoggerResult {
  onToolCallStart: (event: any) => void;
  onToolCallFinish: (event: any) => void;
  onStepFinish: (event: any) => void;
}

// --- EmployeeAgent ---

export interface EmployeeAgentConfig<TOOLS extends Record<string, any> = Record<string, never>> {
  /** Language model instance */
  model: import('ai').LanguageModel;
  /** Agent instructions (system prompt) */
  instructions?: string;
  /** Agent ID */
  id?: string;
  /** Tools the agent can use */
  tools?: TOOLS;
  /** Membrane configuration for permission tiers (tools are passed separately via config.tools) */
  membrane?: Omit<MembraneConfig, 'tools'>;
  /** MemoryStore for memory injection */
  memory?: {
    store: MemoryStore;
    config?: MemoryPrepareStepConfig;
  };
  /** Additional prepareStep functions to compose */
  prepareStep?:
    | import('ai').PrepareStepFunction
    | import('ai').PrepareStepFunction[];
  /** Stop condition(s) */
  stopWhen?: import('ai').StopCondition<any> | import('ai').StopCondition<any>[];
  /** Callback when a step finishes */
  onStepFinish?: (event: any) => void;
  /** Callback when generation finishes */
  onFinish?: (event: any) => void;
  /** Max steps fallback. Default: 20 */
  maxSteps?: number;
}

// --- FileStore ---

export interface FileStoreConfig {
  /** Directory to store NDJSON files. Default: '.ai-employee' */
  dir?: string;
}

// --- KVStore ---

export interface KVStoreConfig {
  /** @vercel/kv client instance. If omitted, uses default kv from env. */
  kv?: any;
  /** Key prefix to namespace. Default: 'ai-employee:' */
  prefix?: string;
}

// --- CostTracker ---

export interface CostTrackerConfig {
  /** Maximum budget in USD. When exceeded, stopCondition fires. */
  budget: number;
  /** Pricing per model ID. Key is the model string returned in response.modelId. */
  pricing: Record<string, ModelPricing>;
}

export interface CostSnapshot {
  totalCostUsd: number;
  remainingUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalReasoningTokens: number;
  totalCachedInputTokens: number;
  steps: number;
  byModel: Record<string, {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cachedInputTokens: number;
    costUsd: number;
  }>;
  budgetExhausted: boolean;
}

export interface CostTrackerResult {
  /** Plug into generateText/streamText onStepFinish callback */
  onStepFinish: (event: any) => void;
  /** Use as stopWhen condition */
  stopCondition: (options: { steps: any[] }) => boolean;
  /** Get current cost snapshot */
  snapshot: () => CostSnapshot;
  /** Reset all accumulators (for reuse across runs) */
  reset: () => void;
}

// --- Interrupts ---

/** A pending approval extracted from generateText result */
export interface PendingApproval {
  /** Unique ID of the tool call (from AI SDK) */
  toolCallId: string;
  /** Name of the tool that needs approval */
  toolName: string;
  /** Arguments the LLM proposed */
  args: unknown;
  /** Which step this occurred in */
  stepNumber: number;
}

/** Human's decision on a pending approval */
export interface InterruptDecision {
  toolCallId: string;
  action: 'approve' | 'deny';
  /** If approve + edit: the modified args to use instead */
  editedArgs?: unknown;
}

/**
 * Serializable handle containing everything needed to resume an interrupted agent.
 * Plain JSON — no classes, no functions, no circular refs. Safe for KV/DB storage.
 */
export interface InterruptHandle {
  /** Unique handle ID (for KV key construction) */
  id: string;
  /** ISO timestamp of when the interrupt was created */
  createdAt: string;
  /** The full message history up to the interruption point */
  messages: any[];
  /** The pending approvals that caused the interrupt */
  pendingApprovals: PendingApproval[];
  /** The tool calls from the interrupted step */
  interruptedStepToolCalls: Array<{
    toolCallId: string;
    toolName: string;
    args: unknown;
  }>;
  /** Cumulative token usage up to the interruption point (for budget continuity) */
  previousUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}
