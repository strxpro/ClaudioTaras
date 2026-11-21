import "server-only";
import crypto from "node:crypto";
import { db, kv, storeUpload } from "../db";
import type { Message } from "../types";
import { findMessage, polishReply, replyToClient } from "../replies";
import { describe, execute, think, undo, visitsLine, type Action } from "./agent";
import { admins, answer, download, edit, esc, send, typing, type Button } from "./telegram";
import { transcribe } from "./transcribe";
import { workerLine } from "../worker";
import { assistantButton, assistantLine, calendarHelp, describeAssistant, isAssistant, runAssistant } from "../assistant/actions";
import { journal } from "../assistant/journal";
import { buildReport } from "../assistant/report";
import { tickLine } from "../assistant/tick";
import { today } from "../assistant/time";

/** The parts of a Telegram update we use. */
export type Update = {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number };
    text?: string;
    caption?: string;
    voice?: { file_id: string };
    audio?: { file_id: string };
    photo?: { file_id: string; width: number; height: number }[];
    reply_to_message?: { text?: string; caption?: string };
  };
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { message_id: number; chat: { id: number }; text?: string } };
};

type Pending = { actions: Action[]; photo?: string; lines: string[]; reply: string; at: number };
/** Claudio pressed "💬 Odpowiedz": his next text / voice note is the reply to this request. */
type ReplyTo = { id: string; at: number };
/** A reply waiting for ✅: the polished version (client's language) and his own words. */
type Draft = { id: string; text: string; raw: string; at: number };

const LANG_PL: Record<string, string> = { pl: "po polsku", it: "po włosku", en: "po angielsku", es: "po hiszpańsku", de: "po niemiecku", fr: "po francusku" };

const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
const httpsLink = (path: string) => (/^https:\/\//.test(site()) ? `${site()}${path}` : undefined);

const HELP = `👋 <b>Cześć Claudio!</b> Pisz albo mów do mnie — w każdym języku. Przykłady:
• „Co nowego w zapytaniach?” / „Pokaż ostatnie zapytanie”
• „Oznacz zapytanie od Marco jako przeczytane”
• „Zmień hasło Villa Dea na: Dom nad morzem, rezerwacje bez pośredników”
• „Przepisz teksty projektu Oltre, bardziej o AI”
• „Dodaj do Il Girasole liczbę 4,8 — ocena Google”
• „Przesuń Lumo na pierwsze miejsce” / „Wyróżnij SpabiNext”
• „Nie przyjmuję teraz projektów” → przełącza dostępność
• „Strona Villa Dea się zmieniła” → Twój komputer nagra nowe zrzuty i wideo, wstawi je na stronę i napisze nowe opisy
• „W F:\\hotel jest nowa wersja hotelu” / „Odśwież zrzuty Pizzerii” (same zdjęcia, opisy zostają)
• „Dodaj projekt z folderu F:\\Projekty\\nowy” / „Dodaj projekt https://nowastrona.it”
• Zdjęcie z podpisem „do galerii Onda” albo „to moje zdjęcie”
• „Ile osób było dziś na stronie?” / „Skąd są odwiedzający?”
• „Odpowiedz Marco, że w piątek wyślę wycenę” — albo 💬 Odpowiedz pod zapytaniem (albo po prostu odpowiedz na powiadomienie, przesuwając je w lewo)
• „Cofnij”
Zanim cokolwiek zmienię albo wyślę, pokażę plan i poczekam na ✅. Nowe zapytania z formularza przychodzą tu same. /stats — szybkie liczby.

🗓 <b>Jestem też Twoim asystentem</b> (to zapisuję od razu):
• „Przypomnij mi jutro o 10 zadzwonić do Marco” / „za 20 minut wyjąć pizzę”
• „W czwartek o 15 spotkanie z klientem w Olbii” → kalendarz + przypomnę godzinę i 15 min wcześniej
• „Codziennie o 9 przypomnij mi sprawdzić maile” / „Co mam jutro?” / „Przesuń spotkanie na 16”
• „Zanotuj: skończyłem layout hotelu” → trafi do wieczornego raportu
• Codziennie o 20:00 raport dnia: kto był na stronie, co poprawić, pomysł na system, plan na jutro („raport o 21” zmienia godzinę)
/raport — raport teraz · /kalendarz — jak mieć wszystko w kalendarzu w telefonie`;

async function revalidate(origin?: string) {
  if (!origin) return;
  await fetch(`${origin}/api/revalidate`, { method: "POST", headers: { "x-revalidate-secret": process.env.TELEGRAM_WEBHOOK_SECRET ?? "" } }).catch(() => {});
}

export async function handleUpdate(u: Update, origin?: string) {
  if (u.callback_query) return onButton(u.callback_query, origin);
  const m = u.message;
  if (!m?.from) return;
  const chat = m.chat.id;
  if (!admins().includes(m.from.id)) {
    // strangers get nothing — except their own id on /start, so the owner can set ADMIN_TELEGRAM_ID
    if (m.text?.startsWith("/start")) await send(chat, `🔒 To prywatny bot portfolio.\nTwoje Telegram ID: <code>${m.from.id}</code>\n(właściciel wpisuje je w ADMIN_TELEGRAM_ID)`);
    return;
  }
  try {
    if (m.text === "/start" || m.text === "/help" || /^(pomoc|help|aiuto|hilfe|ayuda|aide|\?)$/i.test(m.text?.trim() ?? "")) return void (await send(chat, HELP));
    if (m.text === "/status" || m.text === "/stats") return void (await send(chat, await status()));
    if (m.text === "/kalendarz" || m.text === "/calendar") return void (await send(chat, calendarHelp()));
    if (m.text === "/raport" || m.text === "/report") {
      const r = await typing(chat, () => buildReport(today()));
      return void (await send(chat, r.html, r.buttons));
    }
    if (m.text === "/anuluj" || m.text === "/cancel") {
      await kv.del(`bot:replyto:${chat}`);
      return void (await send(chat, "OK, nic nie wysyłam."));
    }

    let text = (m.text ?? m.caption ?? "").trim();
    let photo: string | undefined;
    if (m.voice || m.audio) {
      const file = await typing(chat, () => download((m.voice ?? m.audio)!.file_id));
      text = await typing(chat, () => transcribe(file.bytes));
      await send(chat, `🎙️ Zrozumiałem: „${esc(text)}”`);
    }
    if (m.photo?.length) {
      const big = m.photo[m.photo.length - 1];
      const file = await typing(chat, () => download(big.file_id));
      photo = await storeUpload(new File([file.bytes], `telegram-${Date.now()}.jpg`, { type: "image/jpeg" }), "telegram");
    }
    if (!text && !photo) return;

    // reply mode: after "💬 Odpowiedz", or a swipe-reply to a request notification (it carries #id)
    const quoted = (m.reply_to_message?.text ?? m.reply_to_message?.caption ?? "").match(/#([\w-]{8})\b/i)?.[1];
    const pendingTo = await kv.get<ReplyTo>(`bot:replyto:${chat}`);
    const replyId = quoted ?? (pendingTo && Date.now() - pendingTo.at < 60 * 60_000 ? pendingTo.id : undefined);
    if (replyId && text && !photo && !text.startsWith("/")) {
      await kv.del(`bot:replyto:${chat}`);
      return void (await draftReply(chat, replyId, text));
    }

    const t = await typing(chat, () => think(text || "(zdjęcie bez podpisu)", chat, !!photo));
    // reminders, calendar, notes: saved at once, each answers with its own message (🗑 / ↩️ inside)
    const mine = t.actions.filter(isAssistant);
    if (mine.length) {
      for (const a of mine) {
        try {
          await runAssistant(a, chat);
        } catch (e) {
          await send(chat, `😕 ${esc(describeAssistant(a))}: ${esc((e as Error).message).slice(0, 300)}`);
        }
      }
      t.actions = t.actions.filter((a) => !isAssistant(a));
      if (!t.actions.length) return;
    }
    if (!t.actions.length) return void (await send(chat, esc(t.reply)));
    if (t.actions.every((a) => a.type === "undo")) {
      await send(chat, await undo());
      return void (await revalidate(origin));
    }
    const projects = await db.projects({ all: true });
    const lines = t.actions.map((a) => describe(a, projects));
    const id = crypto.randomUUID().slice(0, 10);
    await kv.set(`bot:pending:${id}`, { actions: t.actions, photo, lines, reply: t.reply, at: Date.now() } satisfies Pending);
    await send(chat, `${esc(t.reply)}\n\n${lines.map(esc).join("\n")}`, [
      [
        { text: "✅ Potwierdź", data: `ok:${id}` },
        { text: "❌ Anuluj", data: `no:${id}` },
      ],
    ]);
  } catch (e) {
    await send(chat, `😕 ${esc((e as Error).message).slice(0, 500)}`).catch(() => {});
  }
}

async function onButton(q: NonNullable<Update["callback_query"]>, origin?: string) {
  if (!admins().includes(q.from.id)) return void (await answer(q.id));
  const chat = q.message?.chat.id ?? q.from.id;
  const msgId = q.message?.message_id;
  const [kind, id] = (q.data ?? "").split(":");
  try {
    if (kind === "ok" || kind === "no") {
      const p = await kv.get<Pending>(`bot:pending:${id}`);
      if (!p || Date.now() - p.at > 24 * 3600_000) {
        await answer(q.id, "⏱️ Wygasło — powtórz polecenie.");
        if (msgId) await edit(chat, msgId, "⏱️ Ta prośba wygasła.");
        return;
      }
      await kv.del(`bot:pending:${id}`);
      const plan = p.lines.map(esc).join("\n");
      if (kind === "no") {
        await answer(q.id, "Anulowano");
        if (msgId) await edit(chat, msgId, `${plan}\n\n❌ Anulowano, nic nie zmieniłem.`);
        return;
      }
      await answer(q.id, "Zapisuję…");
      if (msgId) await edit(chat, msgId, `${plan}\n\n⏳ Zapisuję…`);
      const extra = await typing(chat, () => execute(p.actions, { chatId: chat, origin, photo: p.photo }));
      await revalidate(origin);
      for (const l of p.lines) await journal("bot", l);
      // recordings are only handed to the computer here: nothing changed yet, so nothing to undo
      const onlyJobs = p.actions.every((a) => a.type === "project_refresh" || a.type === "project_import");
      const one = p.actions.find((a): a is Extract<Action, { slug: string }> => "slug" in a);
      const link = one ? httpsLink(`/pl/work/${one.slug}`) : httpsLink("/pl");
      const buttons: Button[][] = onlyJobs ? [] : [[{ text: "↩️ Cofnij", data: "undo:" }, ...(link ? [{ text: "🌐 Zobacz", url: link }] : [])]];
      const head = onlyJobs ? "✅ Przyjęte." : "✅ Gotowe! Strona jest zaktualizowana.";
      if (msgId) await edit(chat, msgId, `${plan}\n\n${head}${extra.length ? `\n${extra.map(esc).join("\n")}` : ""}`, buttons);
      return;
    }
    if (kind === "rp") {
      const m = await findMessage(id);
      if (!m) return void (await answer(q.id, "Nie ma już tego zapytania"));
      await kv.set(`bot:replyto:${chat}`, { id: m.id, at: Date.now() } satisfies ReplyTo);
      await answer(q.id, "Słucham ✍️");
      await send(
        chat,
        `✍️ Odpowiedź dla <b>${esc(m.name)}</b> — napisz albo nagraj ją po swojemu. Przerobię ją na ładny e-mail ${LANG_PL[m.locale] ?? "po angielsku"} i pokażę przed wysłaniem.`,
        [[{ text: "❌ Anuluj", data: "rx:" }]],
      );
      return;
    }
    if (kind === "rs" || kind === "rr") {
      const d = await kv.get<Draft>(`bot:draft:${id}`);
      if (!d) {
        await answer(q.id, "⏱️ Wygasło");
        if (msgId) await edit(chat, msgId, "⏱️ Ta odpowiedź wygasła — napisz ją jeszcze raz.");
        return;
      }
      await kv.del(`bot:draft:${id}`);
      await answer(q.id, "Wysyłam…");
      const text = kind === "rs" ? d.text : d.raw;
      const r = await replyToClient(d.id, text, "telegram");
      if (msgId)
        await edit(
          chat,
          msgId,
          `${r.emailed ? `✅ Wysłane do ${esc(r.message.email)}` : "⚠️ Zapisane w wątku, ale e-mail nie wyszedł — ustaw MAIL_WEBHOOK_URL (Make.com + Gmail, za darmo) albo RESEND_API_KEY."}\n\n„${esc(text.slice(0, 3000))}”`,
          messageButtons(r.message, "replied"),
        );
      return;
    }
    if (kind === "rx") {
      await kv.del(`bot:replyto:${chat}`);
      if (id) await kv.del(`bot:draft:${id}`);
      await answer(q.id, "Anulowano");
      if (msgId) await edit(chat, msgId, "❌ Anulowano — nic nie wysłałem.");
      return;
    }
    if (kind === "undo") {
      await answer(q.id);
      await send(chat, await undo());
      await revalidate(origin);
      return;
    }
    if (kind === "mr" || kind === "ma" || kind === "mp") {
      const status = kind === "mr" ? "read" : kind === "ma" ? "archived" : "replied";
      const m = (await db.messages()).find((x) => x.id === id);
      if (m) await db.saveMessage({ ...m, status });
      await answer(q.id, status === "read" ? "Przeczytane ✓" : status === "archived" ? "W archiwum 🗄" : "Odpowiedziane ✓");
      if (msgId && q.message?.text) await edit(chat, msgId, `${esc(q.message.text)}\n\n${status === "read" ? "✓ przeczytane" : status === "archived" ? "🗄 w archiwum" : "✓ odpowiedziane"}`, messageButtons(m, status));
      return;
    }
    // reminders (✅ / ⏰ / 🗑 / ↩️) and the report's 💡
    if (await assistantButton(kind, (q.data ?? "").split(":").slice(1), { id: q.id, chat, msgId, text: q.message?.text })) return;
    await answer(q.id);
  } catch (e) {
    await answer(q.id, "😕 Błąd");
    await send(chat, `😕 ${esc((e as Error).message).slice(0, 500)}`).catch(() => {});
  }
}

async function status() {
  const [projects, messages, settings] = await Promise.all([db.projects({ all: true }), db.messages(), db.settings()]);
  const unread = messages.filter((m) => m.status === "new");
  return `📊 <b>Portfolio</b>
Projekty: ${projects.length} (${projects.filter((p) => p.published).length} na stronie, ${projects.filter((p) => p.featured).length} wyróżnionych)
Zapytania: ${messages.length} · nowe: <b>${unread.length}</b>
Dostępność: ${settings.available ? "✅ przyjmuję projekty" : "⛔ kalendarz pełny"}
${await workerLine().catch(() => "🖥 Komputer: brak danych")}
${await assistantLine().catch(() => "🗓 Asystent: brak danych")}
${await tickLine().catch(() => "")}

${await visitsPl()}`;
}

/** The traffic numbers for /stats, in Polish. */
async function visitsPl() {
  const { analytics } = await import("../db");
  const s = await analytics.stats(30).catch(() => null);
  if (!s) return "👀 Odwiedziny: brak danych";
  const sum = (n: number) => s.byDay.slice(-n).reduce((a, d) => a + d.visitors, 0);
  const flag = (cc: string) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) : "🌐");
  return `👀 <b>Odwiedziny</b> (osoby)
Dziś: <b>${s.today.visitors}</b> · 7 dni: ${sum(7)} · 30 dni: ${s.visitors}
${s.countries.slice(0, 5).map((c) => `${flag(c.country)} ${c.views}`).join("  ") || ""}`;
}

/** Turn Claudio's note into a reply in the client's language and show it with ✅ / ❌. */
async function draftReply(chat: number, id: string, raw: string) {
  const m = await findMessage(id);
  if (!m) return void (await send(chat, "Nie znalazłem tego zapytania."));
  let text = raw;
  try {
    text = await typing(chat, () => polishReply(m, raw));
  } catch {}
  const key = crypto.randomUUID().slice(0, 10);
  await kv.set(`bot:draft:${key}`, { id: m.id, text, raw, at: Date.now() } satisfies Draft);
  await send(chat, `📨 <b>Do: ${esc(m.name)}</b> &lt;${esc(m.email)}&gt;\n\n${esc(text)}`, [
    [{ text: "✅ Wyślij", data: `rs:${key}` }],
    ...(text !== raw ? [[{ text: "📝 Wyślij moje słowa bez zmian", data: `rr:${key}` }]] : []),
    [{ text: "❌ Anuluj", data: `rx:${key}` }],
  ]);
}

function messageButtons(m: Message | undefined, current?: string): Button[][] {
  if (!m) return [];
  const rows: Button[][] = [
    [{ text: m.replies?.length ? "💬 Odpowiedz jeszcze raz" : "💬 Odpowiedz", data: `rp:${m.id}` }],
    [
      ...(current !== "read" ? [{ text: "✓ Przeczytane", data: `mr:${m.id}` }] : []),
      ...(current !== "replied" ? [{ text: "✉️ Odpowiedziane", data: `mp:${m.id}` }] : []),
      ...(current !== "archived" ? [{ text: "🗄 Archiwum", data: `ma:${m.id}` }] : []),
    ],
  ];
  const link: Button[] = [];
  const phone = m.phone?.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (phone && phone.length >= 8) link.push({ text: "💬 WhatsApp", url: `https://wa.me/${phone}` });
  const panel = httpsLink(`/admin/messages/${m.id}`);
  if (panel) link.push({ text: "🗂 W panelu", url: panel });
  if (link.length) rows.push(link);
  return rows.filter((r) => r.length);
}

/** New contact request → every admin's Telegram, with quick actions. */
export async function notifyMessage(m: Message, uploads: import("./telegram").Upload[] = []) {
  const lines = [
    `✉️ <b>Nowe zapytanie</b> — ${esc(m.name)}${m.company ? ` (${esc(m.company)})` : ""}`,
    `${esc(m.email)}${m.phone ? ` · ${esc(m.phone)}` : ""}`,
    `🧩 ${esc(m.services.join(", "))}`,
    `💰 ${esc(m.budget)} · ⏱ ${esc(m.timeline)}`,
    m.meeting ? `📅 <b>Rozmowa: ${esc(m.meeting)}</b> (czas włoski)` : "",
    m.website ? `🌐 ${esc(m.website)}` : "",
    "",
    `„${esc(m.message.slice(0, 1500))}”`,
    ...(m.attachments ?? []).map((a, i) => {
      const url = /^https?:/.test(a) ? a : `${site()}${a}`;
      return /^https?:/.test(url) ? `📎 <a href="${esc(url)}">Załącznik ${i + 1}</a>` : `📎 Załącznik ${i + 1}: ${esc(a)}`;
    }),
    "",
    `<i>Odpowiedz na tę wiadomość (przesuń w lewo), a wyślę klientowi e-mail · #${m.id.slice(0, 8)}</i>`,
  ].filter((l, i, all) => l || (i > 0 && all[i - 1]));
  const { notifyAdmins, sendUploads, botEnabled } = await import("./telegram");
  await notifyAdmins(lines.join("\n"), messageButtons(m));
  await journal("request", `✉️ Nowe zapytanie: ${m.name} (${m.services.join(", ")})`);
  // the photos as an album, PDFs as downloadable files, right under the request
  if (uploads.length && botEnabled())
    await Promise.all(admins().map((id) => sendUploads(id, uploads, `📎 ${m.name} · #${m.id.slice(0, 8)}`).catch((e) => console.error("[telegram] files", e))));
}
