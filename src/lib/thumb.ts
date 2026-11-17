/** Allowed /_next/image widths (Next's default device + image sizes). */
type Width = 256 | 384 | 640 | 750 | 828 | 1080 | 1200 | 1920;

/** Resized, re-encoded copy of a local image via the Next image optimizer (keeps cards light). */
export function thumb(src: string | undefined, w: Width): string {
  if (!src) return "";
  if (!src.startsWith("/")) return src;
  return `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75`;
}
