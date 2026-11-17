export const locales = ["en", "pl", "it", "es", "de", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export const localeNames: Record<Locale, string> = {
  en: "English",
  pl: "Polski",
  it: "Italiano",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

/** Localized string map. Missing translations fall back to English, then Polish. */
export type L10n = Partial<Record<Locale, string>>;

export function t(value: L10n | undefined, locale: Locale): string {
  if (!value) return "";
  return value[locale] || value.en || value.pl || Object.values(value).find(Boolean) || "";
}

export function pickLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase().slice(0, 2), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  return ranked.find((r) => isLocale(r.tag))?.tag as Locale | undefined ?? defaultLocale;
}

/** Country (ISO-3166 alpha-2, from the hosting edge: Vercel / Cloudflare) → site language. */
const COUNTRY: Record<string, Locale> = {
  PL: "pl",
  IT: "it", SM: "it", VA: "it",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es", EC: "es", UY: "es", PY: "es", BO: "es", CR: "es", PA: "es", DO: "es", GT: "es", HN: "es", SV: "es", NI: "es", CU: "es",
  DE: "de", AT: "de", LI: "de",
  FR: "fr", BE: "fr", LU: "fr", MC: "fr",
};

export function localeFromCountry(country: string | null | undefined): Locale | null {
  if (!country) return null;
  return COUNTRY[country.toUpperCase()] ?? null;
}
