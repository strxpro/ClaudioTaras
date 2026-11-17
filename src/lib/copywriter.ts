import "server-only";
import { askJson, isFullL10n, translateAll } from "./ai";
import { locales, type L10n, type Locale } from "./i18n";
import type { Project } from "./types";

/**
 * House style for every project page, so all of them read as one portfolio (used by the panel's
 * "✨ Napisz teksty AI", the Telegram bot and the importer's output review).
 */
export const STYLE = `House style (Claudio Taras portfolio — premium, confident, few words):
- tagline: max 8 words, punchy, concrete, no clichés, no em-dash chains;
- summary: 2 sentences, max 220 characters, what it is + what makes it special;
- challenge: 1 sentence, max 140 characters — the client's real problem;
- solution: 1 sentence, max 170 characters — what was built and why it works;
- role: Claudio's role as 2-4 short items joined with " · " (e.g. "Design · Development · SEO");
- features: exactly 4 items, 2-5 words each, things the product really does;
- never invent numbers, clients, awards or results; keep brand and place names unchanged.`;

type Copy = Pick<Project, "tagline" | "summary" | "challenge" | "solution" | "role" | "features">;

/** Fresh copy for a project in all six languages, written from what we know about it. */
export async function writeProjectCopy(p: Project, note?: string): Promise<Copy & { by: string }> {
  const facts = {
    name: p.name,
    client: p.client,
    location: p.location,
    category: p.category,
    year: p.year,
    url: p.url || "(local build / demo on request)",
    stack: p.stack,
    current_tagline: p.tagline.en || p.tagline.pl,
    current_summary: p.summary.en || p.summary.pl,
    current_features: p.features.map((f) => f.en || f.pl),
    numbers: p.results.map((r) => `${r.value} ${r.label.en || r.label.pl}`),
  };
  const json = await askJson<Partial<Record<keyof Copy, unknown>>>(
    [
      { role: "system", content: `You write portfolio copy for Claudio Taras, a web designer & developer, about a project he designed and built.\n${STYLE}\nWrite every text natively in en, pl, it, es, de, fr. Answer ONLY with JSON.` },
      {
        role: "user",
        content: `Project facts:\n${JSON.stringify(facts, null, 1)}${note ? `\nOwner's note: ${note}` : ""}\n\nReturn {"tagline":L,"summary":L,"challenge":L,"solution":L,"role":L,"features":[L,L,L,L]} where L = {"en":"…","pl":"…","it":"…","es":"…","de":"…","fr":"…"}.`,
      },
    ],
    { maxTokens: 4000 },
  );
  const pick = (k: "tagline" | "summary" | "challenge" | "solution" | "role"): L10n => (isFullL10n(json[k]) ? (json[k] as L10n) : p[k]);
  const feats = Array.isArray(json.features) ? (json.features as unknown[]).filter(isFullL10n).slice(0, 4) : [];
  return {
    tagline: pick("tagline"),
    summary: pick("summary"),
    challenge: pick("challenge"),
    solution: pick("solution"),
    role: pick("role"),
    features: feats.length >= 3 ? feats : p.features,
    by: json._by,
  };
}

const best = (v: L10n): Locale | null => (["pl", "en", "it", "es", "de", "fr"] as Locale[]).find((l) => v[l]?.trim()) ?? null;
const missing = (v: L10n) => locales.some((l) => !v[l]?.trim()) && !!best(v);

/** Fill every language that is still empty (from the best filled one) — one AI call per project. */
export async function fillTranslations(p: Project): Promise<{ project: Project; filled: number }> {
  const items: Record<string, { text: string; from: Locale }> = {};
  const take = (key: string, v: L10n) => {
    if (missing(v)) items[key] = { text: v[best(v)!]!, from: best(v)! };
  };
  (["tagline", "summary", "challenge", "solution", "role"] as const).forEach((k) => take(k, p[k]));
  p.features.forEach((f, i) => take(`feature${i}`, f));
  p.results.forEach((r, i) => take(`result${i}`, r.label));
  const keys = Object.keys(items);
  if (!keys.length) return { project: p, filled: 0 };
  // group by source language (usually all Polish or all English)
  const out = structuredClone(p);
  for (const from of [...new Set(keys.map((k) => items[k].from))]) {
    const group = Object.fromEntries(keys.filter((k) => items[k].from === from).map((k) => [k, items[k].text]));
    const t = await translateAll(group, from);
    for (const [k, v] of Object.entries(t)) {
      const keep = (old: L10n) => Object.fromEntries(locales.map((l) => [l, old[l]?.trim() ? old[l] : v[l]])) as L10n;
      if (k.startsWith("feature")) out.features[Number(k.slice(7))] = keep(out.features[Number(k.slice(7))]);
      else if (k.startsWith("result")) out.results[Number(k.slice(6))].label = keep(out.results[Number(k.slice(6))].label);
      else out[k as "tagline"] = keep(out[k as "tagline"]);
    }
  }
  return { project: out, filled: keys.length };
}
