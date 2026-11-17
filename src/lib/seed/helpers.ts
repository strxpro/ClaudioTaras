import type { L10n } from "../i18n";
import type { ProjectMedia } from "../types";

/** Order: en, pl, it, es, de, fr */
export const L = (en: string, pl: string, it: string, es: string, de: string, fr: string): L10n => ({ en, pl, it, es, de, fr });

export const media = (slug: string): ProjectMedia => {
  const base = `/media/projects/${slug}`;
  return {
    desktopWebm: `${base}/desktop.webm`,
    desktopMp4: `${base}/desktop.mp4`,
    desktopPoster: `${base}/desktop-poster.webp`,
    mobileWebm: `${base}/mobile.webm`,
    mobileMp4: `${base}/mobile.mp4`,
    mobilePoster: `${base}/mobile-poster.webp`,
    gallery: [],
  };
};
