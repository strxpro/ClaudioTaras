import type { L10n } from "./i18n";

export const categories = ["website", "ecommerce", "webapp", "software", "event"] as const;
export type Category = (typeof categories)[number];

/** live = online · local = runs on my machine · private = hidden · wip = still being built (the owner flips it when done) */
export const statuses = ["live", "local", "private", "wip"] as const;
export type ProjectStatus = (typeof statuses)[number];

export type ProjectMedia = {
  desktopWebm?: string;
  desktopMp4?: string;
  desktopPoster?: string;
  mobileWebm?: string;
  mobileMp4?: string;
  mobilePoster?: string;
  gallery?: string[];
};

export type Project = {
  id: string;
  slug: string;
  name: string;
  client: string;
  year: number;
  location: string;
  category: Category;
  status: ProjectStatus;
  url?: string;
  /** Signature color used for this project's chapter in the showcase. */
  accent: string;
  stack: string[];
  tagline: L10n;
  summary: L10n;
  challenge: L10n;
  solution: L10n;
  role: L10n;
  features: L10n[];
  results: { value: string; label: L10n }[];
  media: ProjectMedia;
  /** Shown as a note when the live site is behind a password. */
  locked?: boolean;
  /** Where the automatic import read it from (URL or local folder) — reused by "refresh". */
  source?: string;
  /** Password of a gated preview site — used only by the capture scripts, never rendered publicly. */
  gatePassword?: string;
  featured: boolean;
  published: boolean;
  order: number;
  updatedAt: string;
};

export type MessageStatus = "new" | "read" | "replied" | "archived";

export type Message = {
  id: string;
  createdAt: string;
  status: MessageStatus;
  locale: string;
  services: string[];
  budget: string;
  timeline: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  website?: string;
  /** Call slot the visitor picked, e.g. "2026-11-18 15:00" (Italian time) */
  meeting?: string;
  message: string;
  notes?: string;
  /** Files the client attached (uploaded images / PDFs). */
  attachments?: string[];
  /** Replies sent to the client from the admin panel or Telegram. */
  replies?: { at: string; text: string; via: "admin" | "telegram" }[];
};

/** One page view (anonymous: no IP or cookie is stored). */
export type PageView = {
  at: string;
  path: string;
  locale: string;
  country?: string;
  device: "mobile" | "tablet" | "desktop";
  referrer?: string;
  /** daily-rotating hash of ip + user agent, to count unique visitors without storing either */
  visitor: string;
};

export type Settings = {
  email: string;
  phone: string;
  /** Public phone numbers, shown with a blurred ending until hovered / the eye is tapped. */
  phones?: { label: string; number: string }[];
  location: string;
  available: boolean;
  /** Busy with a project until this day (YYYY-MM-DD) — calls can be booked from the next free day. */
  busyUntil?: string;
  /** What I'm working on right now (shown next to "busy"). */
  busyNote?: string;
  /** Call slots offered in the contact flow: weekdays (1 = Monday … 7 = Sunday) and times (Italian time). */
  callDays?: number[];
  callHours?: string[];
  socials: { label: string; url: string }[];
  bio: L10n;
  portrait?: string;
  yearsExperience: number;
  birthYear: number;
  /** Site texts edited in the admin panel: locale → { "story.problem.body": "…" } */
  copy?: Record<string, Record<string, string>>;
};

export type Database = {
  projects: Project[];
  messages: Message[];
  settings: Settings;
};
