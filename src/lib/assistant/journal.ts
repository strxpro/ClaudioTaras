import "server-only";
import { kv } from "../db";
import { today } from "./time";

/**
 * What happened today, for the evening report: changes made through the bot, new contact requests,
 * the computer's recordings, reminders done and Claudio's own notes ("zanotuj: …").
 * kv "day:<YYYY-MM-DD>" (Italian date). The worker writes the same list (scripts/worker/supa.mjs).
 */
export type Entry = { at: string; kind: "bot" | "request" | "worker" | "note" | "reminder"; text: string };

export async function journal(kind: Entry["kind"], text: string) {
  try {
    const key = `day:${today()}`;
    const list = (await kv.get<Entry[]>(key)) ?? [];
    list.push({ at: new Date().toISOString(), kind, text: text.slice(0, 300) });
    await kv.set(key, list.slice(-80));
  } catch (e) {
    console.error("[journal]", e);
  }
}

export const dayLog = async (date: string) => (await kv.get<Entry[]>(`day:${date}`).catch(() => null)) ?? [];
