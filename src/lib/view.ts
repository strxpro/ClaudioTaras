import { t, type Locale } from "./i18n";
import type { Dictionary } from "./dict";
import type { Project } from "./types";
import { isLight } from "./color";
import type { Shots } from "./shots";

/** Locale-resolved, client-safe shape of a project (keeps the client bundle free of 6× copy). */
export type ProjectView = {
  slug: string;
  name: string;
  client: string;
  year: number;
  location: string;
  accent: string;
  light: boolean;
  category: string;
  categoryKey: Project["category"];
  status: string;
  statusKey: Project["status"];
  url?: string;
  locked?: boolean;
  tagline: string;
  summary: string;
  role: string;
  features: string[];
  results: { value: string; label: string }[];
  stack: string[];
  media: Project["media"];
  shots: Shots;
};

export function toView(p: Project, locale: Locale, dict: Dictionary, shots: Shots = { desktop: [], mobile: [], extra: [], pages: [], clips: [], logo: null }): ProjectView {
  return {
    slug: p.slug,
    name: p.name,
    client: p.client,
    year: p.year,
    location: p.location,
    accent: p.accent,
    light: isLight(p.accent),
    category: dict.categories[p.category],
    categoryKey: p.category,
    status: dict.status[p.status],
    statusKey: p.status,
    url: p.url,
    locked: p.locked,
    tagline: t(p.tagline, locale),
    summary: t(p.summary, locale),
    role: t(p.role, locale),
    features: p.features.map((f) => t(f, locale)),
    results: p.results.map((r) => ({ value: r.value, label: t(r.label, locale) })),
    stack: p.stack,
    media: p.media,
    shots,
  };
}
