import { openai } from "@ai-sdk/openai";
import { generateText, tool, stepCountIs, type ToolSet } from "ai";
import { z } from "zod";
import {
  membrane,
  createCostTracker,
  DEFAULT_MODEL_PRICING,
  extractPendingApprovals,
  createInterruptHandle,
  resolveInterrupt,
} from "@ai-employee-sdk/core";
import type {
  MemoryStore,
  CostTrackerResult,
  InterruptHandle,
  InterruptDecision,
  PendingApproval,
} from "@ai-employee-sdk/core";

const SYSTEM_INSTRUCTIONS = `You are a helpful AI coworker in a Slack workspace.
Human messages are prefixed with [User <SLACK_USER_ID>] so you can distinguish
between multiple participants in the same thread. Respond professionally and concisely.

## CRITICAL: URL formatting

Every URL in your response MUST use this exact Slack mrkdwn format:
  <https://the-url.com|anchor text>

The anchor text must be a meaningful word or phrase, never the raw URL itself.
The URL must always be inside angle brackets.

## Slack mrkdwn formatting

- Bold: *text*  |  Italic: _text_  |  Strikethrough: ~text~
- Inline code: \`code\`  |  Code block: \`\`\`code\`\`\`
- Bullet: - item  |  Blockquote: > text
- User mention: <@U12345678>  |  Channel mention: <#C12345678>
- Never use standard markdown like **bold**, [link](url), or # headers

## Tool usage

When the user asks you to post something to a channel, ALWAYS use the postToChannel tool immediately.
Do NOT ask for confirmation in text. The system handles approval automatically.
Just call the tool. If approval is needed, the system will pause and present buttons to the user.`;

/**
 * Slack client shape — accepts the @slack/bolt WebClient.
 */
interface SlackClient {
  conversations: {
    history: (params: { channel: string; limit?: number }) => Promise<{
      messages?: Array<{ user?: string; text?: string; ts?: string }>;
    }>;
  };
  chat: {
    postMessage: (params: {
      channel: string;
      text: string;
      thread_ts?: string;
    }) => Promise<unknown>;
  };
  users: {
    info: (params: { user: string }) => Promise<{
      user?: {
        real_name?: string;
        name?: string;
        profile?: { email?: string };
      };
    }>;
  };
}

function createTools(store: MemoryStore, slackClient: SlackClient) {
  return {
    // AUTO tier — read-only Slack ops
    readChannel: tool({
      description: "Read recent messages from a Slack channel",
      inputSchema: z.object({
        channel: z.string().describe("Channel ID (e.g. C12345678)"),
        limit: z.number().optional().describe("Number of messages to fetch (default 20)"),
      }),
      execute: async ({ channel, limit }) => {
        const result = await slackClient.conversations.history({
          channel,
          limit: limit ?? 20,
        });
        return (result.messages ?? []).map((m) => ({
          user: m.user,
          text: m.text,
          ts: m.ts,
        }));
      },
    }),

    lookupUser: tool({
      description: "Look up a Slack user by their user ID",
      inputSchema: z.object({
        userId: z.string().describe("Slack user ID (e.g. U12345678)"),
      }),
      execute: async ({ userId }) => {
        const result = await slackClient.users.info({ user: userId });
        const user = result.user;
        return {
          name: user?.real_name ?? user?.name ?? "Unknown",
          email: user?.profile?.email ?? null,
        };
      },
    }),

    saveMemory: tool({
      description: "Save a piece of information to persistent memory for later retrieval",
      inputSchema: z.object({
        key: z.string().describe("Memory key (e.g. 'memory:user-preference')"),
        value: z.string().describe("Value to store"),
      }),
      execute: async ({ key, value }) => {
        await store.set(key, value);
        return { saved: true, key };
      },
    }),

    searchMemory: tool({
      description: "Search saved memory for relevant information",
      inputSchema: z.object({
        prefix: z.string().optional().describe("Key prefix to filter (e.g. 'memory:')"),
      }),
      execute: async ({ prefix }) => {
        const keys = await store.list(prefix ?? "memory:");
        const entries: Record<string, unknown> = {};
        for (const key of keys.slice(0, 20)) {
          entries[key] = await store.get(key);
        }
        return entries;
      },
    }),

    // DRAFT tier — write ops that are logged
    replyInThread: tool({
      description: "Reply to a message in a Slack thread",
      inputSchema: z.object({
        channel: z.string().describe("Channel ID"),
        threadTs: z.string().describe("Thread timestamp (ts of the parent message)"),
        text: z.string().describe("Message text in Slack mrkdwn format"),
      }),
      execute: async ({ channel, threadTs, text }) => {
        await slackClient.chat.postMessage({
          channel,
          text,
          thread_ts: threadTs,
        });
        return { sent: true };
      },
    }),

    // CONFIRM tier — broadcast posting needs approval
    postToChannel: tool({
      description: "Post a new message to a Slack channel (not in a thread)",
      inputSchema: z.object({
        channel: z.string().describe("Channel ID"),
        text: z.string().describe("Message text in Slack mrkdwn format"),
      }),
      execute: async ({ channel, text }) => {
        await slackClient.chat.postMessage({ channel, text });
        return { sent: true };
      },
    }),
  };
}

const MEMBRANE_CONFIG = {
  tiers: {
    auto: ["readChannel", "lookupUser", "saveMemory", "searchMemory"],
    draft: ["replyInThread"],
    confirm: ["postToChannel"],
  },
};

/**
 * Run the Slack coworker agent.
 *
 * Returns either a completed result or an interrupt handle for approval.
 */
export async function runCoworker(
  store: MemoryStore,
  slackClient: SlackClient,
  prompt: string,
  existingMessages?: any[],
  previousUsage?: { inputTokens: number; outputTokens: number; totalTokens: number },
) {
  const tools = createTools(store, slackClient);

  const m = membrane({
    tools: tools as unknown as Record<string, any>,
    ...MEMBRANE_CONFIG,
  });

  const tracker = createCostTracker({
    budget: 0.10, // $0.10 per interaction
    pricing: DEFAULT_MODEL_PRICING,
  });

  // Seed tracker with usage from before the interrupt (budget continuity)
  if (previousUsage) {
    tracker.onStepFinish({
      usage: { inputTokens: previousUsage.inputTokens, outputTokens: previousUsage.outputTokens },
      response: { modelId: "gpt-4o-mini" },
    });
  }

  const result = await generateText({
    model: openai("gpt-4o-mini"),
    system: SYSTEM_INSTRUCTIONS,
    tools: m.tools as ToolSet,
    prepareStep: m.prepareStep,
    experimental_onToolCallFinish: m.onToolCallFinish as any,
    onStepFinish: tracker.onStepFinish,
    stopWhen: [stepCountIs(10), tracker.stopCondition],
    ...(existingMessages ? { messages: existingMessages } : { prompt }),
  });

  // Check for pending approvals (CONFIRM tier)
  const pending = extractPendingApprovals(result);

  if (pending.length > 0) {
    // Include original user message so the handle is self-contained for resume
    const originalMessages = existingMessages ?? [{ role: "user" as const, content: prompt }];
    const handle = createInterruptHandle(result, pending, { originalMessages });
    return {
      type: "interrupt" as const,
      handle,
      pending,
      cost: tracker.snapshot(),
      auditLog: m.auditLog,
    };
  }

  return {
    type: "complete" as const,
    text: result.text ?? "Sorry, I couldn't generate a response.",
    cost: tracker.snapshot(),
    auditLog: m.auditLog,
  };
}

/**
 * Resume a previously interrupted agent run after human approval/denial.
 *
 * For approved tools: executes them first, then injects the real result
 * into the messages so the LLM sees the actual output.
 */
export async function resumeCoworker(
  store: MemoryStore,
  slackClient: SlackClient,
  handle: InterruptHandle,
  decisions: InterruptDecision[],
) {
  const { messages, previousUsage } = resolveInterrupt(handle, decisions);
  const tools = createTools(store, slackClient);

  // Execute approved tools and replace their placeholder results with real output
  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.role === "tool" && Array.isArray(lastMsg.content)) {
    for (const part of lastMsg.content) {
      if (part.type !== "tool-result" || part.output?.type === "execution-denied") continue;

      // Find the matching decision
      const decision = decisions.find(
        (d) => d.toolCallId === part.toolCallId && d.action === "approve",
      );
      if (!decision) continue;

      // Find the tool and execute it
      const toolDef = tools[part.toolName as keyof typeof tools];
      if (!toolDef?.execute) continue;

      // Use editedArgs if provided, otherwise find original args from handle
      const pending = handle.pendingApprovals.find((p) => p.toolCallId === part.toolCallId);
      const args = decision.editedArgs ?? pending?.args ?? {};

      try {
        const result = await toolDef.execute(args as any, { toolCallId: part.toolCallId } as any);
        part.output = {
          type: "text",
          value: typeof result === "string" ? result : JSON.stringify(result),
        };
      } catch (err: any) {
        part.output = {
          type: "text",
          value: `Error executing ${part.toolName}: ${err.message}`,
        };
      }
    }
  }

  return runCoworker(store, slackClient, "", messages, previousUsage);
}

// Re-export types for use in listeners
export type { PendingApproval, InterruptHandle, InterruptDecision };
