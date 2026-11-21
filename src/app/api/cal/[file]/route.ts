import crypto from "node:crypto";
import { allRems, calToken, feedItems, ics } from "@/lib/assistant/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Claudio's calendar for his phone. /api/cal/<token>.ics = every reminder and meeting (subscribe once
 * on the iPhone / in Google Calendar); /api/cal/<token>-<id>.ics = one event ("🍏 iPhone / Outlook").
 * The token is derived from ADMIN_SECRET, so only links the bot gave him work.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = file.match(/^([a-f0-9]{24})(?:-([a-f0-9]{6}))?\.ics$/);
  const token = Buffer.from(calToken());
  if (!m || m[1].length !== token.length || !crypto.timingSafeEqual(Buffer.from(m[1]), token)) return new Response("Not found", { status: 404 });
  const list = m[2] ? (await allRems()).filter((r) => r.id === m[2] && r.status !== "cancelled") : await feedItems();
  if (m[2] && !list.length) return new Response("Not found", { status: 404 });
  return new Response(ics(list, !m[2]), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `inline; filename="${m[2] ? "termin" : "asystent"}.ics"`,
      "cache-control": "no-store",
    },
  });
}
