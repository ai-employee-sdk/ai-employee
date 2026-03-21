import { App } from "@slack/bolt";
import { VercelReceiver } from "@vercel/slack-bolt";
import { registerListeners } from "./listeners";

// Lazily initialised so the build succeeds without Slack env vars present.
// The handler is created on first request.
let _app: App | undefined;
let _receiver: VercelReceiver | undefined;

function getApp(): { app: App; receiver: VercelReceiver } {
  if (!_app || !_receiver) {
    _receiver = new VercelReceiver();
    _app = new App({
      token: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      receiver: _receiver,
      deferInitialization: true,
    });
    registerListeners(_app);
  }
  return { app: _app, receiver: _receiver };
}

// Named exports matching Vercel's pattern — but lazily resolved.
export function getSlackApp() {
  return getApp();
}
