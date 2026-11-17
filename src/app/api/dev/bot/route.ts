import { isAdmin } from "@/lib/auth";
import { describe, execute, think, undo } from "@/lib/bot/agent";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Local test of the bot without Telegram (dev only, logged-in admin):
 *   POST {"text":"…"}               → the plan (nothing applied)
 *   POST {"text":"…","apply":true}  → plan + applied, as if ✅ was tapped
 *   POST {"undo":true}              → revert the last applied change
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" || !(await isAdmin())) return new Response("Not found", { status: 404 });
  try {
    const body = (await req.json()) as { text?: string; apply?: boolean; undo?: boolean };
    if (body.undo) return Response.json({ result: await undo() });
    const t = await think(body.text ?? "", 0);
    const projects = await db.projects({ all: true });
    const plan = t.actions.map((a) => describe(a, projects));
    const applied = body.apply && t.actions.length ? await execute(t.actions, { chatId: 0, origin: new URL(req.url).origin }) : undefined;
    return Response.json({ ...t, plan, applied });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
