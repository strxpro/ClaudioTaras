import type { Message } from "./types";

/**
 * E-mail via Resend's HTTP API (free tier is plenty for a portfolio). Every function is a no-op
 * without RESEND_API_KEY, so the site works the same with or without it.
 *  - notifyNewMessage: the new request to Claudio (NOTIFY_EMAIL)
 *  - sendClientAck:    automatic "thanks, I'll reply within 24h" to the client, in their language
 *  - sendReply:        Claudio's reply (from the admin panel or Telegram) in the branded template
 * Sender: NOTIFY_FROM, e.g. "Claudio Taras <ciao@yourdomain.com>" (domain verified in Resend).
 */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

/** Is any way of sending e-mail configured? (Resend, or a webhook such as a Make.com scenario) */
export const mailReady = () => !!(process.env.RESEND_API_KEY || process.env.MAIL_WEBHOOK_URL);

/**
 * Free alternative to Resend that needs no domain: MAIL_WEBHOOK_URL points at a Make.com scenario
 * (Custom webhook → Gmail "Send an email"), so mail goes out from your own Gmail. The JSON carries
 * to, subject, html, replyTo and fromName; MAIL_WEBHOOK_SECRET (optional) travels in the
 * x-mail-secret header so the scenario can ignore anything else (a Make filter on that header).
 */
async function sendViaWebhook(url: string, opts: { to: string; subject: string; html: string; replyTo?: string }) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(process.env.MAIL_WEBHOOK_SECRET ? { "x-mail-secret": process.env.MAIL_WEBHOOK_SECRET } : {}) },
    // the secret travels in the body too: Make shows body fields for mapping/filters without extra setup
    body: JSON.stringify({ to: opts.to, subject: opts.subject, html: opts.html, replyTo: opts.replyTo ?? process.env.NOTIFY_EMAIL ?? "", fromName: "Claudio Taras", secret: process.env.MAIL_WEBHOOK_SECRET ?? "" }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return !!res?.ok;
}

export async function sendEmail(opts: { to: string; subject: string; html: string; replyTo?: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return process.env.MAIL_WEBHOOK_URL ? sendViaWebhook(process.env.MAIL_WEBHOOK_URL, opts) : false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.NOTIFY_FROM ?? "Claudio Taras <onboarding@resend.dev>",
      to: [opts.to],
      reply_to: opts.replyTo ?? process.env.NOTIFY_EMAIL,
      subject: opts.subject,
      html: opts.html,
    }),
  });
  return res.ok;
}

/**
 * Branded e-mail, centred and calm: a paper background, one white card, the round CT. mark in the
 * middle, the title in a high-contrast serif (Didot / Bodoni / Playfair where the mail app has them,
 * Georgia otherwise), the text in a clean sans, a tangerine rule and a centred signature.
 * Tables + inline styles only, so it looks the same in Gmail, Apple Mail and Outlook.
 */
export function branded(title: string, bodyHtml: string, footer = "Claudio Taras · Web designer & developer") {
  const url = site();
  const serif = "Didot,'Bodoni 72','Bodoni MT','Playfair Display',Georgia,'Times New Roman',serif";
  const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI','Inter','Helvetica Neue',Arial,sans-serif";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#f2f0ec;-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0ec"><tr><td align="center" style="padding:40px 14px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td align="center" style="padding:0 0 22px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;border-radius:50%;background:#17131f;color:#f6f1ea;font:400 27px/64px ${serif};letter-spacing:-1px;text-align:center">CT<span style="color:#ff5a36">.</span></td></tr></table>
    </td></tr>
    <tr><td style="background:#ffffff;border-radius:28px;padding:44px 40px 36px;box-shadow:0 30px 70px -40px rgba(23,19,31,.35)">
      <div style="text-align:center;font:400 34px/1.05 ${serif};color:#17131f;text-transform:uppercase;letter-spacing:-.01em">${esc(title)}</div>
      <div style="width:44px;height:2px;margin:22px auto 26px;background:#ff5a36;line-height:2px;font-size:0">&nbsp;</div>
      <div style="font:400 16px/1.65 ${sans};color:#2a2533;text-align:center">${bodyHtml}</div>
    </td></tr>
    <tr><td align="center" style="padding:28px 10px 0;font:400 14px/1.6 ${sans};color:#6b6475">
      <div style="font:400 20px/1.2 ${serif};color:#17131f">Claudio Taras</div>
      <div style="margin-top:2px">${esc(footer)}</div>
      ${url ? `<div style="margin-top:10px"><a href="${url}" style="color:#e8431f;text-decoration:none;border-bottom:1px solid #f3b4a3">${url.replace(/^https?:\/\//, "")}</a></div>` : ""}
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

export async function notifyNewMessage(m: Message) {
  const to = process.env.NOTIFY_EMAIL;
  if (!to) return;
  const rows = [
    ["Name", m.name],
    ["E-mail", m.email],
    ["Company", m.company ?? ""],
    ["Phone", m.phone ?? ""],
    ["Website", m.website ?? ""],
    ["Services", m.services.join(", ")],
    ["Budget", m.budget],
    ["Timeline", m.timeline],
    ["Language", m.locale],
    ["Call", m.meeting ? `${m.meeting} (CET)` : ""],
  ]
    .filter(([, v]) => v && v !== "—")
    .map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#8a8494">${k}</td><td>${esc(v)}</td></tr>`)
    .join("");
  const files = (m.attachments ?? []).map((u) => `<a href="${u.startsWith("http") ? u : site() + u}">${esc(u.split("/").pop() ?? u)}</a>`).join("<br>");
  await sendEmail({
    to,
    replyTo: m.email,
    subject: `Nuovo progetto — ${m.name}`,
    html: branded("Nuova richiesta", `<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 18px;text-align:left;font-size:15px">${rows}</table><div style="margin:0 auto;max-width:420px;padding:16px 18px;border-radius:16px;background:#f6f3ee;white-space:pre-line;text-align:left">${esc(m.message)}</div>${files ? `<p style="margin-top:18px">${files}</p>` : ""}`),
  });
}

const ACK: Record<string, { subject: string; title: string; body: string }> = {
  it: { subject: "Ho ricevuto la tua richiesta", title: "Grazie, ci sentiamo presto", body: "Ciao! Ho ricevuto la tua richiesta e la sto già leggendo. Ti rispondo entro 24 ore con le prime idee.<br><br>Se hai fretta puoi rispondere direttamente a questa email." },
  en: { subject: "I got your request", title: "Thanks, talk soon", body: "Hi! Your request just landed and I'm already reading it. I'll get back to you within 24 hours with first ideas.<br><br>In a hurry? Just reply to this email." },
  pl: { subject: "Dostałem twoje zapytanie", title: "Dzięki, odezwę się szybko", body: "Cześć! Twoje zapytanie właśnie do mnie dotarło i już je czytam. Odpiszę w ciągu 24 godzin z pierwszymi pomysłami.<br><br>Jeśli się śpieszysz, po prostu odpowiedz na tego maila." },
  es: { subject: "He recibido tu solicitud", title: "Gracias, hablamos pronto", body: "¡Hola! Tu solicitud acaba de llegar y ya la estoy leyendo. Te respondo en menos de 24 horas con las primeras ideas.<br><br>¿Prisa? Responde a este email." },
  de: { subject: "Deine Anfrage ist angekommen", title: "Danke, bis bald", body: "Hallo! Deine Anfrage ist gerade angekommen und ich lese sie schon. Ich melde mich innerhalb von 24 Stunden mit ersten Ideen.<br><br>Eilig? Antworte einfach auf diese E-Mail." },
  fr: { subject: "J'ai bien reçu ta demande", title: "Merci, à très vite", body: "Salut ! Ta demande vient d'arriver et je la lis déjà. Je te réponds sous 24 heures avec mes premières idées.<br><br>Pressé ? Réponds simplement à cet email." },
};

export async function sendClientAck(m: Message) {
  const t = ACK[m.locale] ?? ACK.en;
  await sendEmail({ to: m.email, subject: t.subject, html: branded(t.title, t.body) });
}

const REPLY_TITLE: Record<string, string> = { it: "La mia risposta", en: "My reply", pl: "Moja odpowiedź", es: "Mi respuesta", de: "Meine Antwort", fr: "Ma réponse" };

export async function sendReply(m: Message, text: string): Promise<boolean> {
  const body = esc(text).replace(/\n/g, "<br>");
  const quote = `<div style="margin-top:22px;padding:14px 16px;border-left:3px solid #ffb39a;background:#fff7f3;color:#6b6475;font-size:14px;white-space:pre-line">${esc(m.message.slice(0, 600))}</div>`;
  return sendEmail({ to: m.email, subject: `Re: ${m.services.join(", ") || "Il tuo progetto"}`, html: branded(REPLY_TITLE[m.locale] ?? REPLY_TITLE.en, body + quote) });
}
