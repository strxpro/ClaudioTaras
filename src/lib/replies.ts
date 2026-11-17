import "server-only";
import { ask } from "./ai";
import { db } from "./db";
import { sendReply } from "./notify";
import type { Message } from "./types";

const LANG: Record<string, string> = { pl: "Polish", it: "Italian", en: "English", es: "Spanish", de: "German", fr: "French" };

/** Find a request by full id or its first 8 characters (what the bot shows). */
export async function findMessage(id: string): Promise<Message | undefined> {
  return (await db.messages()).find((m) => m.id === id || m.id.startsWith(id));
}

/**
 * Reply to a client: branded e-mail (Resend) + saved in the request's thread + status "replied".
 * Without RESEND_API_KEY the reply is still saved, `emailed` tells the caller it was not sent.
 */
export async function replyToClient(id: string, text: string, via: "admin" | "telegram") {
  const m = await findMessage(id);
  if (!m) throw new Error("Nie ma takiego zapytania.");
  const body = text.trim().slice(0, 8000);
  if (!body) throw new Error("Pusta odpowiedź.");
  const emailed = await sendReply(m, body).catch(() => false);
  const saved: Message = { ...m, status: "replied", replies: [...(m.replies ?? []), { at: new Date().toISOString(), text: body, via }] };
  await db.saveMessage(saved);
  return { message: saved, emailed };
}

/**
 * Turn Claudio's rough note (often a transcribed voice message in Polish) into a warm, short reply
 * in the client's language, signed-off style left to the e-mail template.
 */
export async function polishReply(m: Message, draft: string): Promise<string> {
  const lang = LANG[m.locale] ?? "English";
  const { text } = await ask(
    [
      {
        role: "system",
        content: `You write e-mail replies for Claudio Taras, a web designer & developer, to people who asked about a project on his site. Rewrite his note as the reply body in ${lang}: warm, direct, human, 2–6 short sentences, no subject line, no greeting placeholder like [Name], no signature (the template adds it). Start with a greeting using the client's first name. Keep every fact, price and date he mentions; add nothing he didn't say. Output only the reply text.`,
      },
      { role: "user", content: `Client: ${m.name}\nTheir request: ${m.services.join(", ")} · ${m.budget} · ${m.timeline}\n"${m.message.slice(0, 1200)}"\n\nClaudio's note:\n${draft}` },
    ],
    { maxTokens: 700 },
  );
  return text.trim().replace(/^["„“]|["”]$/g, "");
}
