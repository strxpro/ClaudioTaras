import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, locales, type Locale } from "@/lib/i18n";
import { getSiteDict } from "@/lib/site-dict";
import { db } from "@/lib/db";
import { maskEmail, maskPhone } from "@/lib/masked";
import { Masked } from "@/components/site/masked";
import { ContactFlow } from "@/components/story/contact-flow";
import story from "@/components/story/story.module.css";
import p from "../pages.module.css";

export const revalidate = 3600;
type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getSiteDict(locale as Locale);
  return { title: dict.nav.contact, alternates: { canonical: `/${locale}/contact`, languages: Object.fromEntries(locales.map((l) => [l, `/${l}/contact`])) } };
}

/** Contact: the big word, one line, the four-question form, and the numbers with blurred endings. */
export default async function Contact({ params }: Params) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getSiteDict(locale as Locale);
  const settings = await db.settings();
  const contacts = [
    ...(settings.phones?.length ? settings.phones : [{ label: "PL", number: settings.phone }]).filter((x) => x.number).map((x) => maskPhone(x.number, x.label)),
    maskEmail(settings.email),
  ];
  const word = dict.footer.ctaBig.split(" ");

  return (
    <main id="main" className={p.page}>
      <div className={p.contactWrap}>
        <header className={p.contactSide}>
          <h1 className={`${p.giant} ${p.contactTitle}`}>
            {word.map((w, i) => (
              <span key={i} className={p.mask}>
                <span style={{ ["--i" as string]: i }}>{w}</span>
              </span>
            ))}
          </h1>
          <p className={p.contactLead}>{dict.story.footer.pitch}</p>
          <div className={p.contactInfo}>
            {contacts.map((c) => (
              <Masked key={c.code} c={c} eye={{ show: dict.footer.show, hide: dict.footer.hide }} />
            ))}
            {settings.socials.map((x) => (
              <a key={x.url} href={x.url} target="_blank" rel="noreferrer">
                {x.label} ↗
              </a>
            ))}
          </div>
        </header>
        {/* the same flow as on the home page (its styles live in the story stylesheet), compact */}
        <div className={`${story.page} ${story.live} ${p.contactForm}`}>
          <ContactFlow
            dict={dict}
            locale={locale}
            preset={[0]}
            compact
            availability={{ available: settings.available, busyUntil: settings.busyUntil || undefined, busyNote: settings.busyNote || undefined, callDays: settings.callDays, callHours: settings.callHours }}
          />
        </div>
      </div>
    </main>
  );
}
