import { openai } from "@ai-sdk/openai";
import { generateText, tool, type ToolSet } from "ai";
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

## Membrane tiers

Tools are tiered by permission level:
- AUTO: executes immediately (read operations, lookups)
- DRAFT: executes but is logged for review (replies in threads)
- CONFIRM: requires explicit human approval before executing (posting to channels)

When a CONFIRM tool is needed, the system will pause and ask the human for approval.`;

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
} as const;

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

  const result = await generateText({
    model: openai("gpt-4o-mini"),
    system: SYSTEM_INSTRUCTIONS,
    tools: m.tools as ToolSet,
    prepareStep: m.prepareStep,
    experimental_onToolCallFinish: m.onToolCallFinish as any,
    onStepFinish: tracker.onStepFinish,
    stopWhen: tracker.stopCondition,
    maxSteps: 10,
    ...(existingMessages ? { messages: existingMessages } : { prompt }),
  });

  // Check for pending approvals (CONFIRM tier)
  const pending = extractPendingApprovals(result);

  if (pending.length > 0) {
    const handle = createInterruptHandle(result, pending);
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
 */
export async function resumeCoworker(
  store: MemoryStore,
  slackClient: SlackClient,
  handle: InterruptHandle,
  decisions: InterruptDecision[],
) {
  const { messages } = resolveInterrupt(handle, decisions);
  return runCoworker(store, slackClient, "", messages);
}

// Re-export types for use in listeners
export type { PendingApproval, InterruptHandle, InterruptDecision };
