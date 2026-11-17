import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, locales, t, type Locale } from "@/lib/i18n";
import { getSiteDict } from "@/lib/site-dict";
import { db } from "@/lib/db";
import { getShots } from "@/lib/shots";
import { BrowserFrame, PhoneFrame } from "@/components/media/device";
import { LazyVideo } from "@/components/media/lazy-video";
import { VisitLink } from "@/components/site/visit";
import { CaseReady } from "@/components/site/case-ready";
import { BackButton } from "@/components/site/back-button";
import { CaseMedia } from "@/components/site/case-media";
import { CaseNext } from "@/components/site/case-next";
import { Zoomable } from "@/components/media/zoomable";
import c from "./case.module.css";

export const revalidate = 3600;

type Params = { params: Promise<{ locale: string; slug: string }> };

export async function generateStaticParams() {
  const projects = await db.projects();
  return locales.flatMap((locale) => projects.map((p) => ({ locale, slug: p.slug })));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params;
  const p = await db.project(slug);
  if (!p || !isLocale(locale)) return {};
  return {
    title: p.name,
    description: t(p.summary, locale),
    alternates: { canonical: `/${locale}/work/${p.slug}`, languages: Object.fromEntries(locales.map((l) => [l, `/${l}/work/${p.slug}`])) },
    openGraph: { images: p.media.desktopPoster ? [p.media.desktopPoster] : undefined },
  };
}

export default async function CaseStudy({ params }: Params) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const project = await db.project(slug);
  if (!project || !project.published) notFound();
  const dict = await getSiteDict(locale as Locale);
  const all = await db.projects();
  const idx = all.findIndex((p) => p.id === project.id);
  const next = [...all.slice(idx + 1), ...all.slice(0, idx)].find((p) => !p.locked) ?? all[(idx + 1) % all.length];
  const L = (v: Parameters<typeof t>[0]) => t(v, locale);
  const sh = getShots(project, locale);
  const cover = sh.desktop[0] ?? project.media.desktopPoster;
  const mobCover = sh.mobile[0] ?? project.media.mobilePoster;
  const shot = (kind: string) => (src: string, i: number) => ({ src, alt: `${project.name} — ${kind} ${i + 1}` });
  const nextShots = next && next.id !== project.id ? getShots(next, locale) : null;
  const zoomLabels = { close: dict.work.close, prev: dict.caseStudy.prev, next: dict.contact.next };

  const meta = [
    [dict.work.client, project.client],
    [dict.work.role, L(project.role)],
    [dict.work.year, String(project.year)],
    [dict.work.location, project.location],
  ];

  const words = project.name.split(" ");

  return (
    <main id="main" className={c.page}>
      <CaseReady />
      <BackButton href={`/${locale}`} slug={project.slug} label={dict.work.back} image={cover} />

      {/* hero: the site itself, full bleed, its foot bowing with the scroll; the name in big letters */}
      <section data-theme="dark" className={c.hero}>
        <div className={c.media} data-vel data-bend>
          {/* phones get the site's own phone layout (a desktop shot cropped to a tall frame cut its words) */}
          <picture>
            {mobCover ? <source media="(max-width: 768px)" srcSet={mobCover} /> : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt="" />
          </picture>
          <LazyVideo className={mobCover ? c.deskOnly : ""} webm={project.media.desktopWebm} mp4={project.media.desktopMp4} rootMargin="0px" />
          {mobCover && project.media.mobileMp4 ? <LazyVideo className={c.mobOnly} webm={project.media.mobileWebm} mp4={project.media.mobileMp4} rootMargin="0px" /> : null}
        </div>
        {/* under the picture, on the paper: what it is, then the name — solid ink, one line where it fits */}
        <div className={c.titleBlock}>
          <p className={c.tags}>
            <span>{dict.categories[project.category]}</span>
            <span>{project.year}</span>
            <span className={project.status === "wip" ? c.wip : undefined}>{dict.status[project.status]}</span>
          </p>
          <h1 className={c.title} style={{ ["--len" as string]: Math.max(4, ...words.map((w) => w.length)), ["--chars" as string]: Math.max(8, project.name.length) }}>
            {words.map((w, i) => (
              <span key={i} className={c.titleWord} style={{ ["--i" as string]: i }}>
                <span>
                  {w}
                  {i < words.length - 1 ? " " : ""}
                </span>
              </span>
            ))}
          </h1>
        </div>
      </section>

      {/* one sentence, a few facts, the way in */}
      <section data-theme="light" className={c.intro}>
        <p className={c.lead} data-reveal>
          {L(project.tagline)}
        </p>
        <div className={c.aside}>
          <dl className={c.facts}>
            {meta.map(([k, v]) =>
              v ? (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ) : null,
            )}
          </dl>
          <ul className={c.chips}>
            {project.stack.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          {project.url ? (
            <VisitLink url={project.url} name={project.name} color="#ff5a36" light className={c.visit}>
              {dict.work.visit} ↗
            </VisitLink>
          ) : (
            <Link href={`/${locale}#contact`} className={c.visit}>
              {dict.work.demoCta} →
            </Link>
          )}
          {project.locked ? <p className={c.summary}>{dict.work.locked}</p> : null}
        </div>
      </section>

      {/* the live recording on a laptop and a phone */}
      <section data-theme="light" className={c.devices}>
        <div className={c.devicesInner}>
          <div data-bend data-reveal>
            <Zoomable
              shot={{ src: project.media.desktopPoster ?? cover ?? "", video: project.media.desktopMp4, alt: `${project.name} — ${dict.work.desktop}` }}
              label={dict.caseStudy.enlarge}
              labels={zoomLabels}
            >
              <BrowserFrame url={project.url}>
                <LazyVideo className="absolute inset-0 size-full object-cover object-top" webm={project.media.desktopWebm} mp4={project.media.desktopMp4} poster={project.media.desktopPoster} />
              </BrowserFrame>
            </Zoomable>
          </div>
          <div className="absolute -bottom-[6%] right-[6%] w-[22%] md:w-[17%]">
            <Zoomable
              shot={{ src: project.media.mobilePoster ?? "", video: project.media.mobileMp4, alt: `${project.name} — ${dict.work.mobile}` }}
              label={dict.caseStudy.enlarge}
              labels={zoomLabels}
            >
              <PhoneFrame>
                <LazyVideo className="absolute inset-0 size-full object-cover object-top" webm={project.media.mobileWebm} mp4={project.media.mobileMp4} poster={project.media.mobilePoster} />
              </PhoneFrame>
            </Zoomable>
          </div>
        </div>
      </section>

      {/* how it works (short loops) + every screen, each opening in the masked viewer */}
      <CaseMedia
        name={project.name}
        clips={sh.clips}
        screens={sh.desktop.map(shot("desktop"))}
        pages={sh.pages.map(shot(dict.caseStudy.pages))}
        extra={sh.extra.map(shot(dict.caseStudy.admin))}
        mobile={sh.mobile.map(shot("mobile"))}
        labels={{
          how: dict.work.how,
          screens: dict.work.screens,
          pages: dict.caseStudy.pages,
          admin: dict.caseStudy.admin,
          mobile: dict.caseStudy.mobileShots,
          close: dict.work.close,
          prev: dict.caseStudy.prev,
          next: dict.contact.next,
          open: dict.caseStudy.enlarge,
        }}
      />

      {/* features + numbers */}
      {project.results.length ? (
      <section data-theme="dark" className={c.features}>
        <div className={c.featuresInner}>
          {project.results.length ? (
            <dl className={c.results}>
              {project.results.map((r, i) => (
                <div key={i}>
                  <dt>{r.value}</dt>
                  <dd>{L(r.label)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </section>
      ) : null}

      {/* live CTA */}
      <section data-theme="light" className={c.cta}>
        <h2>{project.url ? dict.work.liveTitle : dict.work.demo}</h2>
        <p>{dict.work.liveText}</p>
        {project.url ? (
          <VisitLink url={project.url} name={project.name} color="#0a0a0a" light={false} className={c.ctaBtn}>
            {dict.work.visit} ↗
          </VisitLink>
        ) : (
          <Link href={`/${locale}#contact`} className={c.ctaBtn}>
            {dict.work.demoCta} →
          </Link>
        )}
      </section>

      {/* endless: keep scrolling and the next project opens by itself */}
      {next && nextShots ? (
        <CaseNext
          href={`/${locale}/work/${next.slug}`}
          name={next.name}
          image={nextShots.desktop[0] ?? next.media.desktopPoster ?? ""}
          imageMobile={nextShots.mobile[0] ?? next.media.mobilePoster ?? ""}
          label={dict.caseStudy.next}
          hint={dict.caseStudy.nextHint}
          category={dict.categories[next.category]}
        />
      ) : null}
    </main>
  );
}
