import "server-only";
import { z } from "zod";
import { askJson, translateAll, type ChatMsg } from "../ai";
import { STYLE, writeProjectCopy } from "../copywriter";
import { analytics, db, kv } from "../db";
import { replyToClient } from "../replies";
import { locales, type Locale } from "../i18n";
import { launchImport } from "../importer";
import { queueWork, viaWorker } from "../worker";
import { categories, statuses, type Message, type Project, type Settings } from "../types";

/* ─── actions the AI may propose (validated; applied only after ✅) ─────────── */

const lang = z.enum(locales as unknown as [Locale, ...Locale[]]).catch("pl");
const slug = z.string().min(1);

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("project_update"),
    slug,
    set: z
      .object({
        name: z.string().min(1).max(80),
        client: z.string().max(160),
        year: z.coerce.number().int().min(2000).max(2100),
        location: z.string().max(120),
        category: z.enum(categories),
        status: z.enum(statuses),
        url: z.string().max(300),
        accent: z.string().regex(/^#[0-9a-f]{6}$/i),
        stack: z.array(z.string().max(40)).max(20),
        published: z.boolean(),
        featured: z.boolean(),
        locked: z.boolean(),
      })
      .partial(),
  }),
  z.object({ type: z.literal("project_text"), slug, field: z.enum(["tagline", "summary", "challenge", "solution", "role"]), text: z.string().min(1).max(1500), lang }),
  z.object({ type: z.literal("project_features"), slug, features: z.array(z.string().min(1).max(120)).min(1).max(8), lang }),
  z.object({ type: z.literal("project_result"), slug, value: z.string().min(1).max(20), label: z.string().min(1).max(120), lang }),
  z.object({ type: z.literal("project_results_clear"), slug }),
  z.object({ type: z.literal("project_move"), slug, position: z.coerce.number().int().min(1) }),
  z.object({ type: z.literal("project_rewrite"), slug, note: z.string().max(500).optional() }),
  z.object({
    type: z.literal("project_refresh"),
    slug,
    // where from, only when he names it ("w F hotel jest nowa wersja"); else the project's own site / folder
    source: z.string().max(400).optional().catch(undefined),
    // the site changed / is different → new descriptions in 6 languages as well
    texts: z.boolean().optional().catch(undefined),
  }),
  z.object({ type: z.literal("project_import"), source: z.string().min(1).max(400), publish: z.boolean().catch(true) }),
  z.object({ type: z.literal("project_photo"), slug }),
  z.object({
    type: z.literal("settings"),
    set: z
      .object({
        available: z.boolean(),
        email: z.string().email(),
        phone: z.string().max(40),
        location: z.string().max(120),
        yearsExperience: z.coerce.number().int().min(0).max(80),
        // "I'm busy until the 20th, working on a shop for X" → busyUntil + busyNote
        busyUntil: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
        busyNote: z.string().max(200),
        callDays: z.array(z.coerce.number().int().min(1).max(7)).max(7),
        callHours: z.array(z.string().regex(/^\d{1,2}:\d{2}$/)).max(8),
      })
      .partial(),
  }),
  z.object({ type: z.literal("bio"), text: z.string().min(1).max(2000), lang }),
  z.object({ type: z.literal("portrait") }),
  z.object({ type: z.literal("message_status"), id: z.string().min(4), status: z.enum(["new", "read", "replied", "archived"]) }),
  z.object({ type: z.literal("message_reply"), id: z.string().min(4), text: z.string().min(2).max(4000) }),
  z.object({ type: z.literal("undo") }),
]);
export type Action = z.infer<typeof ActionSchema>;

/* ─── understanding ───────────────────────────────────────────────────────── */

const short = (s = "", n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Site traffic in one line the model can quote ("ile osób było dziś na stronie?"). */
export async function visitsLine(): Promise<string> {
  const s = await analytics.stats(30).catch(() => null);
  if (!s) return "VISITS: no data yet";
  const sum = (n: number, k: "views" | "visitors") => s.byDay.slice(-n).reduce((a, d) => a + d[k], 0);
  const y = s.byDay[s.byDay.length - 2];
  return `VISITS (unique people · page views): today ${s.today.visitors} · ${s.today.views} | yesterday ${y?.visitors ?? 0} · ${y?.views ?? 0} | last 7 days ${sum(7, "visitors")} · ${sum(7, "views")} | last 30 days ${s.visitors} · ${s.views}
Top countries (30d): ${s.countries.map((c) => `${c.country} ${c.views}`).join(", ") || "-"} · Top pages: ${s.topPaths.slice(0, 5).map((p) => `${p.path} ${p.views}`).join(", ") || "-"} · Devices: ${s.devices.map((d) => `${d.device} ${d.views}`).join(", ") || "-"} · From: ${s.referrers.slice(0, 4).map((r) => `${r.host} ${r.views}`).join(", ") || "direct"}`;
}

async function context() {
  const [projects, settings, messages, visits] = await Promise.all([db.projects({ all: true }), db.settings(), db.messages(), visitsLine()]);
  const P = projects.map(
    (p) =>
      `${p.order}. ${p.slug} | ${p.name} | ${p.category} | ${p.year} | ${p.status}${p.url ? ` ${p.url}` : ""}${p.source && !/^https?:/.test(p.source) ? ` | folder ${p.source}` : ""} | ${p.published ? "published" : "DRAFT"}${p.featured ? " ★" : ""}${p.locked ? " 🔒" : ""} | tagline: ${short(p.tagline.pl || p.tagline.en, 90)} | stack: ${p.stack.join(", ")}`,
  );
  const M = messages.slice(0, 15).map(
    (m) => `${m.id.slice(0, 8)} | ${m.createdAt.slice(0, 16).replace("T", " ")} | ${m.status} | lang ${m.locale} | ${m.name} <${m.email}>${m.phone ? ` ${m.phone}` : ""} | ${m.services.join(", ")} | ${m.budget} | ${m.timeline} | "${short(m.message, 220)}"${m.attachments?.length ? ` | ${m.attachments.length} attachment(s)` : ""}${m.replies?.length ? ` | you replied ${m.replies.length}× (last: "${short(m.replies[m.replies.length - 1].text, 80)}")` : ""}`,
  );
  const S = `available for work: ${settings.available}${settings.busyUntil ? ` (busy until ${settings.busyUntil}${settings.busyNote ? `: ${settings.busyNote}` : ""})` : ""} · call slots ${(settings.callDays ?? [1, 2, 3, 4, 5]).join(",")} @ ${(settings.callHours ?? ["10:00", "12:00", "15:00", "17:00"]).join(" ")} · today ${new Date().toISOString().slice(0, 10)} · email ${settings.email} · phone ${settings.phone || "-"} · location ${settings.location} · years of experience ${settings.yearsExperience} · bio: ${short(settings.bio.pl || settings.bio.en, 160)}`;
  const compact = `PROJECTS (slug | name | visibility): ${projects.map((p) => `${p.slug}|${p.name}|${p.published ? "on" : "draft"}${p.featured ? "★" : ""}${p.source && !/^https?:/.test(p.source) ? `|${p.source}` : ""}`).join("; ")}
REQUESTS (${messages.filter((m) => m.status === "new").length} unread): ${messages.slice(0, 4).map((m) => `${m.id.slice(0, 8)}|${m.status}|${m.name}|${m.services.join("+")}|${m.budget}`).join("; ") || "none"}
SETTINGS: available ${settings.available}, email ${settings.email}
${visits}`;
  return { projects, messages, settings, compact, text: `PROJECTS (order. slug | name | category | year | status | visibility | …):\n${P.join("\n")}\n\nSETTINGS: ${S}\n\nCONTACT REQUESTS (newest first, ${messages.filter((m) => m.status === "new").length} unread; id = first 8 chars):\n${M.join("\n") || "(none)"}\n\n${visits}` };
}

function system(data: string, photo: boolean) {
  const now = new Date().toLocaleString("pl-PL", { timeZone: "Europe/Rome", dateStyle: "full", timeStyle: "short" });
  return `You are the assistant of Claudio Taras' portfolio website (he is a web designer & developer). Claudio talks to you on Telegram, often by voice (transcribed, expect small errors), in any language. Now: ${now}.
Answer ONLY with JSON: {"reply":"…","actions":[…]}
- Questions (projects, requests, settings, site traffic) → answer in "reply" with the exact data below; actions = []. "Ile osób / kto oglądał / odwiedziny / skąd" → VISITS (unique people per day; give today and 7 days unless asked otherwise).
- Changes → put them in "actions". They are NOT applied yet: Claudio confirms with ✅/❌. "reply" = one short sentence saying what will change and asking to confirm. Never claim it's done.
- Several changes = several actions. Unclear which project/what exactly → ask in "reply" with no actions.
- Texts: write "text" in the language Claudio used (set "lang"); the system translates to all 6 languages. Follow the house style.
- Reply in Claudio's language, warm, very short, plain text (no markdown).${photo ? "\n- A PHOTO IS ATTACHED: use project_photo (add to a project's gallery) or portrait (his photo on the About section). If the caption doesn't say which, ask." : ""}
Action formats:
{"type":"project_update","slug":"…","set":{"name"?,"client"?,"year"?,"location"?,"category"?:"website|ecommerce|webapp|software|event","status"?:"live|local|private|wip" (wip = still being built; "skończyłem X" / "X gotowy" → status live if it has a url, else local; "pracuję nad X" → wip),"url"?,"accent"?:"#rrggbb","stack"?:["…"],"published"?:bool,"featured"?:bool,"locked"?:bool}}
{"type":"project_text","slug":"…","field":"tagline|summary|challenge|solution|role","text":"…","lang":"pl|en|it|es|de|fr"}
{"type":"project_features","slug":"…","features":["…","…"],"lang":"…"}  (replaces the list)
{"type":"project_result","slug":"…","value":"9.8","label":"Booking.com rating","lang":"…"}  (only real numbers he gives)
{"type":"project_results_clear","slug":"…"}
{"type":"project_move","slug":"…","position":1}
{"type":"project_rewrite","slug":"…","note":"…"}  (AI rewrites all texts of that project)
{"type":"project_refresh","slug":"…","texts"?:true,"source"?:"https://… or F:\\\\folder"}  (his computer records the project again: screenshots, videos, logo, and puts them on the site. "texts":true when he says the site changed / is different / has a new version or new content → new descriptions in 6 languages too; only "odśwież zrzuty / zdjęcia" → no texts. "source" only when he names a folder or a link; match folders to the projects above ("folder …"). Voice transcripts lose ":" and "\\\\": "F hotel" = "F:\\\\hotel", "w pliku F, hotel" = "F:\\\\hotel".)
{"type":"project_import","source":"https://… or F:\\\\folder","publish":true}  (a NEW project from a link or a folder on his computer. If that folder/link already is a project above → project_refresh with texts true instead.)
{"type":"project_photo","slug":"…"} {"type":"portrait"}
{"type":"settings","set":{"available"?:bool,"email"?,"phone"?,"location"?,"yearsExperience"?:number,"busyUntil"?:"YYYY-MM-DD" or "" (free again),"busyNote"?:"what he works on now (his words, short)","callDays"?:[1-7],"callHours"?:["10:00",…]}}  (e.g. "I'm busy until the 20th, I'm building a shop" → available false, busyUntil, busyNote; "I'm free again" → available true, busyUntil "", busyNote "")
{"type":"bio","text":"…","lang":"…"}
{"type":"message_status","id":"<8 chars>","status":"new|read|replied|archived"}
{"type":"message_reply","id":"<8 chars>","text":"…"}  (e-mail to the client in Claudio's branded template. Write "text" as the full reply body IN THE CLIENT'S LANGUAGE (lang of the request): greeting with their first name, his content, warm and short, no signature. Keep his facts, add nothing.)
{"type":"undo"}  (revert the last change)
Example — he says "Zmień hasło Villa Dea na: Dom nad morzem" → {"reply":"Zmienić hasło Villa Dea na „Dom nad morzem”?","actions":[{"type":"project_text","slug":"villa-dea","field":"tagline","text":"Dom nad morzem","lang":"pl"}]}
When the request is clear, ALWAYS include the action — the confirmation buttons are added automatically, never ask "do you want…" without actions.
${STYLE}

${data}`;
}

/** Same rules in ~3k characters, for the keyless model (it refuses long prompts). */
function systemCompact(data: string, photo: boolean) {
  return `Assistant of Claudio Taras' portfolio site. He writes/speaks any language. Reply ONLY JSON {"reply":"…","actions":[…]}.
Questions: answer in reply from DATA, actions []. Changes: actions (he confirms later); reply = 1 short sentence asking to confirm. Unclear: ask, no actions. Reply in his language, short, plain text.
Actions: project_update{slug,set:{name,client,year,location,category,status:live|local|private|wip (wip=in progress; "skończyłem X"→live if url else local),url,accent,stack[],published,featured,locked}} · project_text{slug,field:tagline|summary|challenge|solution|role,text,lang} · project_features{slug,features[],lang} · project_result{slug,value,label,lang} · project_move{slug,position} · project_rewrite{slug,note} · project_refresh{slug,texts:true if the site changed/is different,source if he names a folder like F:\\\\hotel ("F hotel") or link} · project_import{source,publish} (new project from a link/folder) · ${photo ? "project_photo{slug} · portrait{} · " : ""}settings{set:{available,email,phone,location,yearsExperience}} · bio{text,lang} · message_status{id,status:new|read|replied|archived} · message_reply{id,text in the client's language} · undo{}. Traffic questions → VISITS line. Every action has "type". "tagline" = hasło/slogan, "summary" = opis.
Example — he says "Zmień hasło Villa Dea na: Dom nad morzem" → {"reply":"Zmienić hasło Villa Dea na „Dom nad morzem”?","actions":[{"type":"project_text","slug":"villa-dea","field":"tagline","text":"Dom nad morzem","lang":"pl"}]}
When the request is clear, ALWAYS include the action — the confirmation buttons are added automatically, never ask "do you want…" without actions.
DATA:
${data}`;
}

export type Thought = { reply: string; actions: Action[]; by: string };

export async function think(text: string, chatId: number, photo = false): Promise<Thought> {
  const ctx = await context();
  const history = (await kv.get<ChatMsg[]>(`bot:history:${chatId}`)) ?? [];
  const user = { role: "user" as const, content: photo ? `[PHOTO ATTACHED] ${text}` : text };
  const out = await askJson<{ reply?: string; actions?: unknown[] }>([{ role: "system", content: system(ctx.text, photo) }, ...history.slice(-6), user], {
    maxTokens: 2500,
    compact: [{ role: "system", content: systemCompact(ctx.compact, photo) }, ...history.slice(-2), user],
  });
  const actions: Action[] = [];
  for (const a of out.actions ?? []) {
    const r = ActionSchema.safeParse(a);
    if (r.success) actions.push(r.data);
  }
  const reply = (out.reply ?? "").trim() || (actions.length ? "Potwierdzić?" : "🤔");
  await kv.set(`bot:history:${chatId}`, [...history, { role: "user", content: text }, { role: "assistant", content: reply }].slice(-8));
  return { reply, actions, by: out._by };
}

/* ─── human-readable plan ─────────────────────────────────────────────────── */

const FIELD: Record<string, string> = { tagline: "hasło", summary: "opis", challenge: "wyzwanie", solution: "rozwiązanie", role: "rola" };
const KEY: Record<string, string> = {
  name: "nazwa",
  client: "klient",
  year: "rok",
  location: "miejsce",
  category: "kategoria",
  status: "status",
  url: "adres",
  accent: "kolor",
  stack: "technologie",
  published: "na stronie",
  featured: "wyróżniony",
  locked: "na hasło",
  available: "przyjmuję projekty",
  email: "e-mail",
  phone: "telefon",
  yearsExperience: "lata doświadczenia",
};
const STATUS: Record<string, string> = { live: "🟢 online", local: "💻 lokalnie (gotowy)", private: "🔒 prywatny", wip: "🛠 w trakcie realizacji" };
const val = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "tak" : "nie") : String(v));
const pairs = (o: Record<string, unknown>) =>
  Object.entries(o)
    .map(([k, v]) => `${KEY[k] ?? k} → ${k === "status" ? (STATUS[String(v)] ?? val(v)) : val(v)}`)
    .join(" · ");

export function describe(a: Action, projects: Project[]): string {
  const name = "slug" in a ? (projects.find((p) => p.slug === a.slug)?.name ?? `❓ ${a.slug}`) : "";
  switch (a.type) {
    case "project_update":
      return `✏️ ${name}: ${pairs(a.set)}`;
    case "project_text":
      return `✏️ ${name} · ${FIELD[a.field]}: „${short(a.text, 160)}” (+ 5 języków)`;
    case "project_features":
      return `🧩 ${name} · funkcje: ${a.features.join(" · ")}`;
    case "project_result":
      return `🔢 ${name} · liczba: ${a.value} ${a.label}`;
    case "project_results_clear":
      return `🔢 ${name} · usuń wszystkie liczby`;
    case "project_move":
      return `↕️ ${name} → pozycja ${a.position}`;
    case "project_rewrite":
      return `✨ ${name} · nowe teksty AI w 6 językach${a.note ? ` (${short(a.note, 80)})` : ""}`;
    case "project_refresh":
      return `📸 ${name} · nagraj od nowa zrzuty, wideo i logo${a.texts ? " + nowe opisy w 6 językach" : ""}${a.source ? ` — z: ${a.source}` : ""} (zrobi to Twój komputer)`;
    case "project_import":
      return `➕ Nowy projekt z: ${a.source}${a.publish ? " (od razu na stronie)" : " (jako szkic)"} (zrobi to Twój komputer)`;
    case "project_photo":
      return `🖼️ ${name} · dodaj zdjęcie do galerii`;
    case "settings":
      return `⚙️ ${pairs(a.set)}`;
    case "bio":
      return `👤 Bio: „${short(a.text, 160)}” (+ 5 języków)`;
    case "portrait":
      return "👤 Ustaw zdjęcie jako Twój portret";
    case "message_status":
      return `✉️ Zapytanie ${a.id} → ${a.status}`;
    case "message_reply":
      return `📨 Odpowiedź e-mailem (${a.id}):
„${short(a.text, 900)}”`;
    case "undo":
      return "↩️ Cofnij ostatnią zmianę";
  }
}

/* ─── applying ────────────────────────────────────────────────────────────── */

type Snapshot = { projects: Project[]; settings?: Settings; messages: Message[]; at: string };

export async function execute(actions: Action[], opts: { chatId: number; origin?: string; photo?: string }): Promise<string[]> {
  if (actions.some((a) => a.type === "undo")) return [await undo()];
  const [projects, settings, messages] = await Promise.all([db.projects({ all: true }), db.settings(), db.messages()]);
  const bySlug = (s: string) => {
    const p = projects.find((x) => x.slug === s || x.name.toLowerCase() === s.toLowerCase());
    if (!p) throw new Error(`Nie znam projektu „${s}”.`);
    return p;
  };
  const snap: Snapshot = { projects: [], messages: [], at: new Date().toISOString() };
  const touched = new Map<string, Project>();
  const touch = (p: Project) => {
    if (!touched.has(p.id)) {
      snap.projects.push(structuredClone(p));
      touched.set(p.id, p);
    }
    return p;
  };
  let newSettings: Settings | null = null;
  const setts = () => {
    if (!newSettings) {
      snap.settings = structuredClone(settings);
      newSettings = settings;
    }
    return newSettings;
  };
  const done: string[] = [];

  for (const a of actions) {
    switch (a.type) {
      case "project_update": {
        Object.assign(touch(bySlug(a.slug)), a.set);
        break;
      }
      case "project_text": {
        const p = touch(bySlug(a.slug));
        p[a.field] = (await translateAll({ t: a.text }, a.lang)).t;
        break;
      }
      case "project_features": {
        const p = touch(bySlug(a.slug));
        const t = await translateAll(Object.fromEntries(a.features.map((f, i) => [`f${i}`, f])), a.lang);
        p.features = a.features.map((_, i) => t[`f${i}`]);
        break;
      }
      case "project_result": {
        const p = touch(bySlug(a.slug));
        p.results = [...p.results, { value: a.value, label: (await translateAll({ t: a.label }, a.lang)).t }];
        break;
      }
      case "project_results_clear":
        touch(bySlug(a.slug)).results = [];
        break;
      case "project_move": {
        const p = bySlug(a.slug);
        const order = projects.filter((x) => x.id !== p.id);
        order.splice(Math.min(a.position - 1, order.length), 0, p);
        order.forEach((x, i) => {
          if (x.order !== i + 1) touch(x).order = i + 1;
        });
        break;
      }
      case "project_rewrite": {
        const p = touch(bySlug(a.slug));
        const { by: _by, ...copy } = await writeProjectCopy(p, a.note);
        Object.assign(p, copy);
        break;
      }
      case "project_refresh": {
        const p = bySlug(a.slug);
        if (viaWorker()) {
          done.push(await queueWork({ kind: "refresh", slug: p.slug, projectId: p.id, name: p.name, source: a.source, texts: a.texts, chatId: opts.chatId }));
          break;
        }
        const r = await launchImport({ source: a.source || p.source || p.url || "", projectId: p.id, publish: p.published, deploy: false, notifyChat: opts.chatId, origin: opts.origin });
        done.push(r.error ? `⚠️ ${r.error}` : `📸 ${p.name}: nagrywam od nowa — dam znać, gdy skończę (kilka minut).`);
        break;
      }
      case "project_import": {
        if (viaWorker()) {
          done.push(await queueWork({ kind: "import", source: a.source, publish: a.publish, chatId: opts.chatId }));
          break;
        }
        const r = await launchImport({ source: a.source, publish: a.publish, deploy: false, notifyChat: opts.chatId, origin: opts.origin });
        done.push(r.error ? `⚠️ ${r.error}` : "➕ Import ruszył — napiszę, gdy projekt będzie gotowy (kilka minut).");
        break;
      }
      case "project_photo": {
        if (!opts.photo) throw new Error("Nie widzę zdjęcia — wyślij je jeszcze raz z podpisem.");
        const p = touch(bySlug(a.slug));
        p.media = { ...p.media, gallery: [...(p.media.gallery ?? []), opts.photo] };
        break;
      }
      case "portrait":
        if (!opts.photo) throw new Error("Nie widzę zdjęcia — wyślij je jeszcze raz.");
        setts().portrait = opts.photo;
        break;
      case "settings":
        Object.assign(setts(), a.set);
        break;
      case "bio":
        setts().bio = (await translateAll({ t: a.text }, a.lang)).t;
        break;
      case "message_status": {
        const m = messages.find((x) => x.id.startsWith(a.id));
        if (!m) throw new Error(`Nie ma zapytania ${a.id}.`);
        snap.messages.push(structuredClone(m));
        await db.saveMessage({ ...m, status: a.status });
        break;
      }
      case "message_reply": {
        const m = messages.find((x) => x.id.startsWith(a.id));
        if (!m) throw new Error(`Nie ma zapytania ${a.id}.`);
        const r = await replyToClient(m.id, a.text, "telegram");
        done.push(r.emailed ? `📨 Wysłane do ${m.email}` : "⚠️ Zapisane w wątku, ale e-mail nie wyszedł (brak MAIL_WEBHOOK_URL albo RESEND_API_KEY).");
        break;
      }
    }
  }
  for (const p of touched.values()) await db.saveProject(p);
  if (newSettings) await db.saveSettings(newSettings);
  if (touched.size || newSettings || snap.messages.length) await kv.set("bot:undo", snap);
  return done;
}

/** Put back what the last confirmed change touched. */
export async function undo(): Promise<string> {
  const snap = await kv.get<Snapshot>("bot:undo");
  if (!snap) return "Nie ma czego cofać.";
  for (const p of snap.projects) await db.saveProject(p);
  if (snap.settings) await db.saveSettings(snap.settings);
  for (const m of snap.messages) await db.saveMessage(m);
  await kv.del("bot:undo");
  return `↩️ Cofnięte (zmiana z ${new Date(snap.at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}).`;
}
