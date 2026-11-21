import "server-only";
import { z } from "zod";
import { answer, edit, esc, send, typing } from "../bot/telegram";
import { journal } from "./journal";
import {
  addRem,
  changeRem,
  doneRem,
  feedUrl,
  fireDue,
  removeRem,
  repeats,
  restoreRem,
  savedButtons,
  savedText,
  snoozeRem,
  type Rem,
} from "./reminders";
import { assistantCfg, buildReport, sendIdea, setAssistantCfg } from "./report";
import { today, when } from "./time";

/*
 * The personal-assistant part of the bot. Unlike site changes these need no ✅: a reminder is saved
 * at once and the answer carries 🗑 (and ↩️ after it), so nothing is ever lost by a misheard word.
 */

const hm = z.string().regex(/^\d{1,2}:\d{2}$/);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const opt = <T extends z.ZodTypeAny>(s: T) => s.optional().catch(undefined);

export const AssistantActions = [
  z.object({
    type: z.literal("reminder_add"),
    text: z.string().min(1).max(300),
    kind: z.enum(["reminder", "event"]).catch("reminder"),
    date: opt(ymd),
    time: opt(hm),
    in_minutes: opt(z.coerce.number().min(1).max(60 * 24 * 90)),
    place: opt(z.string().max(160)),
    before: opt(z.array(z.coerce.number().int().min(0).max(20160)).max(4)),
    repeat: opt(z.enum(repeats)),
    duration: opt(z.coerce.number().int().min(5).max(1440)),
  }),
  z.object({ type: z.literal("reminder_change"), id: z.string().min(3), date: opt(ymd), time: opt(hm), text: opt(z.string().max(300)), place: opt(z.string().max(160)) }),
  z.object({ type: z.literal("reminder_remove"), id: z.string().min(3) }),
  z.object({ type: z.literal("reminder_done"), id: z.string().min(3) }),
  z.object({ type: z.literal("note"), text: z.string().min(1).max(300) }),
  z.object({ type: z.literal("assistant_settings"), report: opt(z.union([hm, z.literal("")])), morning: opt(z.union([hm, z.literal("")])) }),
  z.object({ type: z.literal("report_now") }),
  z.object({ type: z.literal("calendar_link") }),
] as const;

const Assistant = z.discriminatedUnion("type", [...AssistantActions]);
export type AssistantAction = z.infer<typeof Assistant>;
const TYPES = new Set(AssistantActions.map((s) => s.shape.type.value));
export const isAssistant = (a: { type: string }): a is AssistantAction => TYPES.has(a.type as AssistantAction["type"]);

const pad = (t?: string) => (t ? t.padStart(5, "0") : t);

/** a reminder due within the next minute and a half is sent from this same request */
async function soon(r: Rem) {
  if (r.next && Date.parse(r.next) - Date.now() < 90_000) await fireDue(Date.parse(r.next) + 500);
}

export function calendarHelp() {
  return `📅 <b>Twój kalendarz w telefonie</b>
Wszystko, co mi każesz zapamiętać, jest pod tym adresem. Dodaj go raz, a nowe terminy pojawią się same:
<code>${esc(feedUrl())}</code>

🍏 <b>iPhone</b>: Ustawienia → Kalendarz (w nowym iOS: Aplikacje → Kalendarz) → Konta → Dodaj konto → Inne → <i>Dodaj subskrybowany kalendarz</i> → wklej adres.
🤖 <b>Android / Kalendarz Google</b>: na komputerze calendar.google.com → „Inne kalendarze” ＋ → <i>Z adresu URL</i> → wklej adres. Google odświeża go co kilka godzin, więc przy każdym terminie masz też przycisk „📅 Google Kalendarz”, który dodaje go od razu.

I tak Ci przypomnę tutaj, o czasie.`;
}

export async function runAssistant(a: AssistantAction, chat: number) {
  switch (a.type) {
    case "reminder_add": {
      const r = await addRem({
        text: a.text,
        kind: a.kind,
        date: a.date,
        time: pad(a.time),
        inMinutes: a.in_minutes,
        place: a.place,
        before: a.before,
        repeat: a.repeat,
        duration: a.duration,
      });
      await send(chat, savedText(r), savedButtons(r));
      await soon(r);
      return;
    }
    case "reminder_change": {
      const r = await changeRem(a.id, { date: a.date, time: pad(a.time), text: a.text, place: a.place });
      await send(chat, savedText(r, true), savedButtons(r));
      await soon(r);
      return;
    }
    case "reminder_remove": {
      const r = await removeRem(a.id);
      await send(chat, `🗑 Usunięte: ${esc(r.text)} (${esc(when(r.date, r.time))})`, [[{ text: "↩️ Przywróć", data: `rb:${r.id}` }]]);
      return;
    }
    case "reminder_done": {
      const r = await doneRem(a.id);
      await send(chat, `✅ Zrobione: ${esc(r.text)}`);
      return;
    }
    case "note":
      await journal("note", a.text);
      await send(chat, `📝 Zanotowane: „${esc(a.text)}” — będzie w wieczornym raporcie.`);
      return;
    case "assistant_settings": {
      const c = await setAssistantCfg({ report: a.report === "" ? "" : pad(a.report), morning: a.morning === "" ? "" : pad(a.morning) });
      await send(chat, `⚙️ Raport dnia: ${c.report ? `codziennie o <b>${c.report}</b>` : "wyłączony"}\n☀️ Plan na dzień: ${c.morning ? `rano o <b>${c.morning}</b> (tylko gdy coś jest w kalendarzu)` : "wyłączony"}`);
      return;
    }
    case "report_now": {
      const { html, buttons } = await typing(chat, () => buildReport(today()));
      await send(chat, html, buttons);
      return;
    }
    case "calendar_link":
      await send(chat, calendarHelp());
      return;
  }
}

/** one line per action for the bot's answer when it can't do them right now */
export function describeAssistant(a: AssistantAction) {
  switch (a.type) {
    case "reminder_add":
      return `⏰ ${a.text}`;
    case "reminder_change":
      return `⏰ zmiana ${a.id}`;
    case "reminder_remove":
      return `🗑 ${a.id}`;
    case "reminder_done":
      return `✅ ${a.id}`;
    case "note":
      return `📝 ${a.text}`;
    case "assistant_settings":
      return "⚙️ godziny raportu";
    case "report_now":
      return "🌙 raport teraz";
    case "calendar_link":
      return "📅 link do kalendarza";
  }
}

/** Buttons under reminders, events and the report. Returns false for buttons that aren't ours. */
export async function assistantButton(kind: string, args: string[], q: { id: string; chat: number; msgId?: number; text?: string }) {
  const id = args[0] ?? "";
  const was = esc(q.text ?? "");
  switch (kind) {
    case "rd": {
      const r = await doneRem(id);
      await answer(q.id, "Zrobione ✅");
      if (q.msgId) await edit(q.chat, q.msgId, `${was}\n\n✅ Zrobione${r.repeat ? " (następne zgodnie z planem)" : ""}`);
      return true;
    }
    case "rz": {
      const r = await snoozeRem(id, Number(args[1]) || 10);
      await answer(q.id, `Przypomnę ${when(r.date, r.time)}`);
      if (q.msgId) await edit(q.chat, q.msgId, `${was}\n\n⏰ Przypomnę ${esc(when(r.date, r.time))}`);
      return true;
    }
    case "rk":
      await answer(q.id, "👍");
      if (q.msgId) await edit(q.chat, q.msgId, `${was}\n\n👍`);
      return true;
    case "rm": {
      const r = await removeRem(id);
      await answer(q.id, "Usunięte");
      if (q.msgId) await edit(q.chat, q.msgId, `🗑 Usunięte: ${esc(r.text)}`, [[{ text: "↩️ Przywróć", data: `rb:${r.id}` }]]);
      return true;
    }
    case "rb": {
      const r = await restoreRem(id);
      await answer(q.id, "Przywrócone");
      if (q.msgId) await edit(q.chat, q.msgId, savedText(r), savedButtons(r));
      return true;
    }
    case "ix":
      await answer(q.id, "Myślę… 💡");
      await typing(q.chat, () => sendIdea(q.chat));
      return true;
  }
  return false;
}

/** for /stats */
export async function assistantLine() {
  const c = await assistantCfg();
  return `🗓 Asystent: raport ${c.report ? `o ${c.report}` : "wyłączony"} · rano ${c.morning || "wyłączone"}`;
}
