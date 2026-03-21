# slack-coworker

An AI coworker for Slack built with the `ai-employee` SDK, Next.js, and `@vercel/slack-bolt`.

Mention the bot in any channel it's a member of. It reads context, replies in-thread, and remembers things across conversations using a persistent store.

## Tools & Membrane

| Tool | Tier | Behaviour |
|------|------|-----------|
| `readChannel` | AUTO | Reads channel history — executes immediately |
| `lookupUser` | AUTO | Fetches user info — executes immediately |
| `saveMemory` | AUTO | Writes to persistent store — executes immediately |
| `searchMemory` | AUTO | Lists/reads from store — executes immediately |
| `replyInThread` | DRAFT | Posts in thread — executes and is logged to audit trail |
| `postToChannel` | CONFIRM | Broadcasts to channel — requires explicit approval |

## Local Dev

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Fill in SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, OPENAI_API_KEY
```

### 3. Import the Slack manifest

Go to [api.slack.com/apps](https://api.slack.com/apps) → Create App → From manifest → paste `manifest.json`.

### 4. Start the dev server + ngrok tunnel

In two separate terminals:

```bash
pnpm dev
```

```bash
ngrok http 3000
```

Set the events URL in your Slack app to `https://<ngrok-url>/api/slack/events`.

### 5. Invite the bot and mention it

```
/invite @Coworker
@Coworker what can you help me with?
```

## Deploy to Vercel

```bash
vercel deploy
```

Set these environment variables in the Vercel dashboard:
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `OPENAI_API_KEY`

For persistent memory in production, add a Vercel KV store and set:
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

The store auto-picks: KV when those env vars are set, FileStore otherwise.

Update the events URL in your Slack app settings to `https://<your-vercel-url>/api/slack/events`.
