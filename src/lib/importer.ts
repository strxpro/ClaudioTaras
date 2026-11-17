import "server-only";
import { revalidatePath } from "next/cache";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "./db";
import type { L10n } from "./i18n";
import { alive, jobFile, listJobs, readJob, stepsFor, writeJob, type ImportJob } from "./jobs";
import type { Project, ProjectMedia } from "./types";

/**
 * The automatic import, shared by the panel (import-actions.ts), the Telegram bot and the
 * runner's "finished" callback. The work itself happens in scripts/import/run.mjs.
 */
export type LaunchInput = { source: string; publish: boolean; deploy: boolean; projectId?: string; notifyChat?: number; origin?: string };

const clean = (s: string) => s.trim().replace(/^["']|["']$/g, "").trim();

export async function launchImport(input: LaunchInput): Promise<{ id?: string; error?: string }> {
  if (process.env.VERCEL) return { error: "Import działa na Twoim komputerze (npm run dev) — potrzebuje przeglądarki Playwright i ffmpeg." };
  const source = clean(input.source);
  const isUrl = /^https?:\/\//i.test(source);
  if (!source) return { error: "Wklej link do strony albo ścieżkę do folderu projektu." };
  if (!isUrl) {
    if (!path.isAbsolute(source)) return { error: "Podaj pełną ścieżkę folderu, np. F:\\Projekty\\moja-strona — albo link zaczynający się od https://" };
    if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) return { error: `Nie znalazłem folderu: ${source}` };
  }
  const running = listJobs(20).find((j) => (j.status === "running" || j.status === "queued") && alive(j.pid));
  if (running) return { error: `Trwa już import „${running.facts?.name ?? running.source}”. Poczekaj, aż się skończy.` };

  const all = await db.projects({ all: true });
  const existing = input.projectId ? all.find((p) => p.id === input.projectId) : undefined;
  const job: ImportJob = {
    id: `j-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    source,
    mode: existing ? "update" : "create",
    projectId: existing?.id ?? `p-${crypto.randomUUID().slice(0, 8)}`,
    slug: existing?.slug ?? "",
    name: existing?.name,
    category: existing?.category,
    publish: input.publish,
    deploy: !isUrl && input.deploy,
    takenSlugs: all.map((p) => p.slug),
    notifyChat: input.notifyChat,
    status: "queued",
    steps: stepsFor(!isUrl, !isUrl && input.deploy),
    log: [],
  };
  writeJob(job);
  const logFile = fs.openSync(jobFile(job.id).replace(/\.json$/, ".log"), "w");
  const child = spawn(process.execPath, [path.join("scripts", "import", "run.mjs"), jobFile(job.id)], {
    cwd: process.cwd(),
    // secrets travel in the environment only, never in the job file
    env: {
      ...process.env,
      // the browsers live on this drive (C: is nearly full): without this the capture can't start
      ...(process.env.PLAYWRIGHT_BROWSERS_PATH || !fs.existsSync(path.join(process.cwd(), ".capture", "ms-playwright"))
        ? {}
        : { PLAYWRIGHT_BROWSERS_PATH: path.join(process.cwd(), ".capture", "ms-playwright") }),
      GATE_PASSWORD: existing?.gatePassword ?? "",
      IMPORT_CALLBACK_URL: input.origin ? `${input.origin}/api/import/finish?id=${job.id}` : "",
      IMPORT_SECRET: process.env.ADMIN_SECRET ?? "",
    },
    detached: true,
    stdio: ["ignore", logFile, logFile],
    windowsHide: true,
  });
  child.unref(); // the runner records its own pid in the job file as its first step
  return { id: job.id };
}

/** Current state of a job; a finished job becomes a project here, exactly once. */
export async function syncJob(id: string): Promise<ImportJob | null> {
  let job = readJob(id);
  if (!job) return null;
  const stale = job.pid ? !alive(job.pid) : Date.now() - Date.parse(job.createdAt) > 60000;
  if ((job.status === "running" || job.status === "queued") && stale && Date.now() - Date.parse(job.createdAt) > 15000) {
    job = { ...job, status: "error", error: job.error ?? "Import został przerwany (proces zakończył się niespodziewanie)." };
    writeJob(job);
  }
  if (job.status === "done" && !job.saved && job.result) {
    // claim it first so two callers (panel poll + finish callback) can't save twice
    writeJob({ ...job, saved: true });
    await saveFromJob(job);
    job = { ...job, saved: true, steps: job.steps.map((s) => (s.key === "save" ? { ...s, status: "done" } : s)) };
    writeJob(job);
  }
  return job;
}

function mediaFor(slug: string): ProjectMedia {
  const dir = path.join(process.cwd(), "public", "media", "projects", slug);
  const url = (f: string) => (fs.existsSync(path.join(dir, f)) ? `/media/projects/${slug}/${f}` : undefined);
  return {
    desktopWebm: url("desktop.webm"),
    desktopMp4: url("desktop.mp4"),
    desktopPoster: url("desktop-poster.webp"),
    mobileWebm: url("mobile.webm"),
    mobileMp4: url("mobile.mp4"),
    mobilePoster: url("mobile-poster.webp"),
  };
}

const filled = (v?: L10n) => !!v && Object.values(v).some((x) => x && x.trim());

async function saveFromJob(job: ImportJob) {
  const r = job.result!;
  const all = await db.projects({ all: true });
  const existing = all.find((p) => p.id === job.projectId);
  const media = mediaFor(r.slug);
  if (existing) {
    // refresh: new media + facts, but never overwrite text that was already written by hand
    await db.saveProject({
      ...existing,
      media: { ...existing.media, ...Object.fromEntries(Object.entries(media).filter(([, v]) => v)) },
      stack: [...new Set([...existing.stack, ...r.stack])],
      url: existing.url || r.url || "",
      status: r.url && !existing.url ? "live" : existing.status,
      source: job.source,
      tagline: filled(existing.tagline) ? existing.tagline : r.tagline,
      summary: filled(existing.summary) ? existing.summary : r.summary,
      challenge: filled(existing.challenge) ? existing.challenge : r.challenge,
      solution: filled(existing.solution) ? existing.solution : r.solution,
      role: filled(existing.role) ? existing.role : r.role,
      features: existing.features.length ? existing.features : r.features,
    });
  } else {
    let slug = r.slug;
    for (let i = 2; all.some((p) => p.slug === slug); i++) slug = `${r.slug}-${i}`;
    const p: Project = {
      id: job.projectId,
      slug,
      name: r.name,
      client: r.client,
      year: r.year,
      location: r.location,
      category: r.category,
      status: r.status,
      url: r.url,
      accent: r.accent,
      stack: r.stack,
      tagline: r.tagline,
      summary: r.summary,
      challenge: r.challenge,
      solution: r.solution,
      role: r.role,
      features: r.features,
      results: [],
      media: { ...media, gallery: [] },
      featured: false,
      published: job.publish,
      order: all.length + 1,
      updatedAt: new Date().toISOString(),
      source: job.source,
    };
    await db.saveProject(p);
  }
  try {
    revalidatePath("/", "layout");
  } catch {}
}
