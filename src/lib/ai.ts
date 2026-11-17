import "server-only";
import { locales, type L10n, type Locale } from "./i18n";

/**
 * One AI entry point for the panel and the Telegram bot (same idea as ONDA's llm.ts): a chain of
 * models, the first that answers wins. Every provider whose key is set joins; Pollinations needs no
 * key, so there is always someone to ask.
 *   anthropic  ANTHROPIC_API_KEY   best quality (paid, a few cents a day)
 *   groq       GROQ_API_KEY        console.groq.com     — free, also transcribes voice notes
 *   cerebras   CEREBRAS_API_KEY    cloud.cerebras.ai    — free
 *   gemini     GEMINI_API_KEY      aistudio.google.com  — free
 *   openrouter OPENROUTER_API_KEY  openrouter.ai        — ":free" models
 *   mistral    MISTRAL_API_KEY     console.mistral.ai   — free "Experiment" plan
 *   pollinations — no key, last resort
 * AI_ORDER="gemini,groq,…" changes the order; <NAME>_MODELS="a,b" overrides a provider's models.
 */
export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

type Slot = { name: string; url: string; key?: string; model: string };

const COMPAT: { name: string; url: string; env?: string; models: string[] }[] = [
  { name: "groq", url: "https://api.groq.com/openai/v1", env: "GROQ_API_KEY", models: [process.env.GROQ_MODEL || "openai/gpt-oss-120b", "openai/gpt-oss-20b"] },
  { name: "cerebras", url: "https://api.cerebras.ai/v1", env: "CEREBRAS_API_KEY", models: ["gpt-oss-120b", "qwen-3-235b-a22b-instruct-2507"] },
  { name: "gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai", env: "GEMINI_API_KEY", models: [process.env.GEMINI_MODEL || "gemini-3.5-flash-lite", "gemini-flash-latest"] },
  { name: "openrouter", url: "https://openrouter.ai/api/v1", env: "OPENROUTER_API_KEY", models: ["nvidia/nemotron-3-super-120b-a12b:free", "google/gemma-4-31b-it:free"] },
  { name: "mistral", url: "https://api.mistral.ai/v1", env: "MISTRAL_API_KEY", models: ["mistral-small-latest"] },
  { name: "pollinations", url: "https://text.pollinations.ai/openai", models: ["openai"] },
];

function slots(): Slot[] {
  const order = process.env.AI_ORDER?.split(",").map((s) => s.trim()) ?? [];
  const list = [...COMPAT].sort((a, b) => (order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99));
  return list.flatMap((p) => {
    const key = p.env ? process.env[p.env] : undefined;
    if (p.env && !key) return [];
    const override = process.env[`${p.name.toUpperCase()}_MODELS`]?.split(",").map((x) => x.trim()).filter(Boolean);
    return [...new Set(override?.length ? override : p.models)].map((model) => ({ name: p.name, url: p.url, key, model }));
  });
}

/** Providers that will be asked, in order — for the panel ("AI: Gemini → Pollinations"). */
export function aiProviders() {
  const names = slots().map((s) => s.name);
  if (process.env.ANTHROPIC_API_KEY) names.unshift("anthropic");
  return [...new Set(names)];
}

const resting = new Map<string, number>();

async function anthropic(messages: ChatMsg[], maxTokens: number) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
      max_tokens: maxTokens,
      system,
      messages: messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status} ${(await res.text()).slice(0, 160)}`);
  const j = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (j.content ?? []).map((c) => c.text ?? "").join("");
}

/** The keyless tier refuses extra parameters and is flaky with long prompts (it 402s about every other call). */
const KEYLESS_LIMIT = 5000;
const size = (m: ChatMsg[]) => m.reduce((n, x) => n + x.content.length, 0);

async function compat(s: Slot, messages: ChatMsg[], maxTokens: number) {
  const keyless = s.name === "pollinations";
  const endpoint = keyless ? s.url : `${s.url}/chat/completions`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", ...(s.key ? { authorization: `Bearer ${s.key}` } : {}) },
    body: JSON.stringify(keyless ? { model: s.model, messages } : { model: s.model, messages, max_tokens: maxTokens, temperature: 0.5 }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw Object.assign(new Error(`${s.name}/${s.model} ${res.status} ${(await res.text()).slice(0, 160)}`), { status: res.status });
  const j = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  return j.choices?.[0]?.message?.content ?? "";
}

/**
 * Ask the chain; returns the first non-empty answer and who gave it. `compact` = a shorter version
 * of the same request for the keyless model (used only when `messages` is too long for it).
 */
export async function ask(messages: ChatMsg[], { maxTokens = 3000, compact }: { maxTokens?: number; compact?: ChatMsg[] } = {}): Promise<{ text: string; by: string }> {
  const errors: string[] = [];
  if (process.env.ANTHROPIC_API_KEY && process.env.AI_PROVIDER !== "free") {
    try {
      const text = await anthropic(messages, maxTokens);
      if (text.trim()) return { text, by: "anthropic" };
    } catch (e) {
      errors.push(String((e as Error).message));
    }
  }
  for (const s of slots()) {
    const id = `${s.name}/${s.model}`;
    if ((resting.get(id) ?? 0) > Date.now()) continue;
    let msgs = messages;
    if (s.name === "pollinations" && size(msgs) > KEYLESS_LIMIT) {
      if (!compact || size(compact) > KEYLESS_LIMIT) {
        errors.push("pollinations: polecenie za długie dla darmowego AI bez klucza");
        continue;
      }
      msgs = compact;
    }
    try {
      let text = "";
      // the keyless tier refuses at random (402): a couple of quick retries usually get through
      for (let attempt = 0; attempt < (s.name === "pollinations" ? 4 : 1); attempt++) {
        try {
          text = await compat(s, msgs, maxTokens);
          break;
        } catch (e) {
          if (s.name !== "pollinations" || (e as { status?: number }).status !== 402 || attempt === 3) throw e;
          await new Promise((r) => setTimeout(r, 2500 + attempt * 2500));
        }
      }
      if (text.trim()) return { text, by: s.name };
    } catch (e) {
      const status = (e as { status?: number }).status ?? 0;
      resting.set(id, Date.now() + (status === 429 ? 60_000 : s.name === "pollinations" ? 5_000 : 20_000));
      errors.push(String((e as Error).message));
    }
  }
  throw new Error(`Żadne AI nie odpowiedziało (${errors.slice(-2).join(" | ") || "wszystkie chwilowo zajęte"}). Darmowy klucz GROQ_API_KEY lub GEMINI_API_KEY w .env.local rozwiązuje to na stałe.`);
}

/** Parse the first JSON object in a model's answer (models like to wrap it in prose or ```json). */
export function firstJson<T = unknown>(text: string): T {
  const clean = text.replace(/```(?:json)?/g, "");
  const start = clean.indexOf("{");
  if (start < 0) throw new Error("AI nie zwróciło JSON");
  let depth = 0;
  let inStr = false;
  for (let i = start; i < clean.length; i++) {
    const c = clean[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(clean.slice(start, i + 1)) as T;
  }
  throw new Error("AI zwróciło niepełny JSON");
}

export async function askJson<T>(messages: ChatMsg[], opts?: { maxTokens?: number; compact?: ChatMsg[] }): Promise<T & { _by: string }> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, by } = await ask(messages, opts);
    try {
      return Object.assign(firstJson<T>(text) as object, { _by: by }) as T & { _by: string };
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

const NAMES: Record<Locale, string> = { en: "English", pl: "Polish", it: "Italian", es: "Spanish", de: "German", fr: "French" };
const isFull = (v: unknown): v is L10n => !!v && typeof v === "object" && locales.every((l) => typeof (v as Record<string, unknown>)[l] === "string" && ((v as Record<string, string>)[l] ?? "").trim() !== "");

/**
 * Translate several short texts at once into all six languages (natural, not word-for-word).
 * `items` = { key: text written in `from` }. Returns { key: L10n } (the source text is kept as is).
 */
export async function translateAll(items: Record<string, string>, from: Locale): Promise<Record<string, L10n>> {
  const keys = Object.keys(items).filter((k) => items[k]?.trim());
  if (!keys.length) return {};
  const json = await askJson<Record<string, Partial<L10n>>>([
    {
      role: "system",
      content:
        "You translate website copy for a premium web-design portfolio. Keep the meaning, tone and brand names; write natural native phrasing in each language, never word-for-word; keep it as short as the source. Answer ONLY with JSON.",
    },
    {
      role: "user",
      content: `Source language: ${NAMES[from]}. Translate every value into en, pl, it, es, de, fr.\nReturn {"<key>": {"en":"…","pl":"…","it":"…","es":"…","de":"…","fr":"…"}, …} for these keys:\n${JSON.stringify(Object.fromEntries(keys.map((k) => [k, items[k]])), null, 1)}`,
    },
  ]);
  const out: Record<string, L10n> = {};
  for (const k of keys) {
    const v = json[k];
    const full = { ...(v ?? {}), [from]: items[k] } as L10n;
    out[k] = isFull(full) ? full : { ...Object.fromEntries(locales.map((l) => [l, (v as Record<string, string> | undefined)?.[l] || items[k]])), [from]: items[k] };
  }
  return out;
}

export { isFull as isFullL10n };
