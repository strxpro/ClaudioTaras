// The site and the Telegram bot together, in one terminal:  npm run dev:all   (Ctrl+C stops both)
// The bot starts only when TELEGRAM_BOT_TOKEN is in .env.local, once the site answers on :3100.
import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const env = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";
const hasBot = /^\s*TELEGRAM_BOT_TOKEN\s*=\s*\S+/m.test(env) && /^\s*TELEGRAM_WEBHOOK_SECRET\s*=\s*\S+/m.test(env);
const kids = [];

function run(tag, color, args) {
  const p = spawn(process.execPath, args, { env: process.env });
  const out = (chunk) =>
    chunk
      .toString()
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((l) => console.log(`\x1b[${color}m${tag}\x1b[0m ${l}`));
  p.stdout.on("data", out);
  p.stderr.on("data", out);
  p.on("exit", (code) => console.log(`\x1b[${color}m${tag}\x1b[0m zakończone (${code})`));
  kids.push(p);
  return p;
}

run("[strona]", "36", ["node_modules/next/dist/bin/next", "dev", "-p", "3100"]);

if (hasBot) {
  const deadline = Date.now() + 120_000;
  const wait = async () => {
    for (;;) {
      try {
        await fetch("http://localhost:3100/api/telegram", { method: "GET", signal: AbortSignal.timeout(3000) });
        return true;
      } catch {
        if (Date.now() > deadline) return false;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  };
  wait().then((up) => (up ? run("[bot]   ", "35", ["scripts/bot-dev.mjs"]) : console.log("[bot] strona nie wystartowała, bot nie ruszył")));
} else {
  console.log("\x1b[35m[bot]\x1b[0m    brak TELEGRAM_BOT_TOKEN w .env.local: uruchom npm run setup:telegram");
}

const stop = () => {
  for (const p of kids) {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore" });
    else p.kill("SIGINT");
  }
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
