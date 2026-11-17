import fs from "node:fs";
import path from "node:path";
import type { L10n } from "./i18n";
import type { Category, ProjectStatus } from "./types";

/** Import jobs live as JSON files written by scripts/import/run.mjs (see that file for the flow). */
export const JOBS_DIR = path.join(process.cwd(), ".data", "jobs");

export type StepStatus = "pending" | "running" | "done" | "error" | "skipped";
export type JobStep = { key: string; label: string; status: StepStatus; note?: string };
export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled";

export type ImportResult = {
  slug: string;
  name: string;
  client: string;
  location: string;
  category: Category;
  url: string;
  status: ProjectStatus;
  accent: string;
  year: number;
  stack: string[];
  tagline: L10n;
  summary: L10n;
  challenge: L10n;
  solution: L10n;
  role: L10n;
  features: L10n[];
  copySource: string;
};

export type ImportJob = {
  id: string;
  createdAt: string;
  finishedAt?: string;
  source: string;
  mode: "create" | "update";
  projectId: string;
  slug: string;
  name?: string;
  category?: Category;
  publish: boolean;
  deploy: boolean;
  takenSlugs?: string[];
  status: JobStatus;
  pid?: number;
  steps: JobStep[];
  log: string[];
  facts?: { name: string; features: string[]; stack: string[]; languages: string[]; accent: string; location: string; year: number; category: string };
  result?: ImportResult;
  error?: string;
  saved?: boolean;
  /** Telegram chat to tell when the import is done (started from the bot). */
  notifyChat?: number;
};

export const jobFile = (id: string) => path.join(JOBS_DIR, `${id.replace(/[^a-z0-9-]/gi, "")}.json`);

export function readJob(id: string): ImportJob | null {
  try {
    return JSON.parse(fs.readFileSync(jobFile(id), "utf8")) as ImportJob;
  } catch {
    return null;
  }
}

export function writeJob(job: ImportJob) {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
  const tmp = `${jobFile(job.id)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(job, null, 2));
  fs.renameSync(tmp, jobFile(job.id));
}

export function listJobs(limit = 8): ImportJob[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(JOBS_DIR).filter((f) => f.endsWith(".json"));
  } catch {}
  return files
    .map((f) => readJob(f.replace(/\.json$/, "")))
    .filter((j): j is ImportJob => !!j)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function alive(pid?: number) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function stepsFor(isFolder: boolean, deploy: boolean): JobStep[] {
  const s: JobStep[] = [
    { key: "source", label: isFolder ? "Uruchamiam projekt z folderu" : "Otwieram stronę", status: "pending" },
    { key: "analyze", label: "Analiza — funkcje, technologie, kolor", status: "pending" },
    { key: "video", label: "Wideo + zrzuty sekcji (komputer i telefon)", status: "pending" },
    { key: "extras", label: "Logo, podstrony, menu mobilne", status: "pending" },
    { key: "media", label: "Klipy „Jak to działa”", status: "pending" },
    { key: "copy", label: "Opisy w 6 językach", status: "pending" },
  ];
  if (isFolder && deploy) s.push({ key: "deploy", label: "Publikacja na darmowej domenie", status: "pending" });
  s.push({ key: "save", label: "Zapis projektu", status: "pending" });
  return s;
}
