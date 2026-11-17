import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const projects = await db.projects();
  const alt = (path: string) => ({ languages: Object.fromEntries(locales.map((l) => [l, `${siteUrl}/${l}${path}`])) });
  return [
    ...locales.map((l) => ({ url: `${siteUrl}/${l}`, changeFrequency: "monthly" as const, priority: 1, alternates: alt("") })),
    ...projects.flatMap((p) =>
      locales.map((l) => ({
        url: `${siteUrl}/${l}/work/${p.slug}`,
        lastModified: p.updatedAt,
        changeFrequency: "yearly" as const,
        priority: 0.7,
        alternates: alt(`/work/${p.slug}`),
      })),
    ),
  ];
}
