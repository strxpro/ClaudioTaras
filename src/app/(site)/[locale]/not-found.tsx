import { locales } from "@/lib/i18n";
import { getDictionary } from "@/lib/dict";
import { Lost } from "./lost";

/**
 * 404 in the visitor's language. Not-found pages get no params and reading headers would make every
 * page dynamic, so the six short texts go to the client, which picks one from the address.
 */
export default function NotFound() {
  const texts = Object.fromEntries(locales.map((l) => [l, getDictionary(l).notFound]));
  return <Lost texts={texts} />;
}
