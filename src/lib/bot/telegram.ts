import "server-only";

/** Thin Telegram Bot API client (fetch only). TELEGRAM_BOT_TOKEN from @BotFather. */
export type Button = { text: string; data?: string; url?: string };

export const botEnabled = () => Boolean(process.env.TELEGRAM_BOT_TOKEN);

/** Telegram user ids allowed to use the bot (ADMIN_TELEGRAM_ID="123" or "123,456"). */
export const admins = () =>
  (process.env.ADMIN_TELEGRAM_ID ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter(Boolean);

export const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description ?? res.status}`);
  return j.result as T;
}

const keyboard = (rows?: Button[][]) =>
  rows?.length ? { inline_keyboard: rows.map((r) => r.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data ?? "-" }))) } : undefined;

export async function send(chatId: number, html: string, buttons?: Button[][]) {
  const m = await tg<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text: html.slice(0, 4000),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard(buttons),
  });
  return m.message_id;
}

export async function edit(chatId: number, messageId: number, html: string, buttons?: Button[][]) {
  await tg("editMessageText", { chat_id: chatId, message_id: messageId, text: html.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true, reply_markup: keyboard(buttons) }).catch(() => {});
}

export const answer = (id: string, text?: string) => tg("answerCallbackQuery", { callback_query_id: id, text }).catch(() => {});

/** Keep "typing…" on while `work` runs (Telegram clears it after ~5 s). */
export async function typing<T>(chatId: number, work: () => Promise<T>): Promise<T> {
  const ping = () => tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  void ping();
  const t = setInterval(ping, 4500);
  try {
    return await work();
  } finally {
    clearInterval(t);
  }
}

export async function download(fileId: string) {
  const f = await tg<{ file_path: string }>("getFile", { file_id: fileId });
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${f.file_path}`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`download ${res.status}`);
  return { bytes: await res.arrayBuffer(), path: f.file_path };
}

export type Upload = { name: string; type: string; bytes: ArrayBuffer };

/** Multipart call (files go up as bytes, so they work from localhost too). */
async function tgForm<T = unknown>(method: string, form: FormData): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", body: form, signal: AbortSignal.timeout(60_000) });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description ?? res.status}`);
  return j.result as T;
}

/**
 * Files a visitor attached, straight into the chat: photos as one album you can swipe through
 * (or a single photo), PDFs and anything else as documents you can download.
 */
export async function sendUploads(chatId: number, files: Upload[], caption: string) {
  const photos = files.filter((f) => /^image\/(png|jpe?g|webp)$/.test(f.type)).slice(0, 10);
  const docs = files.filter((f) => !photos.includes(f));
  if (photos.length === 1) {
    const form = new FormData();
    form.set("chat_id", String(chatId));
    form.set("caption", caption);
    form.set("photo", new Blob([photos[0].bytes], { type: photos[0].type }), photos[0].name);
    await tgForm("sendPhoto", form);
  } else if (photos.length > 1) {
    const form = new FormData();
    form.set("chat_id", String(chatId));
    form.set("media", JSON.stringify(photos.map((p, i) => ({ type: "photo", media: `attach://p${i}`, ...(i === 0 ? { caption } : {}) }))));
    photos.forEach((p, i) => form.set(`p${i}`, new Blob([p.bytes], { type: p.type }), p.name));
    await tgForm("sendMediaGroup", form);
  }
  for (const d of docs) {
    const form = new FormData();
    form.set("chat_id", String(chatId));
    form.set("caption", caption);
    form.set("document", new Blob([d.bytes], { type: d.type || "application/octet-stream" }), d.name);
    await tgForm("sendDocument", form);
  }
}

/** Message every admin (new contact requests, finished imports…). Silent no-op without a bot. */
export async function notifyAdmins(html: string, buttons?: Button[][]) {
  if (!botEnabled()) return;
  await Promise.all(admins().map((id) => send(id, html, buttons).catch((e) => console.error("[telegram] notify", e))));
}
