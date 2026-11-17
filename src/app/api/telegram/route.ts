import { after } from "next/server";
import { handleUpdate, type Update } from "@/lib/bot/handle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** update_ids already taken on this instance — Telegram re-sends an update when it gets no quick 200 */
const seen = new Set<number>();

/**
 * Telegram webhook (and the target of `npm run bot:dev` locally). Answers 200 at once and does the
 * work after the response — AI and transcription take longer than Telegram is willing to wait.
 */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return new Response("TELEGRAM_WEBHOOK_SECRET not set", { status: 500 });
  if (req.headers.get("x-telegram-bot-api-secret-token") !== secret) return new Response("Unauthorized", { status: 401 });
  const update = (await req.json().catch(() => null)) as Update | null;
  if (!update?.update_id || seen.has(update.update_id)) return new Response("ok");
  seen.add(update.update_id);
  if (seen.size > 500) seen.delete(seen.values().next().value!);
  const origin = new URL(req.url).origin;
  after(async () => {
    try {
      await handleUpdate(update, origin);
    } catch (e) {
      console.error("[telegram] update", update.update_id, e);
    }
  });
  return new Response("ok");
}
