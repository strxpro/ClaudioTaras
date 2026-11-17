import "server-only";
import type { Locale } from "./i18n";
import { getSiteDict } from "./site-dict";
import { db } from "./db";
import { toView } from "./view";
import { getShots } from "./shots";
import { thumb } from "./thumb";
import { maskEmail, maskPhone } from "./masked";
import type { StoryProject } from "@/components/story/story";

/** Everything the home story needs for one language (the page and the in-place language switch share it). */
export async function storyProps(locale: Locale) {
  const dict = await getSiteDict(locale);
  const [all, settings] = await Promise.all([db.projects(), db.settings()]);
  const projects = all.filter((p) => p.published);

  const list: (StoryProject & { featured: boolean })[] = projects.map((p) => {
    const sh = getShots(p, locale);
    const v = toView(p, locale, dict, { ...sh, desktop: sh.desktop.slice(0, 1), mobile: sh.mobile.slice(0, 1), extra: [], pages: [], clips: [] });
    const cover = v.shots.desktop[0] ?? v.media.desktopPoster ?? "";
    const mob = v.shots.mobile[0] ?? v.media.mobilePoster ?? "";
    return {
      slug: v.slug,
      name: v.name,
      category: v.category,
      year: v.year,
      tagline: v.tagline,
      summary: v.summary,
      accent: v.accent,
      stack: v.stack,
      cover: thumb(cover, 828),
      mobile: mob ? thumb(mob, 640) : "",
      status: v.status,
      wip: v.statusKey === "wip" ? v.status : undefined,
      logo: sh.logo?.src,
      mobVideo: p.media.mobileMp4,
      featured: p.featured,
    };
  });
  const featured = list.filter((p) => p.featured).slice(0, 8);

  return {
    dict,
    locale,
    projects: list,
    featured: featured.length ? featured : list.slice(0, 6),
    contacts: [
      ...(settings.phones?.length ? settings.phones : [{ label: "PL", number: settings.phone }]).filter((p) => p.number).map((p) => maskPhone(p.number, p.label)),
      maskEmail(settings.email),
    ],
    socials: settings.socials,
    years: settings.yearsExperience,
    age: new Date().getFullYear() - settings.birthYear,
    portrait: settings.portrait,
    availability: { available: settings.available, busyUntil: settings.busyUntil || undefined, busyNote: settings.busyNote || undefined, callDays: settings.callDays, callHours: settings.callHours },
    whatsapp: (settings.phone || "").replace(/\D/g, "") || "48665626101",
    settings,
  };
}
export type StoryProps = Omit<Awaited<ReturnType<typeof storyProps>>, "settings">;
