import "server-only";
import crypto from "node:crypto";
import { kv } from "../db";
import { admins, esc, send, type Button } from "../bot/telegram";
import { journal } from "./journal";
import { addDays, addMonths, at as romeAt, dayWord, lead, rome, today, weekday, when } from "./time";

/**
 * Claudio's reminders and calendar. One kv entry per item ("rem:<id>"). `next` is the next moment a
 * Telegram message is due; whoever wakes the assistant first (his computer every minute, GitHub every
 * few minutes, Vercel once a day — see tick.ts) sends it, kv.once() makes sure only once.
 */
export const repeats = ["daily", "weekdays", "weekly", "monthly", "yearly"] as const;
export type Repeat = (typeof repeats)[number];
export const REPEAT_PL: Record<Repeat, string> = { daily: "codziennie", weekdays: "w dni robocze", weekly: "co tydzień", monthly: "co miesiąc", yearly: "co roku" };

export type Rem = {
  id: string;
  kind: "reminder" | "event";
  text: string;
  /** Italian date and time of the occurrence; no time = the whole day (the message comes at 9:00) */
  date: string;
  time?: string;
  at: string;
  place?: string;
  /** minutes, for the phone calendar */
  duration: number;
  /** when to write: minutes before `at` (0 = at the time) */
  before: number[];
  repeat?: Repeat;
  /** next message (ISO); null = nothing more to send */
  next: string | null;
  /** fired = the reminder went out and waits for ✅ */
  status: "active" | "fired" | "done" | "cancelled";
  createdAt: string;
  doneAt?: string;
};

const KEY = (id: string) => `rem:${id}`;
const iso = (t: number) => new Date(t).toISOString();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
const hhmm = (t: string) => t.padStart(5, "0");

export const SITE = (() => {
  const s = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  return /^https:\/\//.test(s) ? s : "https://www.claudiotaras.com";
})();

export async function allRems(): Promise<Rem[]> {
  return (await kv.list<Rem>("rem:")).map((r) => r.data).filter((r) => r?.id);
}

/** by id or its first characters (the bot sees 6-char ids) */
export async function findRem(id: string) {
  const all = await allRems();
  const r = all.find((x) => x.id === id) ?? all.find((x) => x.id.startsWith(id.toLowerCase()));
  if (!r) throw new Error("Nie znalazłem tego przypomnienia — mogło zostać usunięte.");
  return r;
}

export const saveRem = (r: Rem) => kv.set(KEY(r.id), r);

function alerts(r: Rem) {
  const t = Date.parse(r.at);
  return [...new Set(r.before.map((b) => t - b * 60_000))].sort((a, b) => a - b);
}
const alertAfter = (r: Rem, after: number) => alerts(r).find((t) => t > after) ?? null;

function place(r: Rem, date: string) {
  r.date = date;
  r.at = romeAt(date, r.time ?? "09:00").toISOString();
}

function nextDate(date: string, repeat: Repeat) {
  switch (repeat) {
    case "daily":
      return addDays(date, 1);
    case "weekdays": {
      let d = addDays(date, 1);
      while (weekday(d) > 5) d = addDays(d, 1);
      return d;
    }
    case "weekly":
      return addDays(date, 7);
    case "monthly":
      return addMonths(date, 1);
    case "yearly":
      return addMonths(date, 12);
  }
}

/** a repeating item: move to the first occurrence that still has a message ahead */
function advance(r: Rem, after: number) {
  for (let i = 0; i < 800 && r.repeat; i++) {
    place(r, nextDate(r.date, r.repeat));
    const nx = alertAfter(r, after);
    if (nx) {
      r.next = iso(nx);
      r.status = "active";
      return;
    }
  }
  r.next = null;
}

/* ─── creating / changing ─────────────────────────────────────────────────── */

export type NewRem = {
  text: string;
  kind?: "reminder" | "event";
  date?: string;
  time?: string;
  inMinutes?: number;
  place?: string;
  before?: number[];
  repeat?: Repeat;
  duration?: number;
};

export async function addRem(n: NewRem): Promise<Rem> {
  const now = Date.now();
  const kind = n.kind ?? "reminder";
  let date = n.date && DATE.test(n.date) ? n.date : today();
  let time = n.time && TIME.test(n.time) ? hhmm(n.time) : undefined;
  let exact: number | null = null;
  if (n.inMinutes && n.inMinutes > 0) {
    exact = now + Math.round(n.inMinutes * 60_000);
    ({ date, time } = rome(exact));
  } else if (!n.date && time && romeAt(date, time).getTime() <= now) date = addDays(date, 1); // "o 10" said at 14:00 → tomorrow
  if (!n.inMinutes && !time && kind === "reminder" && date === today()) time = rome(now + 60 * 60_000).time; // "przypomnij mi dziś…" with no hour → in an hour
  if (date > addDays(today(), 3 * 366)) throw new Error("To za daleko w przyszłości — podaj datę w ciągu 3 lat.");
  const before = [...new Set((n.before ?? []).filter((b) => Number.isFinite(b) && b >= 0 && b <= 60 * 24 * 14).map(Math.round))];
  const r: Rem = {
    id: crypto.randomBytes(3).toString("hex"),
    kind,
    text: n.text.trim().slice(0, 300),
    date,
    time,
    at: exact ? iso(exact) : romeAt(date, time ?? "09:00").toISOString(),
    place: n.place?.trim().slice(0, 160) || undefined,
    duration: Math.min(Math.max(Math.round(n.duration ?? (kind === "event" ? 60 : 15)), 5), 60 * 24),
    before: before.length ? before : kind === "event" && time ? [60, 15] : [0],
    repeat: n.repeat,
    next: null,
    status: "active",
    createdAt: iso(now),
  };
  const nx = alertAfter(r, now);
  if (nx) r.next = iso(nx);
  else if (Date.parse(r.at) > now) r.next = r.at; // a meeting in 10 min: no time left for the "1 h before" message
  else if (r.repeat) advance(r, now);
  if (!r.next) throw new Error(`${when(r.date, r.time)} już minęło — podaj inną godzinę albo dzień.`);
  await saveRem(r);
  return r;
}

export async function changeRem(id: string, c: { date?: string; time?: string; text?: string; place?: string }) {
  const r = await findRem(id);
  if (c.text?.trim()) r.text = c.text.trim().slice(0, 300);
  if (c.place !== undefined) r.place = c.place.trim().slice(0, 160) || undefined;
  if (c.time && TIME.test(c.time)) r.time = hhmm(c.time);
  place(r, c.date && DATE.test(c.date) ? c.date : r.date);
  const now = Date.now();
  const nx = alertAfter(r, now);
  r.next = nx ? iso(nx) : Date.parse(r.at) > now ? r.at : null;
  if (!r.next && r.repeat) advance(r, now);
  if (!r.next) throw new Error(`${when(r.date, r.time)} już minęło — podaj inną godzinę albo dzień.`);
  r.status = "active";
  await saveRem(r);
  return r;
}

export async function removeRem(id: string) {
  const r = await findRem(id);
  r.status = "cancelled";
  r.next = null;
  await saveRem(r);
  return r;
}

/** ↩️ after 🗑 */
export async function restoreRem(id: string) {
  const r = await findRem(id);
  const now = Date.now();
  const nx = alertAfter(r, now);
  r.next = nx ? iso(nx) : Date.parse(r.at) > now ? r.at : null;
  if (!r.next && r.repeat) advance(r, now);
  if (!r.next) throw new Error("Ten termin już minął — dodaj go jeszcze raz z nową datą.");
  r.status = "active";
  await saveRem(r);
  return r;
}

export async function doneRem(id: string) {
  const r = await findRem(id);
  if (!r.repeat) {
    r.status = "done";
    r.next = null;
    r.doneAt = iso(Date.now());
    await saveRem(r);
  }
  await journal("reminder", `✅ ${r.text}`);
  return r;
}

/** ⏰ later: a one-off copy for repeating items (the series keeps its own schedule) */
export async function snoozeRem(id: string, minutes: number) {
  const r = await findRem(id);
  const tomorrow = minutes === 1440;
  if (r.repeat) return addRem({ text: r.text, place: r.place, ...(tomorrow ? { date: addDays(today(), 1), time: r.time ?? "09:00" } : { inMinutes: minutes }) });
  const now = Date.now();
  if (tomorrow) {
    r.time = r.time ?? "09:00";
    place(r, addDays(today(), 1));
  } else {
    const t = now + minutes * 60_000;
    ({ date: r.date, time: r.time } = rome(t));
    r.at = iso(t);
  }
  r.kind = "reminder";
  r.before = [0];
  r.next = r.at;
  r.status = "active";
  await saveRem(r);
  return r;
}

/* ─── reading ─────────────────────────────────────────────────────────────── */

/** upcoming (and reminders still waiting for ✅), soonest first */
export async function upcoming(days = 60) {
  const limit = Date.now() + days * 86400_000;
  return (await allRems())
    .filter((r) => (r.status === "active" && Date.parse(r.at) <= limit) || (r.status === "fired" && Date.now() - Date.parse(r.at) < 3 * 86400_000))
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** what is on one Italian day (for the morning message and "jutro" in the report) */
export async function onDay(date: string) {
  return (await allRems()).filter((r) => r.date === date && r.status !== "cancelled").sort((a, b) => a.at.localeCompare(b.at));
}

export function line(r: Rem) {
  return `${r.time ?? "cały dzień"} · ${r.text}${r.place ? ` (📍 ${r.place})` : ""}${r.repeat ? ` 🔁` : ""}`;
}

/** for the AI: one row per item, with the id it needs to change or delete it */
export async function agendaForAi() {
  const list = await upcoming(90);
  if (!list.length) return "AGENDA: (empty)";
  return `AGENDA (id | kind | Italian date time | text …):\n${list
    .slice(0, 40)
    .map(
      (r) =>
        `${r.id} | ${r.kind} | ${r.date} ${r.time ?? "all-day"} (${dayWord(r.date)}) | ${r.text}${r.place ? ` | place: ${r.place}` : ""}${r.repeat ? ` | repeats ${r.repeat}` : ""}${r.kind === "event" ? ` | alerts ${r.before.join(",")} min before` : ""}${r.status === "fired" ? " | sent, NOT marked done yet" : ""}`,
    )
    .join("\n")}`;
}

/* ─── phone calendar ──────────────────────────────────────────────────────── */

/** secret part of the calendar links (same on Vercel and locally: both have ADMIN_SECRET) */
export const calToken = () => crypto.createHmac("sha256", process.env.ADMIN_SECRET ?? "ct").update("calendar").digest("hex").slice(0, 24);
export const feedUrl = () => `${SITE}/api/cal/${calToken()}.ics`;
const eventUrl = (r: Rem) => `${SITE}/api/cal/${calToken()}-${r.id}.ics`;

const RRULE: Record<Repeat, string> = { daily: "FREQ=DAILY", weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", weekly: "FREQ=WEEKLY", monthly: "FREQ=MONTHLY", yearly: "FREQ=YEARLY" };

function end(r: Rem) {
  const e = rome(Date.parse(r.at) + r.duration * 60_000);
  return { date: e.date, time: e.time };
}

/** "Add to Google Calendar" page, already filled in (Android / Gmail users: one tap on Save) */
export function googleUrl(r: Rem) {
  const g = (d: string, t?: string) => `${d.replace(/-/g, "")}${t ? `T${t.replace(":", "")}00` : ""}`;
  const e = end(r);
  const dates = r.time ? `${g(r.date, r.time)}/${g(e.date, e.time)}` : `${g(r.date)}/${g(addDays(r.date, 1))}`;
  const q = new URLSearchParams({ action: "TEMPLATE", text: r.text, dates, ctz: "Europe/Rome", details: "Dodane przez asystenta (Telegram)" });
  if (r.place) q.set("location", r.place);
  if (r.repeat) q.set("recur", `RRULE:${RRULE[r.repeat]}`);
  return `https://calendar.google.com/calendar/render?${q}`;
}

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** RFC 5545 lines: CRLF, folded at 75 bytes */
function fold(lines: string[]) {
  const out: string[] = [];
  for (const l of lines) {
    let rest = l;
    let first = true;
    while (Buffer.byteLength(rest) > (first ? 75 : 74)) {
      let n = first ? 75 : 74;
      while (Buffer.byteLength(rest.slice(0, n)) > (first ? 75 : 74)) n--;
      out.push((first ? "" : " ") + rest.slice(0, n));
      rest = rest.slice(n);
      first = false;
    }
    out.push((first ? "" : " ") + rest);
  }
  return out.join("\r\n") + "\r\n";
}

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Rome",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export function ics(list: Rem[], feed: boolean) {
  const stamp = iso(Date.now()).replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const local = (d: string, t: string) => `${d.replace(/-/g, "")}T${t.replace(":", "")}00`;
  const events = list.flatMap((r) => {
    const e = end(r);
    return [
      "BEGIN:VEVENT",
      `UID:${r.id}@claudiotaras.com`,
      `DTSTAMP:${stamp}`,
      ...(r.time
        ? [`DTSTART;TZID=Europe/Rome:${local(r.date, r.time)}`, `DTEND;TZID=Europe/Rome:${local(e.date, e.time)}`]
        : [`DTSTART;VALUE=DATE:${r.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(r.date, 1).replace(/-/g, "")}`]),
      `SUMMARY:${icsText(r.text)}`,
      ...(r.place ? [`LOCATION:${icsText(r.place)}`] : []),
      ...(r.repeat ? [`RRULE:${RRULE[r.repeat]}`] : []),
      ...(r.status === "done" ? ["STATUS:CONFIRMED"] : []),
      ...r.before.flatMap((b) => ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(r.text)}`, `TRIGGER:${b ? `-PT${b}M` : "PT0M"}`, "END:VALARM"]),
      "END:VEVENT",
    ];
  });
  return fold([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Claudio Taras//Asystent//PL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(feed ? ["X-WR-CALNAME:Asystent (Telegram)", "X-WR-TIMEZONE:Europe/Rome", "REFRESH-INTERVAL;VALUE=DURATION:PT15M", "X-PUBLISHED-TTL:PT15M"] : []),
    ...VTIMEZONE,
    ...events,
    "END:VCALENDAR",
  ]);
}

/** what the phone's calendar subscription shows: the last month and everything ahead */
export async function feedItems() {
  const from = Date.now() - 31 * 86400_000;
  return (await allRems()).filter((r) => r.status !== "cancelled" && (r.repeat || Date.parse(r.at) >= from));
}

/* ─── Telegram ────────────────────────────────────────────────────────────── */

const calButtons = (r: Rem): Button[] => [
  { text: "📅 Google Kalendarz", url: googleUrl(r) },
  { text: "🍏 iPhone / Outlook", url: eventUrl(r) },
];

/** the answer when something was added or changed */
export function savedText(r: Rem, changed = false) {
  const head =
    r.kind === "event"
      ? `📅 ${changed ? "Zmienione" : "Zapisane w kalendarzu"}: <b>${esc(when(r.date, r.time))}</b> — ${esc(r.text)}`
      : `⏰ ${changed ? "Zmienione — przypomnę" : "Przypomnę Ci"} <b>${esc(when(r.date, r.time))}</b>: ${esc(r.text)}`;
  const alertsNote =
    r.kind === "event" && r.before.some((b) => b > 0)
      ? `\nNapiszę ${r.before
          .filter((b) => b > 0)
          .sort((a, b) => b - a)
          .map(lead)
          .join(" i ")} wcześniej${r.before.includes(0) ? " i o czasie" : ""}.`
      : "";
  return `${head}${r.place ? `\n📍 ${esc(r.place)}` : ""}${r.repeat ? `\n🔁 ${REPEAT_PL[r.repeat]}` : ""}${alertsNote}`;
}

export function savedButtons(r: Rem): Button[][] {
  return [calButtons(r), [{ text: "🗑 Usuń", data: `rm:${r.id}` }]];
}

async function notify(r: Rem, leadMin: number) {
  const where = r.place ? `\n📍 ${esc(r.place)}` : "";
  const maps: Button[] = r.place ? [{ text: "🗺 Mapa", url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.place)}` }] : [];
  let html: string;
  let buttons: Button[][];
  if (leadMin > 0) {
    html = `📅 Za ${lead(leadMin)}${r.time ? ` (${r.time})` : ""}: <b>${esc(r.text)}</b>${where}`;
    buttons = [[{ text: "👍 OK", data: `rk:${r.id}` }, ...maps]];
  } else if (r.kind === "event") {
    html = `📅 ${r.time ? "Teraz" : "Dziś"}: <b>${esc(r.text)}</b>${where}`;
    buttons = [[{ text: "👍 OK", data: `rk:${r.id}` }, ...maps]];
  } else {
    html = `⏰ <b>${esc(r.text)}</b>${where}${r.repeat ? `\n🔁 ${REPEAT_PL[r.repeat]}` : ""}`;
    buttons = [
      [{ text: "✅ Zrobione", data: `rd:${r.id}` }],
      [
        { text: "⏰ 10 min", data: `rz:${r.id}:10` },
        { text: "⏰ 1 godz.", data: `rz:${r.id}:60` },
        { text: "📅 Jutro", data: `rz:${r.id}:1440` },
      ],
    ];
  }
  for (const id of admins()) await send(id, html, buttons);
}

/**
 * Send everything due before `until`. Items due a little later are awaited in this same call (the
 * caller passes how long until the next wake-up), so a reminder comes on its minute even when the
 * clock only knocks every few minutes.
 */
export async function fireDue(until: number) {
  const due = (await allRems()).filter((r) => r.status === "active" && r.next && Date.parse(r.next) <= until);
  let sent = 0;
  await Promise.all(
    due.map(async (r) => {
      const wait = Date.parse(r.next!) - Date.now();
      if (wait > 0) await new Promise((res) => setTimeout(res, wait));
      if (await fire(r.id, r.next!)) sent++;
    }),
  );
  return sent;
}

async function fire(id: string, slot: string) {
  const claim = `once:${slot.slice(0, 10)}:rem:${id}:${slot}`;
  if (!(await kv.once(claim))) return false;
  const r = await kv.get<Rem>(KEY(id));
  if (!r || r.status !== "active" || r.next !== slot) return false; // changed or deleted meanwhile
  try {
    await notify(r, Math.round((Date.parse(r.at) - Date.parse(slot)) / 60_000));
  } catch (e) {
    await kv.del(claim).catch(() => {}); // Telegram down: the next wake-up tries again
    throw e;
  }
  const t = Date.parse(slot);
  const nx = alertAfter(r, t);
  if (nx) r.next = iso(nx);
  else if (r.repeat) advance(r, Math.max(Date.now(), t));
  else {
    r.next = null;
    r.status = r.kind === "event" ? "done" : "fired";
  }
  await saveRem(r);
  return true;
}

/** once a day: old finished items and the once-keys go away */
export async function cleanupRems() {
  const t = today();
  await kv.prune("once:", `once:${addDays(t, -3)}`).catch(() => {});
  await kv.prune("day:", `day:${addDays(t, -60)}`).catch(() => {});
  const old = Date.now() - 45 * 86400_000;
  for (const r of await allRems()) {
    if (r.repeat && r.status === "active") continue;
    if ((r.status === "done" || r.status === "cancelled" || r.status === "fired") && Date.parse(r.at) < old) await kv.del(KEY(r.id));
    else if (r.status === "fired" && Date.now() - Date.parse(r.at) > 14 * 86400_000) await saveRem({ ...r, status: "done" });
  }
}
