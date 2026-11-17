import type { Locale } from "../i18n";
import en, { type Dictionary } from "./en";
import pl from "./pl";
import it from "./it";
import es from "./es";
import de from "./de";
import fr from "./fr";

const dictionaries: Record<Locale, Dictionary> = { en, pl, it, es, de, fr };

export const getDictionary = (locale: Locale): Dictionary => dictionaries[locale] ?? en;
export type { Dictionary };
