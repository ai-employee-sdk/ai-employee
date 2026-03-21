import type { App } from "@slack/bolt";
import { runCoworker, resumeCoworker } from "@/lib/ai/agent";
import type { InterruptHandle, InterruptDecision } from "@/lib/ai/agent";
import { createStore } from "@/lib/store";

/**
 * Register all Slack event listeners on the app.
 * Called once during app init in app.ts.
 */
export function registerListeners(app: App): void {
  /**
   * app_mention — fires when the bot is @mentioned in any channel it's in.
   *
   * Flow:
   *   1. Extract the user's message text (strip the bot mention)
   *   2. Run the coworker agent with membrane + cost tracking
   *   3. If agent completes: reply in-thread with the response
   *   4. If agent hits CONFIRM: save interrupt handle, post approval buttons
   */
  app.event("app_mention", async ({ event, client, logger }) => {
    const { channel, ts, thread_ts, user, text } = event;
    const replyTs = thread_ts ?? ts;

    // Strip the bot mention (e.g. "<@U123> hello" -> "hello")
    const userMessage = text.replace(/<@[^>]+>\s*/g, "").trim();

    if (!userMessage) {
      await client.chat.postMessage({
        channel,
        thread_ts: replyTs,
        text: "Hey! What can I help you with?",
      });
      return;
    }

    try {
      const store = await createStore();
      const prompt = user ? `[User <@${user}>]: ${userMessage}` : userMessage;

      const result = await runCoworker(store, client as any, prompt);

      if (result.type === "complete") {
        // Agent finished — reply with result
        await client.chat.postMessage({
          channel,
          thread_ts: replyTs,
          text: result.text,
        });

        // Log cost in thread (if non-trivial)
        if (result.cost.totalCostUsd > 0.001) {
          logger.info(
            `Coworker cost: $${result.cost.totalCostUsd.toFixed(4)} ` +
            `(${result.cost.steps} steps, ${result.cost.totalInputTokens + result.cost.totalOutputTokens} tokens)`
          );
        }
      } else {
        // Agent hit CONFIRM — needs human approval
        const handle = result.handle;

        // Save handle to store for later retrieval
        await store.set(`interrupt:${handle.id}`, handle, 86400_000); // 24h TTL

        // Post approval buttons for each pending tool call
        for (const pending of result.pending) {
          await client.chat.postMessage({
            channel,
            thread_ts: replyTs,
            text: `I need approval to run *${pending.toolName}*`,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: [
                    `:rotating_light: *Approval needed:* \`${pending.toolName}\``,
                    "```",
                    JSON.stringify(pending.args, null, 2),
                    "```",
                  ].join("\n"),
                },
              },
              {
                type: "actions",
                block_id: `interrupt_${handle.id}`,
                elements: [
                  {
                    type: "button",
                    text: { type: "plain_text", text: "Approve", emoji: true },
                    style: "primary",
                    action_id: "interrupt_approve",
                    value: JSON.stringify({
                      handleId: handle.id,
                      toolCallId: pending.toolCallId,
                    }),
                  },
                  {
                    type: "button",
                    text: { type: "plain_text", text: "Deny", emoji: true },
                    style: "danger",
                    action_id: "interrupt_deny",
                    value: JSON.stringify({
                      handleId: handle.id,
                      toolCallId: pending.toolCallId,
                    }),
                  },
                ],
              },
            ],
          });
        }
      }
    } catch (err) {
      logger.error("app_mention handler failed:", err);
      await client.chat.postMessage({
        channel,
        thread_ts: replyTs,
        text: ":warning: Something went wrong. Please try again.",
      });
    }
  });

  /**
   * interrupt_approve — human clicked "Approve" on a CONFIRM tool.
   *
   * Flow:
   *   1. Load the interrupt handle from store
   *   2. Build decisions: approve the clicked tool, deny any others
   *   3. Resume the agent with resolveInterrupt
   *   4. If agent completes: update the message with the result
   *   5. If agent hits another CONFIRM: post new approval buttons
   */
  app.action("interrupt_approve", async ({ action, ack, client, body, logger }) => {
    await ack();

    const { handleId, toolCallId } = JSON.parse((action as any).value);
    const store = await createStore();

    const handle = await store.get<InterruptHandle>(`interrupt:${handleId}`);
    if (!handle) {
      await client.chat.postMessage({
        channel: (body as any).channel?.id ?? (body as any).container?.channel_id,
        text: ":x: This approval has expired.",
      });
      return;
    }

    // Approve clicked tool, approve all others too (all-or-nothing)
    const decisions: InterruptDecision[] = handle.pendingApprovals.map((p) => ({
      toolCallId: p.toolCallId,
      action: "approve" as const,
    }));

    // Clean up interrupt before executing
    await store.delete(`interrupt:${handleId}`);

    try {
      const result = await resumeCoworker(store, client as any, handle, decisions);
      const channel = (body as any).channel?.id ?? (body as any).container?.channel_id;
      const threadTs = (body as any).message?.thread_ts ?? (body as any).message?.ts;

      if (result.type === "complete") {
        await client.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: `:white_check_mark: Approved and executed.\n\n${result.text}`,
        });
      } else {
        // Agent hit ANOTHER CONFIRM — save new handle, post new buttons
        await store.set(`interrupt:${result.handle.id}`, result.handle, 86400_000);

        for (const pending of result.pending) {
          await client.chat.postMessage({
            channel,
            thread_ts: threadTs,
            text: `I need another approval to run *${pending.toolName}*`,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `:rotating_light: *Another approval needed:* \`${pending.toolName}\`\n\`\`\`${JSON.stringify(pending.args, null, 2)}\`\`\``,
                },
              },
              {
                type: "actions",
                block_id: `interrupt_${result.handle.id}`,
                elements: [
                  {
                    type: "button",
                    text: { type: "plain_text", text: "Approve", emoji: true },
                    style: "primary",
                    action_id: "interrupt_approve",
                    value: JSON.stringify({ handleId: result.handle.id, toolCallId: pending.toolCallId }),
                  },
                  {
                    type: "button",
                    text: { type: "plain_text", text: "Deny", emoji: true },
                    style: "danger",
                    action_id: "interrupt_deny",
                    value: JSON.stringify({ handleId: result.handle.id, toolCallId: pending.toolCallId }),
                  },
                ],
              },
            ],
          });
        }
      }
    } catch (err) {
      logger.error("interrupt_approve handler failed:", err);
    }
  });

  /**
   * interrupt_deny — human clicked "Deny" on a CONFIRM tool.
   */
  app.action("interrupt_deny", async ({ action, ack, client, body, logger }) => {
    await ack();

    const { handleId, toolCallId } = JSON.parse((action as any).value);
    const store = await createStore();

    const handle = await store.get<InterruptHandle>(`interrupt:${handleId}`);
    if (!handle) {
      await client.chat.postMessage({
        channel: (body as any).channel?.id ?? (body as any).container?.channel_id,
        text: ":x: This approval has expired.",
      });
      return;
    }

    // Deny all pending approvals
    const decisions: InterruptDecision[] = handle.pendingApprovals.map((p) => ({
      toolCallId: p.toolCallId,
      action: "deny" as const,
    }));

    await store.delete(`interrupt:${handleId}`);

    try {
      const result = await resumeCoworker(store, client as any, handle, decisions);
      const channel = (body as any).channel?.id ?? (body as any).container?.channel_id;
      const threadTs = (body as any).message?.thread_ts ?? (body as any).message?.ts;

      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: result.type === "complete"
          ? `:no_entry: Denied. ${result.text}`
          : ":no_entry: Denied.",
      });
    } catch (err) {
      logger.error("interrupt_deny handler failed:", err);
    }
  });
}
