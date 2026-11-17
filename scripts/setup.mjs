// Interactive setup: asks for each key, checks it live against the service and writes .env.local.
//   npm run setup              → everything, one step after another (Enter keeps the current value)
//   npm run setup:telegram     → only the Telegram bot (also: ai | supabase | email | admin | site)
// Talks only to the services themselves (Groq, Telegram, your Supabase URL, Resend). Nothing else is sent anywhere.
import fs from "node:fs";
import crypto from "node:crypto";
import readline from "node:readline";
import { spawnSync } from "node:child_process";

const FILE = ".env.local";
if (!fs.existsSync(FILE) && fs.existsSync(".env.example")) fs.copyFileSync(".env.example", FILE);
let text = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : "";

const parse = () =>
  Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
  );
const E = () => parse();
const PLACEHOLDER = /^(choose-a-strong-password|at-least-32-random-characters|https:\/\/your-domain\.com)$/;
const val = (k) => (PLACEHOLDER.test(E()[k] ?? "") ? "" : (E()[k] ?? ""));

function set(key, value) {
  const v = /[\s#"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
  const line = `${key}=${v}`;
  const active = new RegExp(`^[ \\t]*${key}[ \\t]*=.*$`, "m");
  text = active.test(text) ? text.replace(active, line) : text.replace(/\s*$/, "\n") + line + "\n";
  fs.writeFileSync(FILE, text);
}

/* ---------------- terminal ---------------- */
const c = { dim: (s) => `\x1b[2m${s}\x1b[0m`, ok: (s) => `\x1b[32m${s}\x1b[0m`, bad: (s) => `\x1b[31m${s}\x1b[0m`, warn: (s) => `\x1b[33m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m` };
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
let muted = false;
const write = rl._writeToOutput?.bind(rl);
if (write)
  rl._writeToOutput = (s) => {
    if (!muted) return write(s);
    if (s.includes("\n")) return write("\n");
    write("•".repeat(Math.min(s.length, 3)));
  };
// lines are queued, so answers piped in (or typed ahead) are never lost between questions
const lines = [];
let waiter = null;
let closed = false;
rl.on("line", (l) => (waiter ? (waiter(l), (waiter = null)) : lines.push(l)));
rl.on("close", () => {
  closed = true;
  if (waiter) waiter(""), (waiter = null);
});
const nextLine = () => new Promise((res) => (lines.length ? res(lines.shift()) : closed ? res("") : (waiter = res)));
const ask = async (q, { secret = false, def = "" } = {}) => {
  const hint = def ? c.dim(secret ? ` [Enter = zostaw …${def.slice(-4)}]` : ` [Enter = ${def}]`) : c.dim(" [Enter = pomiń]");
  rl.setPrompt(`   ${q}${hint}: `);
  rl.prompt();
  muted = secret;
  const a = await nextLine();
  muted = false;
  if (!process.stdin.isTTY) process.stdout.write("\n");
  return a.trim() || def;
};
const yes = async (q, def = true) => {
  const a = (await ask(`${q} ${def ? "(T/n)" : "(t/N)"}`)).toLowerCase();
  return a ? a.startsWith("t") || a.startsWith("y") : def;
};
const step = (n, title) => console.log(`\n${c.b(`${n}  ${title}`)}`);
const say = (s) => console.log(`   ${s}`);
const rand = (n = 24) => crypto.randomBytes(n).toString("hex");
const j = async (url, init = {}) => {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, body };
};

/* ---------------- steps ---------------- */
async function ai() {
  step("1/6", "AI: teksty, tłumaczenia, mózg bota, głosówki (Groq, za darmo)");
  say(c.dim("Klucz: https://console.groq.com/keys → zaloguj się → Create API Key (zaczyna się od gsk_)"));
  for (;;) {
    const k = await ask("GROQ_API_KEY", { secret: true, def: val("GROQ_API_KEY") });
    if (!k) return say(c.warn("pominięte: AI działa tylko na wolnym, darmowym zapasie"));
    const r = await j("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${k}` } }).catch((e) => ({ ok: false, status: e.message }));
    if (r.ok) {
      set("GROQ_API_KEY", k);
      const whisper = (r.body.data ?? []).some((m) => /whisper/.test(m.id));
      return say(c.ok(`✓ Groq działa${whisper ? " (także głosówki)" : ""}`));
    }
    say(c.bad(`✗ Groq odrzucił klucz (${r.status}). Skopiuj go jeszcze raz.`));
  }
}

async function telegram() {
  step("2/6", "Bot Telegram");
  say(c.dim("W Telegramie: @BotFather → /newbot → nazwa (np. Claudio Portfolio) → login kończący się na _bot → skopiuj token"));
  let me;
  let token;
  for (;;) {
    token = await ask("TELEGRAM_BOT_TOKEN", { secret: true, def: val("TELEGRAM_BOT_TOKEN") });
    if (!token) return say(c.warn("pominięte"));
    me = await j(`https://api.telegram.org/bot${token}/getMe`).catch(() => ({ ok: false, body: {} }));
    if (me.ok && me.body.ok) break;
    say(c.bad(`✗ Telegram nie przyjął tokenu (${me.body?.description ?? "brak połączenia"})`));
  }
  const bot = me.body.result.username;
  set("TELEGRAM_BOT_TOKEN", token);
  say(c.ok(`✓ Bot @${bot} odpowiada`));
  if (!val("TELEGRAM_WEBHOOK_SECRET")) {
    set("TELEGRAM_WEBHOOK_SECRET", rand());
    say(c.ok("✓ Wylosowałem TELEGRAM_WEBHOOK_SECRET"));
  }
  const tg = (method, body) => j(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

  if (val("ADMIN_TELEGRAM_ID") && !(await yes(`Twoje ID jest już ustawione (${val("ADMIN_TELEGRAM_ID")}). Odczytać je jeszcze raz?`, false))) return;
  const hook = (await tg("getWebhookInfo")).body.result;
  if (hook?.url) {
    say(c.warn(`Bot jest podłączony do ${hook.url}. Żeby odczytać Twoje ID, odłączę go na chwilę`));
    say(c.warn("(potem: panel → Połączenia → „Podłącz webhook” albo npm run bot:webhook)."));
    if (!(await yes("Kontynuować?"))) return;
    await tg("deleteWebhook", { drop_pending_updates: false });
  }
  // skip anything that arrived before now
  const old = (await tg("getUpdates", { timeout: 0 })).body.result ?? [];
  let offset = old.length ? old[old.length - 1].update_id + 1 : 0;
  say(`Otwórz ${c.b(`https://t.me/${bot}`)} i wyślij ${c.b("/start")} (czekam do 3 minut)…`);
  const until = Date.now() + 180_000;
  while (Date.now() < until) {
    const r = await tg("getUpdates", { offset, timeout: 25, allowed_updates: ["message"] }).catch(() => ({ body: {} }));
    for (const u of r.body.result ?? []) {
      offset = u.update_id + 1;
      const from = u.message?.from;
      if (!from) continue;
      set("ADMIN_TELEGRAM_ID", String(from.id));
      await tg("getUpdates", { offset, timeout: 0 });
      await tg("sendMessage", { chat_id: from.id, text: "✅ Połączone z portfolio. Tutaj będą przychodzić nowe zapytania. Uruchom stronę z botem: npm run dev:all" });
      return say(c.ok(`✓ Cześć ${from.first_name ?? ""}! ADMIN_TELEGRAM_ID = ${from.id} (bot wysłał Ci potwierdzenie)`));
    }
  }
  say(c.warn("Nie przyszła żadna wiadomość. Uruchom ponownie: npm run setup:telegram"));
}

async function supabase() {
  step("3/6", "Baza danych: Supabase (wymagana po publikacji na Vercelu)");
  say(c.dim("supabase.com/dashboard → New project (region Frankfurt) → Project Settings → API Keys"));
  const url = (await ask("SUPABASE_URL (https://xxxx.supabase.co)", { def: val("SUPABASE_URL") })).replace(/\/$/, "");
  if (!url) return say(c.warn("pominięte: zostaje baza lokalna (.data/db.json)"));
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) say(c.warn("Adres zwykle wygląda tak: https://abcdefgh.supabase.co"));
  set("SUPABASE_URL", url);
  const ref = url.match(/https:\/\/([a-z0-9-]+)\./)?.[1];
  say(c.dim('Klucz: zakładka „Legacy API keys” → service_role → Reveal (zaczyna się od eyJ). Nie anon!'));
  for (;;) {
    const key = await ask("SUPABASE_SERVICE_ROLE_KEY", { secret: true, def: val("SUPABASE_SERVICE_ROLE_KEY") });
    if (!key) return say(c.warn("pominięte"));
    if (/^sb_publishable_/.test(key) || /anon/.test(Buffer.from(key.split(".")[1] ?? "", "base64").toString())) {
      say(c.bad("✗ To klucz publiczny (anon/publishable). Potrzebny jest service_role."));
      continue;
    }
    const r = await j(`${url}/rest/v1/projects?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }).catch((e) => ({ status: e.message, body: {} }));
    if (r.status === 401 || r.status === 403) {
      say(c.bad(`✗ Supabase odrzucił klucz (${r.status}).`));
      continue;
    }
    set("SUPABASE_SERVICE_ROLE_KEY", key);
    if (r.ok) say(c.ok("✓ Połączono, tabele są gotowe"));
    else {
      say(c.warn("Klucz działa, ale brakuje tabel. Wklej i uruchom (Run) po kolei w SQL Editor:"));
      say(`   ${c.b(`https://supabase.com/dashboard/project/${ref}/sql/new`)}`);
      say("   1) supabase/schema.sql   2) supabase/migrations/20261106_analytics_realtime.sql");
      await ask("Naciśnij Enter, gdy oba się wykonają");
      const again = await j(`${url}/rest/v1/projects?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }).catch(() => ({ ok: false }));
      say(again.ok ? c.ok("✓ Tabele są") : c.bad("✗ Nadal brak tabel; uruchom npm run setup -- supabase jeszcze raz po wykonaniu SQL"));
      if (!again.ok) return;
    }
    if (fs.existsSync(".data/db.json") && (await yes("Przenieść projekty, wiadomości i ustawienia z tego komputera do Supabase?"))) {
      spawnSync(process.execPath, ["--env-file=.env.local", "scripts/db-push.mjs"], { stdio: "inherit" });
    }
    return;
  }
}

async function email() {
  step("4/6", "E-maile: Resend (powiadomienia, „dziękuję” do klienta, Twoje odpowiedzi)");
  say(c.dim("resend.com → Domains → Add domain (rekordy DNS u dostawcy domeny) → API Keys → Create API key"));
  let key;
  let domains = [];
  for (;;) {
    key = await ask("RESEND_API_KEY", { secret: true, def: val("RESEND_API_KEY") });
    if (!key) return say(c.warn("pominięte: zapytania zobaczysz w panelu i na Telegramie"));
    const r = await j("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } }).catch((e) => ({ status: e.message, body: {} }));
    if (r.ok || r.body?.name === "restricted_api_key") {
      domains = r.body.data ?? [];
      set("RESEND_API_KEY", key);
      say(c.ok(`✓ Resend działa${domains.length ? `; domeny: ${domains.map((d) => `${d.name} (${d.status})`).join(", ")}` : ""}`));
      break;
    }
    say(c.bad(`✗ Resend odrzucił klucz (${r.status})`));
  }
  const to = await ask("NOTIFY_EMAIL (na ten adres przychodzą zapytania)", { def: val("NOTIFY_EMAIL") });
  if (to) set("NOTIFY_EMAIL", to);
  const verified = domains.find((d) => d.status === "verified")?.name;
  const from = await ask("NOTIFY_FROM (nadawca)", { def: val("NOTIFY_FROM") || (verified ? `Claudio Taras <ciao@${verified}>` : "Claudio Taras <onboarding@resend.dev>") });
  set("NOTIFY_FROM", from);
  if (!verified) say(c.warn("Domena nie jest jeszcze zweryfikowana: do tego czasu Resend wysyła tylko na adres Twojego konta."));
  if (to && (await yes(`Wysłać testowy e-mail na ${to}?`))) {
    const r = await j("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: "Test: e-maile z portfolio działają", html: "<p>To jest test z <b>npm run setup</b>. Tak będą przychodzić nowe zapytania.</p>" }),
    }).catch((e) => ({ ok: false, body: { message: e.message } }));
    say(r.ok ? c.ok("✓ Wysłany. Sprawdź skrzynkę (i spam).") : c.bad(`✗ ${r.body?.message ?? "nie wysłano"}`));
  }
}

async function admin() {
  step("5/6", "Panel admina");
  const pw = val("ADMIN_PASSWORD");
  if (!pw || pw.length < 10 || /password|admin|1234|choose/i.test(pw)) {
    for (;;) {
      const p = await ask("Nowe hasło do panelu (min. 10 znaków, bez $)", { secret: true });
      if (!p) {
        say(c.warn("pominięte: zmień hasło przed publikacją"));
        break;
      }
      if (p.length < 10 || p.includes("$")) {
        say(c.bad("Za krótkie albo zawiera $"));
        continue;
      }
      set("ADMIN_PASSWORD", p);
      say(c.ok("✓ Hasło zapisane"));
      break;
    }
  } else say(c.ok("✓ Hasło ustawione"));
  if ((val("ADMIN_SECRET") ?? "").length < 32) {
    set("ADMIN_SECRET", rand(32));
    say(c.ok("✓ Wylosowałem ADMIN_SECRET"));
  } else say(c.ok("✓ ADMIN_SECRET ustawiony"));
}

async function site() {
  step("6/6", "Adres strony (po publikacji)");
  const url = (await ask("NEXT_PUBLIC_SITE_URL (np. https://claudiotaras.com)", { def: val("NEXT_PUBLIC_SITE_URL") })).replace(/\/$/, "");
  if (!url) return say(c.dim("pominięte: wróć tu po podpięciu domeny w Vercelu"));
  set("NEXT_PUBLIC_SITE_URL", url);
  const token = val("TELEGRAM_BOT_TOKEN");
  if (/^https:\/\//.test(url) && !/localhost/.test(url) && token && (await yes("Strona już działa pod tym adresem? Podłączyć do niej bota (webhook)?", false))) {
    const r = await j(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: `${url}/api/telegram`, secret_token: val("TELEGRAM_WEBHOOK_SECRET"), allowed_updates: ["message", "callback_query"], drop_pending_updates: true }),
    });
    say(r.body.ok ? c.ok(`✓ Bot słucha ${url}/api/telegram`) : c.bad(`✗ ${r.body.description}`));
  }
}

/* ---------------- run ---------------- */
const STEPS = { ai, telegram, supabase, email, admin, site };
const only = process.argv.slice(2).filter((a) => STEPS[a]);
console.log(c.b("\nPodłączanie portfolio") + c.dim(`  ·  zapisuję do ${FILE}  ·  Enter = pomiń / zostaw`));
try {
  for (const name of only.length ? only : Object.keys(STEPS)) await STEPS[name]();
} finally {
  const e = E();
  const row = (label, ok) => console.log(`   ${ok ? c.ok("●") : c.dim("○")} ${label}`);
  console.log(`\n${c.b("Stan")}`);
  row("AI (Groq)", !!e.GROQ_API_KEY);
  row("Telegram", !!(e.TELEGRAM_BOT_TOKEN && e.ADMIN_TELEGRAM_ID));
  row("Supabase", !!(e.SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY));
  row("E-maile", !!e.RESEND_API_KEY);
  row("Panel", !!e.ADMIN_SECRET && (e.ADMIN_SECRET ?? "").length >= 32);
  console.log(`\n   Dalej: ${c.b("npm run dev:all")} ${c.dim("(strona + bot Telegram razem; zatrzymaj Ctrl+C)")}`);
  console.log(`   Podgląd na żywo: ${c.b("http://localhost:3100/admin/connect")}\n`);
  rl.close();
}
