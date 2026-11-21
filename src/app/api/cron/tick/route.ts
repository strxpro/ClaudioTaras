import { after } from "next/server";
import { tick } from "@/lib/assistant/tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

let last = 0;

/**
 * The assistant's clock (reminders, morning plan, evening report). Anyone may knock: a knock only
 * sends what is already due, once (kv.once). Strangers are limited to one knock per 20 s per instance.
 *   ?ahead=<s>  also wait here for what is due in the next s seconds (≤ 280) — the caller's interval
 *   ?wait=1     answer with the result instead of at once (tests)
 */
async function handle(req: Request) {
  const url = new URL(req.url);
  const auth = req.headers.get("x-tick-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const keys = [process.env.TELEGRAM_WEBHOOK_SECRET, process.env.CRON_SECRET].filter(Boolean);
  const trusted = keys.includes(auth);
  if (!trusted && Date.now() - last < 20_000) return Response.json({ ok: true, skipped: "too soon" });
  last = Date.now();
  const ua = req.headers.get("user-agent") ?? "";
  const by = url.searchParams.get("by")?.slice(0, 20) || (/vercel-cron/i.test(ua) ? "vercel" : "?");
  const ahead = Math.min(Math.max(Number(url.searchParams.get("ahead")) || 0, 0), 280);
  if (url.searchParams.get("wait") === "1" && trusted) return Response.json({ ok: true, ...(await tick(ahead, by)) });
  after(() => tick(ahead, by).then(() => undefined));
  return Response.json({ ok: true });
}

export const GET = handle;
export const POST = handle;
