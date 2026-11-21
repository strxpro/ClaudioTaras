// A finished import → the project row. Mirrors saveFromJob() in src/lib/importer.ts, plus "texts":
// when Claudio says the site changed, the new descriptions (6 languages) replace the old ones.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./env.mjs";

const filled = (v) => !!v && Object.values(v).some((x) => x && String(x).trim());

export function mediaFor(slug) {
  const dir = path.join(ROOT, "public", "media", "projects", slug);
  const url = (f) => (fs.existsSync(path.join(dir, f)) ? `/media/projects/${slug}/${f}` : undefined);
  const m = {
    desktopWebm: url("desktop.webm"),
    desktopMp4: url("desktop.mp4"),
    desktopPoster: url("desktop-poster.webp"),
    mobileWebm: url("mobile.webm"),
    mobileMp4: url("mobile.mp4"),
    mobilePoster: url("mobile-poster.webp"),
  };
  return Object.fromEntries(Object.entries(m).filter(([, v]) => v));
}

const TEXTS = ["tagline", "summary", "challenge", "solution", "role"];

/** Refresh of an existing project: new media and facts; texts only when asked (or still empty). */
export function refreshed(before, r, { texts, source }) {
  const p = structuredClone(before);
  p.media = { ...p.media, ...mediaFor(r.slug) };
  p.stack = [...new Set([...(p.stack ?? []), ...(r.stack ?? [])])];
  if (!p.url && r.url) {
    p.url = r.url;
    p.status = "live";
  }
  if (source) p.source = source;
  for (const f of TEXTS) if (texts || !filled(p[f])) p[f] = r[f];
  if (texts || !p.features?.length) p.features = r.features;
  // the accent stays: the detected colour is often a button colour, not the one chosen for the portfolio
  return p;
}

/** A brand-new project from the import result. */
export function created(job, r, all) {
  let slug = r.slug;
  for (let i = 2; all.some((p) => p.slug === slug); i++) slug = `${r.slug}-${i}`;
  return {
    id: job.projectId || `p-${crypto.randomUUID().slice(0, 8)}`,
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
    media: { ...mediaFor(r.slug), gallery: [] },
    featured: false,
    published: job.publish,
    order: all.length + 1,
    updatedAt: new Date().toISOString(),
    source: job.source,
  };
}
