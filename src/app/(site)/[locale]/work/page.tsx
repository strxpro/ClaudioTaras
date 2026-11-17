import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, locales, t, type Locale } from "@/lib/i18n";
import { getSiteDict } from "@/lib/site-dict";
import { db } from "@/lib/db";
import { getShots } from "@/lib/shots";
import { thumb } from "@/lib/thumb";
import { GlassCarousel, type WorkItem } from "@/components/site/glass-carousel";

export const revalidate = 3600;

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getSiteDict(locale as Locale);
  return {
    title: dict.work.allProjects,
    alternates: { canonical: `/${locale}/work`, languages: Object.fromEntries(locales.map((l) => [l, `/${l}/work`])) },
  };
}

/** Every project on one stage: a strip of their screens under liquid glass (see glass-carousel.tsx). */
export default async function Works({ params }: Params) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getSiteDict(locale as Locale);
  const projects = (await db.projects()).filter((p) => p.published);
  const items: WorkItem[] = projects.map((p) => {
    const sh = getShots(p, locale);
    const cover = sh.desktop[0] ?? p.media.desktopPoster ?? "";
    const mobile = sh.mobile[0] ?? p.media.mobilePoster ?? "";
    return {
      slug: p.slug,
      name: p.name,
      category: dict.categories[p.category] ?? p.category,
      year: p.year,
      tagline: t(p.tagline, locale as Locale),
      accent: p.accent,
      cover: cover ? thumb(cover, 1080) : "",
      mobile: mobile ? thumb(mobile, 640) : "",
      wip: p.status === "wip" ? dict.status.wip : undefined,
    };
  });

  return (
    <main id="main">
      <GlassCarousel locale={locale} items={items} labels={{ title: dict.work.allProjects, all: dict.work.filterAll, open: dict.work.viewCase, hint: dict.story.stats.hint }} />
    </main>
  );
}
