import "server-only";
import { ask, aiProviders } from "./ai";
import { usingSupabase } from "./db";
import { admins } from "./bot/telegram";

/**
 * Live checks for the admin "Połączenia" page: is each outside service configured, and does it
 * actually answer? Every check has its own timeout and never throws; secrets never leave the server
 * (only names of missing variables and short, human messages are returned).
 */
export type Level = "ok" | "warn" | "off" | "error";
export type Check = {
  id: "site" | "db" | "telegram" | "ai" | "voice" | "email" | "worker";
  level: Level;
  title: string;
  /** one line: what works or what is wrong */
  summary: string;
  /** extra facts shown under the summary */
  details?: string[];
  /** env variables still to set */
  missing?: string[];
};

const env = (k: string) => (process.env[k] ?? "").trim();
const missingOf = (keys: string[]) => keys.filter((k) => !env(k));
const timeout = (ms: number) => AbortSignal.timeout(ms);
const siteUrl = () => env("NEXT_PUBLIC_SITE_URL").replace(/\/$/, "");
const isPublicHttps = (u: string) => /^https:\/\//.test(u) && !/localhost|127\.0\.0\.1|your-domain/.test(u);

async function site(): Promise<Check> {
  const url = siteUrl();
  const weakPassword = !env("ADMIN_PASSWORD") || /choose|password|admin|1234/i.test(env("ADMIN_PASSWORD"));
  const details = [url ? `Adres: ${url}` : "Adres strony nie jest ustawiony"];
  if (weakPassword) details.push("Hasło panelu wygląda na domyślne: zmień ADMIN_PASSWORD na własne.");
  if (env("ADMIN_SECRET").length < 32) details.push("ADMIN_SECRET powinien mieć 32+ losowe znaki.");
  const level: Level = !url || weakPassword || env("ADMIN_SECRET").length < 32 ? "warn" : isPublicHttps(url) ? "ok" : "warn";
  return {
    id: "site",
    level,
    title: "Strona i panel",
    summary: isPublicHttps(url) ? "Adres publiczny ustawiony" : "Działa lokalnie: po publikacji wpisz adres https domeny",
    details,
    missing: missingOf(["NEXT_PUBLIC_SITE_URL", "ADMIN_PASSWORD", "ADMIN_SECRET"]),
  };
}

async function database(): Promise<Check> {
  const missing = missingOf(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  if (!usingSupabase)
    return {
      id: "db",
      level: "warn",
      title: "Baza danych",
      summary: "Baza lokalna (.data/db.json): działa na tym komputerze, na Vercelu potrzebna jest Supabase",
      missing,
    };
  const base = env("SUPABASE_URL").replace(/\/$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const count = async (table: string) => {
    const res = await fetch(`${base}/rest/v1/${table}?select=id`, {
      method: "HEAD",
      headers: { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}), Prefer: "count=exact" },
      cache: "no-store",
      signal: timeout(8000),
    });
    if (!res.ok) throw new Error(`${table}: ${res.status}`);
    return Number(res.headers.get("content-range")?.split("/")[1] ?? 0);
  };
  try {
    const [projects, messages] = await Promise.all([count("projects"), count("messages")]);
    const views = await count("page_views").catch(() => -1);
    const details = [`Projekty: ${projects}`, `Wiadomości: ${messages}`];
    if (views < 0) details.push("Brak tabeli page_views: uruchom supabase/migrations/20261106_analytics_realtime.sql");
    else details.push(`Odsłony w statystykach: ${views}`);
    if (!projects) details.push("Baza jest pusta: przenieś dane poleceniem npm run db:push");
    return { id: "db", level: views < 0 || !projects ? "warn" : "ok", title: "Baza danych", summary: "Supabase połączona", details };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    const hint = /401|403/.test(msg)
      ? "Zły klucz: wklej service_role (Project Settings → API), nie anon."
      : /404|PGRST|42P01/.test(msg)
        ? "Brak tabel: uruchom supabase/schema.sql w SQL Editor."
        : "Supabase nie odpowiada: sprawdź SUPABASE_URL.";
    return { id: "db", level: "error", title: "Baza danych", summary: hint, details: [msg.slice(0, 160)] };
  }
}

type TgResult<T> = { ok: boolean; result?: T; description?: string };
async function tgCall<T>(method: string): Promise<TgResult<T>> {
  const res = await fetch(`https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/${method}`, { cache: "no-store", signal: timeout(8000) });
  return (await res.json().catch(() => ({ ok: false, description: String(res.status) }))) as TgResult<T>;
}

async function telegram(): Promise<Check> {
  const missing = missingOf(["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "ADMIN_TELEGRAM_ID"]);
  if (!env("TELEGRAM_BOT_TOKEN"))
    return { id: "telegram", level: "off", title: "Bot Telegram", summary: "Nie podłączony: załóż bota w @BotFather", missing };
  try {
    const me = await tgCall<{ username: string }>("getMe");
    if (!me.ok) return { id: "telegram", level: "error", title: "Bot Telegram", summary: "Telegram odrzucił token: skopiuj go jeszcze raz z @BotFather", details: [me.description ?? ""], missing };
    const hook = await tgCall<{ url: string; pending_update_count: number; last_error_message?: string }>("getWebhookInfo");
    const w = hook.result;
    const details = [`Bot: @${me.result!.username}`];
    if (w?.url) details.push(`Webhook: ${w.url}${w.pending_update_count ? ` (czeka ${w.pending_update_count})` : ""}`);
    else details.push("Webhook: brak (lokalnie uruchom npm run bot:dev, po publikacji przycisk „Podłącz webhook”)");
    if (w?.last_error_message) details.push(`Ostatni błąd Telegrama: ${w.last_error_message}`);
    if (!admins().length) details.push("Brak ADMIN_TELEGRAM_ID: napisz /start do bota, odpowie Twoim numerem ID");
    const level: Level = missing.length || w?.last_error_message ? "warn" : "ok";
    return { id: "telegram", level, title: "Bot Telegram", summary: `@${me.result!.username} odpowiada`, details, missing };
  } catch (e) {
    return { id: "telegram", level: "error", title: "Bot Telegram", summary: "Brak połączenia z Telegramem", details: [String(e).slice(0, 160)], missing };
  }
}

async function ai(): Promise<Check> {
  const chain = aiProviders();
  const keyed = chain.filter((p) => p !== "pollinations");
  const missing = keyed.length ? [] : ["GROQ_API_KEY"];
  try {
    const t0 = Date.now();
    const r = await Promise.race([
      ask([{ role: "user", content: "Reply with the single word OK." }], { maxTokens: 20 }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout 25 s")), 25_000)),
    ]);
    const details = [`Kolejność: ${chain.join(" → ")}`, `Odpowiedział: ${r.by} w ${((Date.now() - t0) / 1000).toFixed(1)} s`];
    if (!keyed.length) details.push("Działa tylko darmowy zapas (wolny, bywa zajęty). Jeden darmowy klucz Groq to naprawia.");
    return { id: "ai", level: keyed.length ? "ok" : "warn", title: "AI (teksty, tłumaczenia, mózg bota)", summary: keyed.length ? `Działa: ${keyed.join(", ")}` : "Działa na darmowym zapasie", details, missing };
  } catch (e) {
    return { id: "ai", level: "error", title: "AI (teksty, tłumaczenia, mózg bota)", summary: "Żaden model nie odpowiedział", details: [`Kolejność: ${chain.join(" → ")}`, String(e instanceof Error ? e.message : e).slice(0, 160)], missing };
  }
}

async function voice(): Promise<Check> {
  const key = env("GROQ_API_KEY") ? "groq" : env("OPENAI_API_KEY") ? "openai" : "";
  if (!key) return { id: "voice", level: "off", title: "Głosówki w Telegramie", summary: "Wyłączone: potrzebny darmowy GROQ_API_KEY", missing: ["GROQ_API_KEY"] };
  if (key === "openai") return { id: "voice", level: "ok", title: "Głosówki w Telegramie", summary: "Whisper przez OpenAI" };
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${env("GROQ_API_KEY")}` }, cache: "no-store", signal: timeout(8000) });
    if (!res.ok) return { id: "voice", level: "error", title: "Głosówki w Telegramie", summary: `Groq odrzucił klucz (${res.status}): utwórz nowy w console.groq.com` };
    const ids = ((await res.json()) as { data: { id: string }[] }).data.map((m) => m.id);
    const whisper = ids.find((i) => /whisper/.test(i));
    return { id: "voice", level: whisper ? "ok" : "warn", title: "Głosówki w Telegramie", summary: whisper ? `Gotowe (${whisper})` : "Klucz działa, ale brak modelu Whisper" };
  } catch (e) {
    return { id: "voice", level: "error", title: "Głosówki w Telegramie", summary: "Groq nie odpowiada", details: [String(e).slice(0, 160)] };
  }
}

async function email(): Promise<Check> {
  if (!env("RESEND_API_KEY") && env("MAIL_WEBHOOK_URL")) {
    // the free route: a Make.com scenario that sends from your own Gmail
    const miss = missingOf(["NOTIFY_EMAIL"]);
    return { id: "email", level: miss.length ? "warn" : "ok", title: "E-maile", summary: "Wysyłka przez Make.com (Twój Gmail)", details: ["Sprawdź przyciskiem „Wyślij testowy e-mail”."], missing: miss };
  }
  const missing = missingOf(["RESEND_API_KEY", "NOTIFY_EMAIL", "NOTIFY_FROM"]);
  if (!env("RESEND_API_KEY"))
    return { id: "email", level: "off", title: "E-maile", summary: "Wyłączone: zapytania widzisz tylko w panelu (i na Telegramie)", missing };
  const from = env("NOTIFY_FROM");
  const domain = from.match(/@([^>\s]+)/)?.[1]?.toLowerCase();
  try {
    const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}` }, cache: "no-store", signal: timeout(8000) });
    const body = (await res.json().catch(() => ({}))) as { data?: { name: string; status: string }[]; name?: string; message?: string };
    // a "sending access" key cannot list domains, but it is a valid key
    if (res.status === 401 && body.name === "restricted_api_key")
      return { id: "email", level: missing.length ? "warn" : "ok", title: "E-maile", summary: "Klucz Resend działa (tylko wysyłka)", details: [`Nadawca: ${from || "onboarding@resend.dev (test)"}`, "Wyślij testowy e-mail, żeby sprawdzić domenę."], missing };
    if (!res.ok) return { id: "email", level: "error", title: "E-maile", summary: `Resend odrzucił klucz (${res.status})`, details: [body.message ?? ""], missing };
    const domains = body.data ?? [];
    const mine = domains.find((d) => d.name.toLowerCase() === domain);
    const details = [`Nadawca: ${from || "onboarding@resend.dev (test, tylko na Twój adres)"}`, `Domeny w Resend: ${domains.map((d) => `${d.name} (${d.status})`).join(", ") || "brak"}`];
    const verified = mine?.status === "verified";
    if (!verified) details.push(domain ? `Domena ${domain} nie jest jeszcze zweryfikowana: dodaj rekordy DNS z Resend` : "NOTIFY_FROM nie ma adresu z Twojej domeny");
    return { id: "email", level: verified && !missing.length ? "ok" : "warn", title: "E-maile", summary: verified ? `Wysyłka z ${domain}` : "Klucz działa, domena czeka na weryfikację", details, missing };
  } catch (e) {
    return { id: "email", level: "error", title: "E-maile", summary: "Resend nie odpowiada", details: [String(e).slice(0, 160)], missing };
  }
}

/** The worker on Claudio's computer (scripts/worker): new screenshots and projects from folders. */
async function worker(): Promise<Check> {
  const title = "Pomocnik na komputerze";
  if (!usingSupabase) return { id: "worker", level: "off", title, summary: "Potrzebuje Supabase (przez nią dostaje zlecenia od bota)" };
  try {
    const { workerState, workQueue } = await import("./worker");
    const [w, queue] = await Promise.all([workerState(), workQueue()]);
    const seen = w.lastSeen ? new Date(w.lastSeen).toLocaleString("pl-PL", { timeZone: "Europe/Rome" }) : "";
    const details = [queue.length ? `W kolejce: ${queue.length}` : "Kolejka pusta", ...(seen ? [`Ostatni sygnał: ${seen}`] : [])];
    if (w.online) return { id: "worker", level: "ok", title, summary: w.busy ? `Pracuje: ${w.busy}` : "Włączony, czeka na zlecenia", details };
    return { id: "worker", level: "warn", title, summary: seen ? "Wyłączony — zlecenia poczekają, aż włączysz komputer" : "Jeszcze nie uruchomiony", details };
  } catch (e) {
    return { id: "worker", level: "error", title, summary: "Nie udało się sprawdzić", details: [String(e).slice(0, 160)] };
  }
}

export async function runChecks(): Promise<Check[]> {
  return Promise.all([site(), database(), telegram(), ai(), voice(), email(), worker()]);
}

export { isPublicHttps, siteUrl };
