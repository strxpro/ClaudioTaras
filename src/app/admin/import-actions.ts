"use server";

import { execFileSync } from "node:child_process";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { launchImport, syncJob } from "@/lib/importer";
import { alive, listJobs, readJob, writeJob, type ImportJob } from "@/lib/jobs";

/** What the panel needs from a job (no pids / internal lists). */
export type JobView = Omit<ImportJob, "takenSlugs" | "pid" | "result" | "notifyChat"> & {
  resultName?: string;
  copySource?: string;
  url?: string;
};

const view = (j: ImportJob): JobView => {
  const { takenSlugs: _t, pid: _p, notifyChat: _n, result, ...rest } = j;
  return { ...rest, resultName: result?.name, copySource: result?.copySource, url: result?.url };
};

async function origin() {
  const h = await headers();
  const host = h.get("host");
  return host ? `${h.get("x-forwarded-proto") ?? "http"}://${host}` : undefined;
}

/**
 * Start an automatic import from a website URL or a local project folder (runs in the background,
 * see scripts/import/run.mjs). With `projectId` it refreshes that project instead of creating one.
 */
export async function startImport(input: { source: string; publish: boolean; deploy: boolean; projectId?: string }) {
  await requireAdmin();
  return launchImport({ ...input, origin: await origin() });
}

/** Current state of a job; a finished job is turned into a project (once). */
export async function getImport(id: string): Promise<JobView | null> {
  await requireAdmin();
  const job = await syncJob(id);
  return job ? view(job) : null;
}

export async function recentImports(): Promise<JobView[]> {
  await requireAdmin();
  return listJobs(6).map(view);
}

export async function cancelImport(id: string) {
  await requireAdmin();
  const job = readJob(id);
  if (!job) return;
  if (job.pid && alive(job.pid)) {
    try {
      if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(job.pid), "/T", "/F"], { stdio: "ignore" });
      else process.kill(job.pid, "SIGTERM");
    } catch {}
  }
  writeJob({ ...job, status: "cancelled", steps: job.steps.map((s) => (s.status === "running" ? { ...s, status: "error" } : s)) });
}
