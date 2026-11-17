import type { Locale } from "@/lib/i18n";
import { CT_PARTS, CT_VIEWBOX } from "./ct-mark";

/**
 * Claudio's mark: "CT." set in Gilda Display, the site's headline serif, on an ink disc. The T's arm
 * tucks into the C and a tangerine full stop closes it. story/cards.ts draws the same mark on canvas.
 */
export const LOGO = {
  disc: "#17131f",
  letters: "#f6f1ea",
  dot: "#ff5a36",
  /** font size on the 48-unit disc */
  size: 30,
  /** x and baseline of each letter */
  c: [3.3, 34.6] as const,
  t: [19.7, 34.6] as const,
  /** the full stop: cx, cy, r */
  stop: [41.3, 32.4, 2.2] as const,
};
export const LOGO_SERIF = "var(--font-gilda), 'Gilda Display', Didot, 'Bodoni 72', Georgia, serif";

/** Inner markup of the CT monogram (letters take the current fill, the accent stays tangerine). */
const CT_INNER = CT_PARTS.map((p) => (p.accent ? p.svg.replace(/^<(\w+)/, `<$1 fill="${LOGO.dot}"`) : p.svg)).join("");

/**
 * Claudio's mark: the typographic CT monogram (C and T interlocked, the T's arm ending in a tangerine
 * curl), on an ink disc — or bare, with `bare`.
 */
export function LogoMark({ size = 38, className, tone = "ink", bare = false }: { size?: number; className?: string; tone?: "ink" | "paper"; bare?: boolean }) {
  const paper = tone === "paper";
  const [vx, vy, vw, vh] = CT_VIEWBOX;
  // the monogram fills ~64% of the disc, centred optically
  const w = bare ? 48 : 31;
  const h = (w * vh) / vw;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} aria-hidden>
      {bare ? null : <circle cx="24" cy="24" r="24" fill={paper ? LOGO.letters : LOGO.disc} />}
      <svg x={(48 - w) / 2 + (bare ? 0 : 0.6)} y={(48 - h) / 2} width={w} height={h} viewBox={`${vx} ${vy} ${vw} ${vh}`}>
        <g fill={bare ? "currentColor" : paper ? LOGO.disc : LOGO.letters} dangerouslySetInnerHTML={{ __html: CT_INNER }} />
      </svg>
    </svg>
  );
}

/** Small flat flags for the language picker (emoji flags don't render on Windows). */
export function Flag({ locale, className }: { locale: Locale; className?: string }) {
  const common = { viewBox: "0 0 30 20", className, "aria-hidden": true, preserveAspectRatio: "none" } as const;
  switch (locale) {
    case "it":
      return (
        <svg {...common}>
          <rect width="10" height="20" fill="#009246" />
          <rect x="10" width="10" height="20" fill="#fff" />
          <rect x="20" width="10" height="20" fill="#ce2b37" />
        </svg>
      );
    case "pl":
      return (
        <svg {...common}>
          <rect width="30" height="10" fill="#fff" />
          <rect y="10" width="30" height="10" fill="#dc143c" />
        </svg>
      );
    case "de":
      return (
        <svg {...common}>
          <rect width="30" height="7" fill="#000" />
          <rect y="6.66" width="30" height="7" fill="#dd0000" />
          <rect y="13.33" width="30" height="6.67" fill="#ffce00" />
        </svg>
      );
    case "fr":
      return (
        <svg {...common}>
          <rect width="10" height="20" fill="#0055a4" />
          <rect x="10" width="10" height="20" fill="#fff" />
          <rect x="20" width="10" height="20" fill="#ef4135" />
        </svg>
      );
    case "es":
      return (
        <svg {...common}>
          <rect width="30" height="20" fill="#aa151b" />
          <rect y="5" width="30" height="10" fill="#f1bf00" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect width="30" height="20" fill="#012169" />
          <path d="M0 0L30 20M30 0L0 20" stroke="#fff" strokeWidth="4" />
          <path d="M0 0L30 20M30 0L0 20" stroke="#c8102e" strokeWidth="1.6" />
          <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="6" />
          <path d="M15 0v20M0 10h30" stroke="#c8102e" strokeWidth="3.4" />
        </svg>
      );
  }
}
