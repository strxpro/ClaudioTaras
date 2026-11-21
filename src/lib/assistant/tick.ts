import "server-only";
import { kv } from "../db";
import { admins, botEnabled } from "../bot/telegram";
import { cleanupRems, fireDue } from "./reminders";
import { assistantCfg, sendMorning, sendReport } from "./report";
import { rome } from "./time";

/**
 * One knock of the assistant's clock: sends reminders that are due (and waits for the ones due in the
 * next `ahead` seconds), the morning plan and the evening report. Safe to call any number of times
 * from anywhere — kv.once() lets exactly one caller send each message. Who knocks (api/cron/tick):
 *   Claudio's computer every minute (scripts/worker), GitHub Actions every ~5 min (.github/workflows),
 *   Vercel once a day (vercel.json), and the Telegram webhook whenever he writes to the bot.
 */
export async function tick(ahead = 0, by = "?") {
  const out = { fired: 0, morning: false, report: false, errors: [] as string[] };
  if (!botEnabled() || !admins().length) return out;
  const now = rome();
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  // the real clocks only (a chat message isn't one) — /stats shows whether they keep knocking
  if (by !== "telegram") await kv.set("tick:last", { at: Date.now(), by }).catch(() => {});

  const daily = async () => {
    const cfg = await assistantCfg();
    // the morning plan only in its first 4 hours (no "good morning" at 3 pm after a quiet night)
    const sinceMorning = cfg.morning ? mins(now.time) - mins(cfg.morning) : -1;
    if (sinceMorning >= 0 && sinceMorning < 240) {
      const key = `once:${now.date}:morning`;
      if (await kv.once(key))
        out.morning = await sendMorning(now.date).catch(async (e) => {
          await kv.del(key);
          throw e;
        });
    }
    if (cfg.report && now.time >= cfg.report) {
      const key = `once:${now.date}:report`;
      if (await kv.once(key)) {
        await sendReport(now.date).catch(async (e) => {
          await kv.del(key);
          throw e;
        });
        out.report = true;
      }
    }
    if (await kv.once(`once:${now.date}:cleanup`)) await cleanupRems();
  };

  const results = await Promise.allSettled([fireDue(Date.now() + ahead * 1000).then((n) => (out.fired = n)), daily()]);
  for (const r of results) if (r.status === "rejected") out.errors.push(String((r.reason as Error)?.message ?? r.reason).slice(0, 300));
  if (out.errors.length) console.error("[tick]", out.errors);
  return out;
}

/** "ostatnio: 1 min temu (komputer)" for /stats */
export async function tickLine() {
  const t = await kv.get<{ at: number; by: string }>("tick:last").catch(() => null);
  if (!t) return "⏱ Zegar asystenta: jeszcze nie ruszył";
  const min = Math.round((Date.now() - t.at) / 60_000);
  const who: Record<string, string> = { worker: "komputer", github: "GitHub", vercel: "Vercel", telegram: "Telegram" };
  return `⏱ Zegar asystenta: ${min < 1 ? "przed chwilą" : `${min} min temu`} (${who[t.by] ?? t.by})${min > 20 ? " ⚠️" : ""}`;
}
