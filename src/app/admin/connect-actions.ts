"use server";

import { requireAdmin } from "@/lib/auth";
import { isPublicHttps, runChecks, siteUrl, type Check } from "@/lib/health";
import { branded, sendEmail } from "@/lib/notify";
import { admins, notifyAdmins, tg } from "@/lib/bot/telegram";

/** "Połączenia": every service checked live (no secrets come back, only statuses and hints). */
export async function checkConnections(): Promise<Check[]> {
  await requireAdmin();
  return runChecks();
}

export async function testEmail(): Promise<{ ok: boolean; msg: string }> {
  await requireAdmin();
  const to = process.env.NOTIFY_EMAIL;
  if (!(process.env.RESEND_API_KEY || process.env.MAIL_WEBHOOK_URL) || !to) return { ok: false, msg: "Brakuje MAIL_WEBHOOK_URL (Make.com) albo RESEND_API_KEY, albo NOTIFY_EMAIL." };
  const ok = await sendEmail({
    to,
    subject: "Test z panelu: e-maile działają",
    html: branded("E-maile działają", "<p>To jest wiadomość testowa z panelu (Połączenia). Tak będą wyglądać powiadomienia o nowych zapytaniach i Twoje odpowiedzi do klientów.</p>"),
  });
  return ok ? { ok, msg: `Wysłane na ${to}. Sprawdź skrzynkę (i spam).` } : { ok, msg: "Resend nie przyjął wiadomości: sprawdź NOTIFY_FROM i weryfikację domeny." };
}

export async function testTelegram(): Promise<{ ok: boolean; msg: string }> {
  await requireAdmin();
  if (!process.env.TELEGRAM_BOT_TOKEN) return { ok: false, msg: "Brakuje TELEGRAM_BOT_TOKEN." };
  if (!admins().length) return { ok: false, msg: "Brakuje ADMIN_TELEGRAM_ID: napisz /start do bota, poda Twój numer." };
  try {
    await notifyAdmins("✅ <b>Test z panelu</b>\nBot jest połączony. Tu będą przychodzić nowe zapytania.");
    return { ok: true, msg: "Wysłane: sprawdź Telegram." };
  } catch (e) {
    return { ok: false, msg: (e as Error).message };
  }
}

/** Points Telegram at <site>/api/telegram (the same as `npm run bot:webhook`, from the published site). */
export async function connectWebhook(): Promise<{ ok: boolean; msg: string }> {
  await requireAdmin();
  const base = siteUrl();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!process.env.TELEGRAM_BOT_TOKEN || !secret) return { ok: false, msg: "Brakuje TELEGRAM_BOT_TOKEN albo TELEGRAM_WEBHOOK_SECRET." };
  if (!isPublicHttps(base)) return { ok: false, msg: "Webhook wymaga publicznego adresu https (NEXT_PUBLIC_SITE_URL). Lokalnie uruchom: npm run bot:dev" };
  try {
    await tg("setWebhook", { url: `${base}/api/telegram`, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
    await tg("setMyCommands", {
      commands: [
        { command: "start", description: "Co potrafię" },
        { command: "status", description: "Projekty, zapytania, dostępność" },
        { command: "stats", description: "Odwiedziny strony" },
      ],
    });
    return { ok: true, msg: `Bot słucha teraz ${base}/api/telegram` };
  } catch (e) {
    return { ok: false, msg: (e as Error).message };
  }
}
