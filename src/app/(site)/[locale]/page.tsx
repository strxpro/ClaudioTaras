import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n";
import { storyProps } from "@/lib/story-props";
import { StoryHost } from "@/components/story/story-host";

export const revalidate = 3600;

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { settings, ...props } = await storyProps(locale as Locale);
  const { dict } = props;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Claudio Taras",
    jobTitle: dict.hero.role,
    email: `mailto:${settings.email}`,
    description: dict.meta.description,
    knowsLanguage: ["pl", "it", "en", "es", "de", "fr"],
    sameAs: settings.socials.map((s) => s.url),
  };

  return (
    <main id="main">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <StoryHost initial={props} />
    </main>
  );
}
