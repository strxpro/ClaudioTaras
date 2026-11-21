// Telegram Bot API for the worker (same bot, same token as src/lib/bot/telegram.ts).
export const admins = () =>
  (process.env.ADMIN_TELEGRAM_ID ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter(Boolean);

export const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

async function call(method, body) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return null;
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const j = await res.json().catch(() => ({}));
  // editing a message to the same text is not an error worth stopping for
  if (!j.ok && !/not modified/i.test(j.description ?? "")) throw new Error(`telegram ${method}: ${j.description ?? res.status}`);
  return j.result;
}

const keyboard = (rows) =>
  rows?.length ? { inline_keyboard: rows.map((r) => r.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data ?? "-" }))) } : undefined;

export async function send(chat, html, buttons) {
  const m = await call("sendMessage", { chat_id: chat, text: html.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true, reply_markup: keyboard(buttons) });
  return m?.message_id ?? null;
}

export const edit = (chat, id, html, buttons) =>
  call("editMessageText", { chat_id: chat, message_id: id, text: html.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true, reply_markup: keyboard(buttons) });
