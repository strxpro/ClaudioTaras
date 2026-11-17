// Telegram bot on your own computer, no deployment needed: polls Telegram for new messages and hands
// each one to the local site (http://localhost:3100/api/telegram), exactly like the webhook would.
//   npm run dev        (in one terminal)
//   npm run bot:dev    (in another)
// Note: polling turns the webhook off — after testing, run `npm run bot:webhook` for the live site.
import fs from "node:fs";

const env = { ...Object.fromEntries(
  (fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
), ...process.env };

const token = env.TELEGRAM_BOT_TOKEN;
const secret = env.TELEGRAM_WEBHOOK_SECRET;
const target = `http://localhost:${env.PORT || 3100}/api/telegram`;
if (!token || !secret) {
  console.error("Brak TELEGRAM_BOT_TOKEN albo TELEGRAM_WEBHOOK_SECRET w .env.local — instrukcja w TELEGRAM.md");
  process.exit(1);
}
const api = async (method, body) => {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  return r.json();
};

const me = await api("getMe");
if (!me.ok) {
  console.error("Telegram nie przyjął tokenu:", me.description);
  process.exit(1);
}
await api("deleteWebhook", { drop_pending_updates: false });
console.log(`🤖 @${me.result.username} słucha — wiadomości trafiają do ${target} (Ctrl+C, aby zakończyć)`);

let offset = 0;
for (;;) {
  try {
    const r = await api("getUpdates", { offset, timeout: 30, allowed_updates: ["message", "callback_query"] });
    for (const u of r.result ?? []) {
      offset = u.update_id + 1;
      const what = u.message?.voice ? "🎙️ głosówka" : u.message?.photo ? "🖼️ zdjęcie" : u.message?.text ? `💬 ${u.message.text.slice(0, 60)}` : u.callback_query ? `🔘 ${u.callback_query.data}` : "update";
      console.log(new Date().toLocaleTimeString("pl-PL"), what);
      await fetch(target, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify(u) }).catch((e) =>
        console.error("Strona nie odpowiada — czy działa `npm run dev`?", e.message),
      );
    }
  } catch (e) {
    console.error("Telegram:", e.message);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
