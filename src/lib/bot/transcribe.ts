import "server-only";
import { db } from "../db";

/**
 * Voice notes → text. GROQ_API_KEY (free, Whisper large v3) or OPENAI_API_KEY. The prompt carries
 * the portfolio's own words (project names, panel vocabulary) so they come out spelled right.
 */
export async function transcribe(audio: ArrayBuffer, filename = "voice.ogg"): Promise<string> {
  const groq = process.env.GROQ_API_KEY;
  const key = groq || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Do głosówek potrzebny jest darmowy GROQ_API_KEY (console.groq.com) — dopisz go do .env.local. Tekstem działa bez niego.");
  const url = groq ? "https://api.groq.com/openai/v1/audio/transcriptions" : "https://api.openai.com/v1/audio/transcriptions";
  const models = groq ? ["whisper-large-v3", "whisper-large-v3-turbo"] : ["gpt-4o-transcribe"];
  const names = (await db.projects({ all: true })).map((p) => p.name).join(", ");
  // Whisper reads only the end of the prompt: the project names go last
  const prompt = `Portfolio Claudio Taras. Projekt, strona, hasło, opis, wyzwanie, rozwiązanie, funkcje, technologie, opublikuj, wyróżnij, zrzuty, wiadomość, zapytanie, dostępność, przetłumacz. Progetto, sito, recensioni. ${names}.`.slice(-900);
  let last = 0;
  for (const model of models) {
    const form = new FormData();
    form.append("file", new Blob([audio], { type: "audio/ogg" }), filename);
    form.append("model", model);
    form.append("temperature", "0");
    form.append("prompt", prompt);
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(45_000) }).catch(() => null);
    if (res?.ok) return (((await res.json()) as { text?: string }).text ?? "").trim();
    last = res?.status ?? 0;
  }
  throw new Error(`Nie udało się rozpoznać głosówki (${last}).`);
}
