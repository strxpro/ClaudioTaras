import { NextResponse, after } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { db, storeUpload } from "@/lib/db";
import { notifyNewMessage, sendClientAck } from "@/lib/notify";
import { notifyMessage } from "@/lib/bot/handle";

const schema = z.object({
  services: z.array(z.string().max(80)).min(1).max(10),
  budget: z.string().max(80),
  timeline: z.string().max(80),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(160).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  website: z.string().trim().max(300).optional().default(""),
  message: z.string().trim().min(5).max(5000),
  locale: z.string().max(5).default("en"),
  hp: z.string().optional().default(""),
  meeting: z.string().max(40).optional().default(""),
});

// Naive in-memory rate limit: 5 requests / 10 min per IP (good enough for a single instance).
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });

  // JSON, or multipart with the same fields in "payload" plus an optional "file" (image / PDF, max 8 MB)
  let body: unknown;
  let files: File[] = [];
  try {
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await request.formData();
      body = JSON.parse(String(form.get("payload") ?? "{}"));
      files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 6);
    } else body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (files.some((file) => file.size > 8 * 1024 * 1024 || !/^(image\/(png|jpe?g|webp|gif|avif)|application\/pdf)$/.test(file.type))) {
    return NextResponse.json({ ok: false, error: "file" }, { status: 413 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid" }, { status: 422 });
  const data = parsed.data;
  // Honeypot filled → pretend success, store nothing.
  if (data.hp) return NextResponse.json({ ok: true });

  const attachments: string[] = [];
  for (const file of files) {
    try {
      attachments.push(await storeUpload(file, "inbox"));
    } catch (e) {
      console.error("[contact] upload", e);
    }
  }

  const message = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "new" as const,
    locale: data.locale,
    services: data.services,
    budget: data.budget,
    timeline: data.timeline,
    name: data.name,
    email: data.email,
    company: data.company,
    phone: data.phone,
    website: data.website,
    message: data.message,
    ...(data.meeting ? { meeting: data.meeting } : {}),
    ...(attachments.length ? { attachments } : {}),
  };
  await db.saveMessage(message);
  // e-mail (Resend) and Telegram — after the response, the visitor never waits for them
  after(async () => {
    await Promise.all([
      notifyNewMessage(message).catch(() => {}),
      sendClientAck(message).catch(() => {}),
      Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, bytes: await f.arrayBuffer() })))
        .then((uploads) => notifyMessage(message, uploads))
        .catch((e) => console.error("[telegram] contact", e)),
    ]);
  });
  return NextResponse.json({ ok: true });
}
