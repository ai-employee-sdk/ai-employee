import { createHandler } from "@vercel/slack-bolt";
import { getSlackApp } from "@/lib/bolt/app";

export async function POST(req: Request) {
  const { app, receiver } = getSlackApp();
  const handler = createHandler(app, receiver);
  return handler(req);
}
