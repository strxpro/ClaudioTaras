import "server-only";
import crypto from "node:crypto";
import { kv, usingSupabase } from "./db";

/**
 * Jobs for Claudio's computer. The bot runs on Vercel: no browser for recordings, no F: drive. So new
 * screenshots / new projects go into Supabase (kv "job:<id>") and the worker on his computer
 * (scripts/worker/index.mjs, `npm run worker`) does them and reports on Telegram by itself.
 */
export type WorkJob = {
  id: string;
  kind: "refresh" | "import";
  slug?: string;
  projectId?: string;
  name?: string;
  /** a link or a folder (F:\hotel); empty = the project's own site / folder */
  source?: string;
  /** the site changed → new descriptions in 6 languages too */
  texts?: boolean;
  publish?: boolean;
  chatId?: number;
  createdAt: string;
  status: "queued" | "running" | "done" | "error";
  error?: string;
  finishedAt?: string;
};
type Beat = { at: number; host?: string; busy?: string | null };

/** With Supabase the jobs always go through the worker (also when the bot runs on this computer). */
export const viaWorker = () => usingSupabase;

export async function workerState() {
  const b = await kv.get<Beat>("worker:alive").catch(() => null);
  return { online: !!b && Date.now() - b.at < 3 * 60_000, busy: b?.busy ?? null, lastSeen: b?.at };
}

export async function workQueue(): Promise<WorkJob[]> {
  return (await kv.list<WorkJob>("job:"))
    .map((r) => r.data)
    .filter((j) => j.status === "queued" || j.status === "running")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Queue a job; the answer says honestly whether the computer will start now or later. */
export async function queueWork(j: Omit<WorkJob, "id" | "createdAt" | "status">): Promise<string> {
  const id = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 4)}`;
  await kv.set(`job:${id}`, { ...j, id, createdAt: new Date().toISOString(), status: "queued" } satisfies WorkJob);
  const [w, queue] = await Promise.all([workerState(), workQueue().catch(() => [])]);
  const what = j.name ?? (j.kind === "import" ? "Nowy projekt" : j.slug);
  const ahead = queue.filter((x) => x.id !== id).length;
  if (!w.online)
    return `🕓 ${what}: zlecone. Twój komputer (pomocnik) jest teraz wyłączony — zacznę sam, gdy go włączysz, i napiszę tutaj.`;
  if (w.busy || ahead) return `🕓 ${what}: w kolejce${ahead ? ` (${ahead} przed nim)` : ""} — komputer kończy teraz „${w.busy ?? "poprzednie zlecenie"}”.`;
  return `🖥 ${what}: komputer już zaczyna — będę tu na bieżąco pokazywał postęp (zwykle 5–10 min).`;
}

/** One line for /stats. */
export async function workerLine() {
  const [w, queue] = await Promise.all([workerState(), workQueue().catch(() => [] as WorkJob[])]);
  const seen = w.lastSeen ? new Date(w.lastSeen).toLocaleString("pl-PL", { timeZone: "Europe/Rome", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "nigdy";
  const state = w.online ? (w.busy ? `⏳ pracuje: ${w.busy}` : "✅ włączony") : `⛔ wyłączony (ostatnio ${seen})`;
  return `🖥 Komputer (pomocnik): ${state}${queue.length ? ` · w kolejce: ${queue.length}` : ""}`;
}
