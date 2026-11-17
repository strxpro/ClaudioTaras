import Link from "next/link";
import { db } from "@/lib/db";
import { getDictionary } from "@/lib/dict";
import { flatten } from "@/lib/dict/overrides";
import { isLocale, locales, localeNames, type Locale } from "@/lib/i18n";
import { ContentEditor, type Field } from "./editor";

/** Sections that are actually on the site today, in page order. */
const SECTIONS: [string, string][] = [
  ["story", "Strona główna"],
  ["hero", "Hero i nagłówek"],
  ["nav", "Menu"],
  ["meta", "Google i udostępnianie"],
  ["loader", "Preloader"],
  ["work", "Projekty"],
  ["caseStudy", "Strona projektu"],
  ["contact", "Kontakt na stronach projektów"],
  ["footer", "Stopka"],
  ["categories", "Kategorie projektów"],
  ["status", "Statusy projektów"],
];

const CHAPTERS: Record<string, string> = {
  problem: "1 · Problem",
  accept: "2 · Jak pracuję",
  card: "3 · Karta „o mnie”",
  journey: "4 · Projekty",
  voice: "5 · Usługi",
  totem: "6 · Galeria",
  stats: "7 · Liczby (karty)",
  guilds: "8 · Klienci (koło)",
  footer: "9 · Kontakt",
  contact: "9 · Formularz krok po kroku",
  whatsapp: "9 · WhatsApp",
};

export default async function Content({ searchParams }: { searchParams: Promise<{ l?: string }> }) {
  const { l } = await searchParams;
  const locale: Locale = l && isLocale(l) ? l : "pl";
  const settings = await db.settings();
  const over = settings.copy?.[locale] ?? {};
  const dict = getDictionary(locale) as unknown as Record<string, unknown>;
  const fields: Field[] = SECTIONS.flatMap(([key, title]) =>
    flatten(dict[key], key).map(([path, base]) => {
      const rest = path.split(".").slice(1);
      // the home page is long: group it by its chapters
      const group = key === "story" && rest.length > 1 ? `${title} · ${CHAPTERS[rest[0]] ?? rest[0]}` : title;
      return { path, base, value: over[path] ?? base, group, label: (key === "story" && rest.length > 1 ? rest.slice(1) : rest).join(" › ") || key };
    }),
  );
  const edited = Object.fromEntries(locales.map((x) => [x, Object.keys(settings.copy?.[x] ?? {}).length]));

  return (
    <div className="mx-auto max-w-4xl pb-32">
      <h1 className="display text-5xl md:text-6xl">Teksty strony</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink/60">
        Zmień dowolny napis na stronie. Pola z fioletowym paskiem są Twoje, reszta to tekst domyślny. Zmiany są widoczne od razu po zapisaniu. Znaczniki w klamrach, np. <code>{"{age}"}</code>, <code>{"{years}"}</code>, <code>{"{n}"}</code>, zostaw, bo wstawiają liczby.
      </p>
      <div className="my-6 flex flex-wrap gap-1.5">
        {locales.map((x) => (
          <Link key={x} href={`/admin/content?l=${x}`} className={`rounded-full px-4 py-2 text-sm ${x === locale ? "bg-ink text-bone" : "bg-white text-ink/70 hover:text-ink"}`}>
            {localeNames[x]}
            {edited[x] ? <span className="ml-2 rounded-full bg-[#ffd9c9] px-1.5 text-xs text-ink">{edited[x]}</span> : null}
          </Link>
        ))}
      </div>
      <ContentEditor key={locale} locale={locale} fields={fields} />
    </div>
  );
}
