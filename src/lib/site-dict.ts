import "server-only";
import { cache } from "react";
import { db } from "./db";
import { getDictionary, type Dictionary } from "./dict";
import { applyCopy } from "./dict/overrides";
import type { Locale } from "./i18n";

/** The dictionary for a locale with the texts edited in the admin panel laid on top. */
export const getSiteDict = cache(async (locale: Locale): Promise<Dictionary> => {
  const base = getDictionary(locale);
  try {
    const over = (await db.settings()).copy?.[locale];
    return over && Object.keys(over).length ? applyCopy(base, over) : base;
  } catch {
    return base;
  }
});
