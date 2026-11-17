import { syncJob } from "@/lib/importer";
import { notifyAdmins, send, esc } from "@/lib/bot/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Called by scripts/import/run.mjs when an import ends: saves the project even if nobody has the
 * panel open, and tells Telegram (the chat that started it, or every admin).
 */
export async function POST(req: Request) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers.get("x-import-secret") !== secret) return new Response("Unauthorized", { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const job = await syncJob(id);
  if (!job) return new Response("not found", { status: 404 });
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const name = job.result?.name ?? job.facts?.name ?? job.source;
  const text =
    job.status === "done"
      ? `✅ <b>${esc(name)}</b> gotowy${job.publish ? " i już na stronie" : " (jako szkic)"}.\n${job.steps.filter((s) => s.note).map((s) => `• ${esc(s.note!)}`).join("\n")}`
      : `😕 Import „${esc(name)}” ${job.status === "cancelled" ? "anulowany" : `nie wyszedł: ${esc(job.error ?? "")}`}`;
  const link = /^https:/.test(site) && job.status === "done" ? [[{ text: "🌐 Zobacz", url: `${site}/pl/work/${job.result?.slug ?? job.slug}` }]] : undefined;
  if (job.notifyChat) await send(job.notifyChat, text, link).catch(() => {});
  else if (job.status === "done") await notifyAdmins(text, link);
  return Response.json({ ok: true });
}
