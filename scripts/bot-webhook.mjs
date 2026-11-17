// Connect the Telegram bot to the published site: Telegram will POST every message to
// <NEXT_PUBLIC_SITE_URL>/api/telegram (or the URL given as the first argument).
//   npm run bot:webhook            → uses NEXT_PUBLIC_SITE_URL from .env.local
//   npm run bot:webhook https://…  → another address
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
const base = (process.argv[2] || env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
if (!token || !secret || !/^https:\/\//.test(base)) {
  console.error("Potrzebne: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET i adres https strony (NEXT_PUBLIC_SITE_URL). Instrukcja: TELEGRAM.md");
  process.exit(1);
}
const api = async (method, body) =>
  (await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) })).json();

const r = await api("setWebhook", { url: `${base}/api/telegram`, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
await api("setMyCommands", {
  commands: [
    { command: "start", description: "Co potrafię" },
    { command: "status", description: "Projekty, zapytania, dostępność" },
  ],
});
console.log(r.ok ? `✅ Bot podłączony do ${base}/api/telegram` : `❌ ${r.description}`);
