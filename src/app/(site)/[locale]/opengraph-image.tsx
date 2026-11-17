import { ImageResponse } from "next/og";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "@/lib/dict";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Claudio Taras — Web Designer & Developer";

export default async function OgImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dict = getDictionary(isLocale(locale) ? locale : "en");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0e0e0c", color: "#fbfaf6", padding: 64 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, letterSpacing: 2, textTransform: "uppercase", opacity: 0.6 }}>
          <span>Portfolio</span>
          <span>{dict.hero.role}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 168, fontWeight: 900, lineHeight: 0.82, letterSpacing: -8 }}>
          <span>CLAUDIO</span>
          <span style={{ color: "#d7ff3a" }}>TARAS</span>
        </div>
        <div style={{ display: "flex", fontSize: 30, opacity: 0.8 }}>
          {dict.hero.line1} {dict.hero.line2}
        </div>
      </div>
    ),
    size,
  );
}
