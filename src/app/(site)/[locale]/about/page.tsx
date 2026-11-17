import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, locales, t, type Locale } from "@/lib/i18n";
import { getSiteDict } from "@/lib/site-dict";
import { db } from "@/lib/db";
import { getShots } from "@/lib/shots";
import { thumb } from "@/lib/thumb";
import p from "../pages.module.css";
import { LogoMark } from "@/components/site/logo";
import { ContactPull } from "@/components/site/contact-pull";

export const revalidate = 3600;
type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getSiteDict(locale as Locale);
  return { title: dict.nav.about, alternates: { canonical: `/${locale}/about`, languages: Object.fromEntries(locales.map((l) => [l, `/${l}/about`])) } };
}

/** About: one big sentence, four facts, how we work in four cards, three big pictures, the way to talk. */
export default async function About({ params }: Params) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getSiteDict(locale as Locale);
  const st = dict.story;
  const [settings, projects] = await Promise.all([db.settings(), db.projects()]);
  const age = new Date().getFullYear() - settings.birthYear;
  const fill = (x: string) => x.replace(/\{age\}/g, String(age)).replace(/\{years\}/g, String(settings.yearsExperience));
  const facts = st.card.chips.map((c) => fill(c).split("|"));
  const picks = projects.filter((x) => x.published && x.featured).slice(0, 3);
  const shots = picks.map((x) => ({ slug: x.slug, name: x.name, src: thumb(getShots(x, locale).desktop[0] ?? x.media.desktopPoster ?? "", 828) }));
  const steps = [
    [st.app.chat.me.replace(/\s*\S+$/u, ""), st.app.chat.you],
    [st.app.plan.title, st.app.plan.items.join(" · ")],
    [st.app.build.title, st.app.build.note],
    [st.app.live.note, st.app.live.sub],
  ];
  const word = dict.nav.about.split(" ");

  return (
    <main id="main" className={p.page}>
      <section className={p.aboutHero}>
        <h1 className={p.giant}>
          {word.map((w, i) => (
            <span key={i} className={p.mask}>
              <span style={{ ["--i" as string]: i }}>{w}</span>
            </span>
          ))}
        </h1>
        <div className={p.portrait} data-bend>
          {settings.portrait ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.portrait} alt="Claudio Taras" />
          ) : (
            <div className={p.seal} aria-hidden>
              <svg viewBox="0 0 100 100">
                <defs>
                  <path id="ring" d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0" />
                </defs>
                <text>
                  <textPath href="#ring" textLength="236" lengthAdjust="spacingAndGlyphs">Claudio Taras · {dict.hero.role} · Sardinia · </textPath>
                </text>
              </svg>
              <span className={p.mark}>
                <LogoMark bare size={200} />
              </span>
            </div>
          )}
        </div>
      </section>

      <p className={p.bio} data-reveal>
        {t(settings.bio, locale as Locale)}
      </p>
      <dl className={p.facts}>
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div>
          <dt>{dict.work.location}</dt>
          <dd>Sardinia</dd>
        </div>
      </dl>

      <ol className={p.steps} aria-label={st.app.title}>
        {steps.map(([a, b], i) => (
          <li key={i} data-bend data-reveal>
            <b>{String(i + 1).padStart(2, "0")}</b>
            <p>
              {a}
              <small>{b}</small>
            </p>
          </li>
        ))}
      </ol>

      <div className={p.strip}>
        {shots.map((x) => (
          <a key={x.slug} href={`/${locale}/work/${x.slug}`} data-bend aria-label={x.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={x.src} alt={x.name} loading="lazy" />
          </a>
        ))}
      </div>

      <ContactPull href={`/${locale}/contact`} title={dict.footer.ctaBig} lead={st.footer.lead} hint={dict.hero.scroll} />
    </main>
  );
}
