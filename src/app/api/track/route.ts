import crypto from "node:crypto";
import { NextResponse, after } from "next/server";
import { analytics } from "@/lib/db";

/**
 * Anonymous page view. No cookie and no IP is stored: the visitor id is a hash of ip + user agent +
 * the day + a server secret, so it only lets us count unique visitors per day.
 */
export async function POST(request: Request) {
  let body: { path?: string; locale?: string; ref?: string; w?: number };
  try {
    body = JSON.parse(await request.text());
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const ua = request.headers.get("user-agent") ?? "";
  if (/bot|crawl|spider|slurp|preview|lighthouse|headless/i.test(ua)) return new NextResponse(null, { status: 204 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  const day = new Date().toISOString().slice(0, 10);
  const visitor = crypto.createHash("sha256").update(`${ip}|${ua}|${day}|${process.env.ADMIN_SECRET ?? "ct"}`).digest("hex").slice(0, 16);
  const w = Number(body.w) || 1280;
  let referrer: string | undefined;
  try {
    const host = body.ref ? new URL(body.ref).hostname.replace(/^www\./, "") : "";
    if (host && host !== new URL(request.url).hostname) referrer = host;
  } catch {}
  const view = {
    at: new Date().toISOString(),
    path: String(body.path ?? "/").slice(0, 200),
    locale: String(body.locale ?? "").slice(0, 5),
    country: (request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry") ?? undefined)?.toUpperCase(),
    device: (w < 768 ? "mobile" : w < 1100 ? "tablet" : "desktop") as "mobile" | "tablet" | "desktop",
    referrer,
    visitor,
  };
  after(() => analytics.track(view).catch((e) => console.error("[track]", e)));
  return new NextResponse(null, { status: 204 });
}
