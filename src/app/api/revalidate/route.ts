import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

/** Refresh the site's cache after the bot changed content (called in a request of its own). */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) return new Response("Unauthorized", { status: 401 });
  revalidatePath("/", "layout");
  return Response.json({ ok: true });
}
