import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import "../../globals.css";
import { fontVars } from "@/lib/fonts";
import { isLocale, locales, type Locale } from "@/lib/i18n";
import { getSiteDict } from "@/lib/site-dict";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/site";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { Cursor } from "@/components/motion/cursor";
import { Preloader } from "@/components/site/preloader";
import { Header } from "@/components/site/header";
import { VisitCurtain } from "@/components/site/visit";
import { LangAnimator } from "@/components/site/lang-switch";
import { PageTransition } from "@/components/site/page-transition";
import { Scrollbar } from "@/components/motion/scrollbar";
import { Tracker } from "@/components/site/tracker";
import { SiteMenu } from "@/components/site/menu";
import { ScrollFX } from "@/components/motion/scroll-fx";
import { CtaPill } from "@/components/site/cta-pill";
import { KeyboardSafe } from "@/components/site/keyboard-safe";


export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: "#f2f0ec",
  width: "device-width",
  initialScale: 1,
  // the on-screen keyboard shrinks the layout (Android); iOS is handled with visualViewport
  interactiveWidget: "resizes-content",
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getSiteDict(locale as Locale);
  return {
    metadataBase: new URL(siteUrl),
    title: { default: dict.meta.title, template: `%s — Claudio Taras` },
    description: dict.meta.description,
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(locales.map((l) => [l, `/${l}`])),
    },
    openGraph: {
      type: "website",
      siteName: "Claudio Taras",
      title: dict.meta.title,
      description: dict.meta.description,
      locale,
    },
    twitter: { card: "summary_large_image", title: dict.meta.title, description: dict.meta.description },
    authors: [{ name: "Claudio Taras" }],
  };
}

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getSiteDict(locale as Locale);
  const [settings, projects, dicts] = await Promise.all([db.settings(), db.projects(), Promise.all(locales.map((l) => getSiteDict(l)))]);
  // the menu in every language, so it can follow an in-place language switch
  const menus = Object.fromEntries(
    locales.map((l, k) => {
      const d = dicts[k];
      return [
        l,
        {
          links: [
            { label: d.hero.portfolio, href: `/${l}` },
            { label: d.nav.work, href: `/${l}/work` },
            { label: d.nav.about, href: `/${l}/about` },
            { label: d.nav.contact, href: `/${l}/contact` },
          ],
          labels: { menu: d.nav.menu, close: d.nav.close },
        },
      ];
    }),
  );

  return (
    <html lang={locale} className={`${fontVars} site`} suppressHydrationWarning>
      <body>
        <SmoothScroll>
          <Preloader label={dict.loader.loading} names={projects.map((p) => p.name)} role={dict.hero.role} cta={dict.hero.cta} locale={locale} />
          <Cursor />
          <Header locale={locale} dict={dict} email={settings.email} available={settings.available} socials={settings.socials} />
          {children}
          <VisitCurtain label={dict.work.opening} />
          <SiteMenu menus={menus} locale={locale} socials={settings.socials} />
          <ScrollFX />
          <KeyboardSafe />
          <CtaPill dict={dict} locale={locale as Locale} whatsapp={(settings.phone || "").replace(/\D/g, "") || "48665626101"} />
          <PageTransition />
          <LangAnimator />
          <Scrollbar />
          <Tracker />
        </SmoothScroll>
      </body>
    </html>
  );
}
