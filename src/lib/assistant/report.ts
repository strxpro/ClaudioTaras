import "server-only";
import { askJson } from "../ai";
import { analytics, db, kv } from "../db";
import { admins, esc, send, type Button } from "../bot/telegram";
import type { Message, PageView } from "../types";
import { dayLog } from "./journal";
import { SITE, line, onDay, upcoming } from "./reminders";
import { addDays, at as romeAt, longDay, rome } from "./time";

/**
 * The evening report (default 20:00) and the morning agenda (default 8:00), Italian time.
 * Times live in kv "bot:assistant"; the bot changes them ("raport o 21", "wyłącz poranne").
 */
export type AssistantCfg = { report: string; morning: string };
export async function assistantCfg(): Promise<AssistantCfg> {
  const c = await kv.get<Partial<AssistantCfg>>("bot:assistant").catch(() => null);
  return { report: c?.report ?? "20:00", morning: c?.morning ?? "08:00" };
}
export async function setAssistantCfg(c: Partial<AssistantCfg>) {
  const cur = await assistantCfg();
  const next = { ...cur, ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) };
  await kv.set("bot:assistant", next);
  return next;
}

/* ─── numbers of one Italian day ──────────────────────────────────────────── */

const plural = (n: number, [one, few, many]: [string, string, string]) =>
  `${n} ${n === 1 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many}`;
const PEOPLE: [string, string, string] = ["osoba", "osoby", "osób"];
const VIEWS: [string, string, string] = ["wyświetlenie", "wyświetlenia", "wyświetleń"];
const flag = (cc: string) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) : "🌐");
const DEVICE: Record<string, string> = { mobile: "📱 telefon", tablet: "📟 tablet", desktop: "💻 komputer" };

function people(list: PageView[], key: (v: PageView) => string | undefined) {
  const m = new Map<string, Set<string>>();
  for (const v of list) {
    const k = key(v);
    if (!k) continue;
    if (!m.has(k)) m.set(k, new Set());
    m.get(k)!.add(v.visitor);
  }
  return [...m.entries()].map(([k, s]) => ({ k, n: s.size })).sort((a, b) => b.n - a.n);
}

async function traffic(date: string) {
  const views = await analytics.range(romeAt(addDays(date, -7), "00:00"), romeAt(addDays(date, 1), "00:00")).catch(() => [] as PageView[]);
  const byDay = new Map<string, PageView[]>();
  for (const v of views) {
    const d = rome(v.at).date;
    byDay.set(d, [...(byDay.get(d) ?? []), v]);
  }
  const day = byDay.get(date) ?? [];
  const uniq = (l: PageView[]) => new Set(l.map((v) => v.visitor)).size;
  const prev = Array.from({ length: 7 }, (_, i) => uniq(byDay.get(addDays(date, -1 - i)) ?? []));
  const path = (v: PageView) => v.path.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";
  const counts = new Map<string, number>();
  for (const v of day) counts.set(v.visitor, (counts.get(v.visitor) ?? 0) + 1);
  return {
    visitors: uniq(day),
    views: day.length,
    yesterday: prev[0],
    avg7: Math.round((prev.reduce((a, b) => a + b, 0) / 7) * 10) / 10,
    countries: people(day, (v) => v.country),
    devices: people(day, (v) => v.device),
    referrers: people(day, (v) => v.referrer),
    languages: people(day, (v) => v.locale || undefined),
    projects: people(day, (v) => path(v).match(/^\/work\/([^/]+)/)?.[1]),
    pages: people(day, path),
    contact: people(day, (v) => (path(v).startsWith("/contact") ? "contact" : undefined))[0]?.n ?? 0,
    oneView: [...counts.values()].filter((n) => n === 1).length,
  };
}

/** requests from the last 30 days nobody answered yet (older ones are history, not a to-do) */
const awaitingReply = (messages: Message[]) =>
  messages.filter((m) => (m.status === "new" || m.status === "read") && !m.replies?.length && Date.now() - Date.parse(m.createdAt) < 30 * 86400_000);

/** what the site already has, so the advice is about what's missing */
const SITE_HAS =
  "Strona już ma: 6 języków, przycisk „Pogadajmy” na każdej stronie, formularz kontaktowy z wyborem dnia i godziny rozmowy, WhatsApp, 3D prezentację projektów z wideo, sitemap i meta SEO, szybkie ładowanie, statystyki odwiedzin.";

/* ─── the AI part: what to improve, an idea, motivation, tomorrow ─────────── */

const THEMES = [
  "hotele i B&B",
  "restauracje i pizzerie",
  "beach bary i kluby",
  "sklepy z lokalnymi produktami (miód, wino, sery)",
  "wynajem łodzi, skuterów i aut",
  "agroturystyka i winnice",
  "biura nieruchomości i wynajem wakacyjny",
  "gabinety (dentysta, fizjoterapia, beauty)",
  "szkoły językowe i kursy online",
  "wesela, eventy i koncerty",
  "portale turystyczne regionu",
  "firmy budowlane i wykończeniowe",
  "siłownie, joga i sport",
  "przewodnicy i wycieczki",
  "muzea, gminy i kultura",
  "agencje marketingowe i freelancerzy",
  "logistyka i dostawy lokalne",
  "rękodzieło i biżuteria",
];
const TWISTS = [
  "AI, które samo rozmawia z klientem",
  "realtime i powiadomienia na żywo",
  "3D / WebGL",
  "pełna automatyzacja procesu",
  "analityka i prognozy",
  "PWA działająca offline",
  "sterowanie głosem",
  "marketplace kilku firm",
  "SaaS na abonament dla wielu klientów",
  "WhatsApp / Telegram jako panel",
  "dynamiczne ceny",
  "mapa i geolokalizacja",
];
const MOTIVATION = [
  "Każdy projekt w portfolio to dowód, że umiesz dowieźć — jutro dołóż kolejną cegłę.",
  "Nie musisz robić wszystkiego naraz. Jedna dobrze zrobiona rzecz dziennie to 365 w roku.",
  "Klienci nie kupują kodu, kupują spokój. Ty go dajesz — pamiętaj o tym, wyceniając pracę.",
  "Najlepsza reklama to strona, która działa szybciej niż konkurencji. Twoja już taka jest.",
  "Dzisiejszy mały krok jest jutrzejszym case study.",
];
const pick = <T>(l: T[]) => l[Math.floor(Math.random() * l.length)];

type AiPart = { day?: string; tips?: string[]; idea?: { title?: string; pitch?: string }; motivation?: string; tomorrow?: string[] };

const SYSTEM =
  "Jesteś osobistym asystentem Claudio Tarasa — web designera i developera z Sardynii (klienci: hotele, restauracje, beach bary, sklepy, portale turystyczne; robi strony, sklepy, aplikacje, panele z AI). Piszesz mu krótko, po polsku, ciepło i konkretnie, jak dobry wspólnik. Bez markdown, bez emoji na początku punktów. Odpowiadasz TYLKO JSON.";

async function ideaHistory() {
  return (await kv.get<string[]>("bot:ideas").catch(() => null)) ?? [];
}
async function rememberIdea(title?: string) {
  if (!title) return;
  await kv.set("bot:ideas", [...(await ideaHistory()), title].slice(-40)).catch(() => {});
}

function ideaAsk(history: string[]) {
  return `Pomysł na system/aplikację webową, którą Claudio mógłby zbudować i sprzedawać: dziedzina „${pick(THEMES)}”, ambitny, technicznie ciekawy (np. ${pick(TWISTS)}), realny do zrobienia przez jedną osobę w 2–6 tygodni. Inny niż: ${history.slice(-25).join("; ") || "-"}.`;
}

/* ─── evening report ──────────────────────────────────────────────────────── */

export async function buildReport(date: string): Promise<{ html: string; buttons: Button[][] }> {
  const from = romeAt(date, "00:00").toISOString();
  const to = romeAt(addDays(date, 1), "00:00").toISOString();
  const [t, projects, messages, settings, log, tomorrow, open, history] = await Promise.all([
    traffic(date),
    db.projects({ all: true }),
    db.messages(),
    db.settings(),
    dayLog(date),
    onDay(addDays(date, 1)),
    upcoming(0).then((l) => l.filter((r) => r.status === "fired")),
    ideaHistory(),
  ]);
  const name = new Map(projects.map((p) => [p.slug, p.name]));
  const newToday = messages.filter((m) => m.createdAt >= from && m.createdAt < to);
  const waiting = awaitingReply(messages);
  const oldest = waiting.reduce<(typeof waiting)[number] | null>((a, m) => (!a || m.createdAt < a.createdAt ? m : a), null);
  const ageDays = oldest ? Math.floor((Date.now() - Date.parse(oldest.createdAt)) / 86400_000) : 0;

  // facts the AI reasons on (and the fallback when no AI answers)
  const issues = [
    ...projects.filter((p) => !p.published).map((p) => `${p.name}: szkic (niewidoczny na stronie)`),
    ...projects.filter((p) => p.status === "wip").map((p) => `${p.name}: w trakcie realizacji`),
    ...projects.filter((p) => p.status === "live" && !p.url).map((p) => `${p.name}: status online, ale bez adresu`),
    ...projects.filter((p) => p.published && !p.media?.desktopMp4 && !p.media?.desktopWebm).map((p) => `${p.name}: brak wideo`),
    `${projects.filter((p) => !p.results?.length).length} z ${projects.length} projektów bez liczb/wyników (np. ocena Booking, % rezerwacji)`,
    ...(settings.portrait ? [] : ["brak zdjęcia Claudio w sekcji O mnie"]),
    ...(!settings.available && settings.busyUntil && settings.busyUntil < date ? [`dostępność: „zajęty do ${settings.busyUntil}” już minęło`] : []),
  ];
  const facts = [
    `Dzień: ${longDay(date)}.`,
    `Strona dziś: ${t.visitors} osób, ${t.views} wyświetleń; wczoraj ${t.yesterday} osób; średnia z 7 dni ${t.avg7}.`,
    t.visitors
      ? `Kraje: ${t.countries.map((c) => `${c.k} ${c.n}`).join(", ") || "-"}. Urządzenia: ${t.devices.map((d) => `${d.k} ${d.n}`).join(", ")}. Języki strony: ${t.languages.map((l) => `${l.k} ${l.n}`).join(", ") || "-"}. Skąd: ${t.referrers.map((r) => `${r.k} ${r.n}`).join(", ") || "wszyscy bezpośrednio"}. Oglądane projekty: ${t.projects.map((p) => `${name.get(p.k) ?? p.k} ${p.n}`).join(", ") || "żaden"}. Strona kontaktu: ${t.contact} osób, wysłane zapytania: ${newToday.length}. Tylko 1 strona: ${t.oneView} z ${t.visitors} osób.`
      : "",
    `Zapytania: ${newToday.length} nowych dziś; ${waiting.length} czeka na odpowiedź${oldest ? ` (najstarsze ${ageDays} dni: ${oldest.name}, ${oldest.services.join("+")})` : ""}.`,
    `Projekty w portfolio: ${projects.length}. Sprawy otwarte: ${issues.join("; ") || "brak"}.`,
    SITE_HAS,
    `Dostępność: ${settings.available ? "przyjmuje projekty" : `zajęty${settings.busyUntil ? ` do ${settings.busyUntil}` : ""}${settings.busyNote ? ` (${settings.busyNote})` : ""}`}.`,
    `Co zrobił dziś (log): ${log.map((e) => e.text).join(" | ") || "nic nie zapisano"}.`,
    `Jutro w kalendarzu: ${tomorrow.map(line).join("; ") || "nic"}. Niezrobione przypomnienia: ${open.map((r) => r.text).join("; ") || "brak"}.`,
  ]
    .filter(Boolean)
    .join("\n");

  let ai: AiPart = {};
  try {
    ai = await askJson<AiPart>(
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Fakty z dzisiaj:\n${facts}\n\nNapisz wieczorny raport. Zwróć JSON:
{"day":"1 zdanie wniosku o dniu (liczby są już wyżej — nie powtarzaj ich; szczerze: mało ruchu = powiedz to)",
"tips":["3 konkretne rzeczy do poprawy — oparte na faktach powyżej (sprawy otwarte, skąd przychodzą ludzie, co oglądają), nie rzeczy, które strona już ma; każda max 150 znaków, od najważniejszej; z nazwą projektu, gdy dotyczy"],
"idea":{"title":"krótka nazwa","pitch":"2–3 zdania: co robi, dla kogo, czemu ktoś za to zapłaci, jaka technologia"},
"motivation":"1 zdanie motywacji, szczere, bez kiczu, nawiązujące do jego dnia",
"tomorrow":["2–3 najważniejsze kroki na jutro (uwzględnij kalendarz i zapytania czekające na odpowiedź)"]}
${ideaAsk(history)}`,
        },
      ],
      { maxTokens: 1600 },
    );
  } catch (e) {
    console.error("[report] ai", e);
  }
  await rememberIdea(ai.idea?.title);

  const s = (l: { k: string; n: number }[], f: (k: string) => string, n = 4) =>
    l
      .slice(0, n)
      .map((x) => `${f(x.k)} ${x.n}`)
      .join(" · ");
  const trend = t.visitors > t.avg7 * 1.3 && t.visitors >= 3 ? " 📈" : t.visitors < t.avg7 * 0.6 && t.avg7 >= 2 ? " 📉" : "";
  const tips = ai.tips?.filter(Boolean).slice(0, 3) ?? issues.slice(0, 3);
  const html = [
    `🌙 <b>Raport dnia</b> · ${esc(longDay(date))}`,
    ai.day ? `<i>${esc(ai.day)}</i>` : "",
    "",
    `👀 <b>Strona</b>: dziś <b>${plural(t.visitors, PEOPLE)}</b> · ${plural(t.views, VIEWS)}${trend}`,
    `<i>wczoraj ${t.yesterday} · średnio ${String(t.avg7).replace(".", ",")} dziennie</i>`,
    t.visitors ? `🌍 ${s(t.countries, flag, 5) || "—"}   ${s(t.devices, (d) => DEVICE[d] ?? d, 3)}` : "",
    t.referrers.length ? `🔗 Skąd: ${esc(s(t.referrers, (r) => r, 4))}` : t.visitors ? "🔗 Wszyscy weszli bezpośrednio" : "",
    t.projects.length ? `🔥 Oglądali: ${esc(t.projects.slice(0, 5).map((p) => `${name.get(p.k) ?? p.k} (${p.n})`).join(", "))}` : "",
    t.contact ? `📨 Strona kontaktu: ${plural(t.contact, PEOPLE)} · wysłane zapytania: ${newToday.length}` : "",
    "",
    `✉️ <b>Zapytania</b>: ${newToday.length ? `nowe dziś: ${newToday.length} (${esc(newToday.map((m) => m.name).join(", "))})` : "dziś brak nowych"}${waiting.length ? ` · <b>bez odpowiedzi: ${waiting.length}</b>${oldest && ageDays >= 1 ? ` (${esc(oldest.name)} czeka ${ageDays === 1 ? "1 dzień" : `${ageDays} dni`})` : ""}` : ""}`,
    log.length ? `🛠 <b>Dziś zrobione</b>:\n${log.slice(-8).map((e) => `• ${esc(e.text)}`).join("\n")}` : "",
    open.length ? `⏰ Niezrobione: ${esc(open.map((r) => r.text).join(" · "))}` : "",
    tomorrow.length ? `📅 <b>Jutro</b>:\n${tomorrow.map((r) => `• ${esc(line(r))}`).join("\n")}` : "📅 Jutro: kalendarz pusty",
    "",
    tips.length ? `💡 <b>Co poprawić</b>\n${tips.map((x, i) => `${i + 1}. ${esc(x)}`).join("\n")}` : "",
    ai.tomorrow?.length ? `\n✅ <b>Plan na jutro</b>\n${ai.tomorrow.slice(0, 3).map((x) => `• ${esc(x)}`).join("\n")}` : "",
    ai.idea?.title ? `\n🚀 <b>Pomysł na system: ${esc(ai.idea.title)}</b>\n${esc(ai.idea.pitch ?? "")}` : "",
    `\n💪 ${esc(ai.motivation || pick(MOTIVATION))}`,
  ];
  const text = html.filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== "")).join("\n");
  return {
    html: text,
    buttons: [[{ text: "💡 Inny pomysł", data: "ix:" }, { text: "📊 Statystyki", url: `${SITE}/admin/stats` }]],
  };
}

export async function sendReport(date: string) {
  const { html, buttons } = await buildReport(date);
  // Telegram caps one message at 4096 characters: split before the AI part when it's long
  const parts = html.length > 3900 ? [html.slice(0, html.indexOf("\n💡")), html.slice(html.indexOf("\n💡") + 1)] : [html];
  for (const id of admins()) for (let i = 0; i < parts.length; i++) await send(id, parts[i], i === parts.length - 1 ? buttons : undefined);
}

/** "💡 Inny pomysł" */
export async function sendIdea(chat: number) {
  const history = await ideaHistory();
  const out = await askJson<{ title?: string; pitch?: string; first?: string }>([
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `${ideaAsk(history)} Zwróć JSON {"title":"…","pitch":"3–4 zdania: co robi, dla kogo, czemu ktoś zapłaci, jaka technologia","first":"pierwszy krok, od którego zacząć (1 zdanie)"}`,
    },
  ]);
  await rememberIdea(out.title);
  await send(chat, `🚀 <b>${esc(out.title ?? "Pomysł")}</b>\n${esc(out.pitch ?? "")}${out.first ? `\n\n👉 ${esc(out.first)}` : ""}`, [[{ text: "💡 Jeszcze jeden", data: "ix:" }]]);
}

/* ─── morning agenda ──────────────────────────────────────────────────────── */

/** only when there is something: today's calendar and requests waiting for an answer */
export async function sendMorning(date: string) {
  const [items, messages] = await Promise.all([onDay(date), db.messages()]);
  const waiting = awaitingReply(messages);
  const list = items.filter((r) => r.status !== "done" || r.kind === "event");
  if (!list.length && !waiting.length) return false;
  const html = [
    `☀️ <b>Dzień dobry!</b> ${esc(longDay(date))}`,
    list.length ? `\n📅 <b>Dziś</b>:\n${list.map((r) => `• ${esc(line(r))}`).join("\n")}` : "\n📅 Dziś kalendarz jest pusty.",
    waiting.length ? `\n✉️ Bez odpowiedzi: ${waiting.length} (${esc(waiting.slice(0, 4).map((m) => m.name).join(", "))})` : "",
  ]
    .filter(Boolean)
    .join("\n");
  for (const id of admins()) await send(id, html);
  return true;
}
