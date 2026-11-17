"use client";

import { AeImage, type AeEffect } from "@/components/media/ae-image";
import { LazyVideo } from "@/components/media/lazy-video";
import { useLightbox, type Shot } from "@/components/media/lightbox";

type Props = {
  name: string;
  clips: string[];
  screens: Shot[];
  pages: Shot[];
  extra: Shot[];
  mobile: Shot[];
  labels: { how: string; screens: string; pages: string; admin: string; mobile: string; close: string; prev: string; next: string; open: string };
};

const FX: AeEffect[] = ["wipe", "blinds", "pixels", "wipe-side", "zoom"];

/**
 * Project media: short "how it works" loops (one per section of the site), then every screen —
 * sections, sub-pages, admin/extra views and mobile — each opening in the masked pop-out viewer.
 */
export function CaseMedia({ name, clips, screens, pages, extra, mobile, labels }: Props) {
  // the loops come first in the viewer, then every screen — one continuous pop-out sequence
  const clipShots: Shot[] = clips.map((src, i) => ({ src: src.replace(/\.mp4(\?|$)/, ".webp$1"), video: src, alt: `${name} — ${labels.how} ${i + 1}` }));
  const all = [...clipShots, ...screens, ...pages, ...extra, ...mobile];
  const C = clipShots.length;
  const lb = useLightbox(all, { close: labels.close, prev: labels.prev, next: labels.next });
  const tile = (shot: Shot, i: number, className?: string, tall?: boolean) => {
    return (
      <button key={shot.src} type="button" data-bend ref={lb.register(i)} onClick={() => lb.show(i)} className={`group relative block w-full overflow-hidden rounded-2xl text-left ${className ?? ""}`} data-cursor={labels.open}>
        <AeImage src={shot.src} alt={shot.alt} effect={FX[i % FX.length]} parallax={false} className={`w-full bg-bone ${tall ? "aspect-[390/844]" : "aspect-[16/10]"}`} imgClassName="object-top transition-transform duration-[1.2s] ease-expo group-hover:scale-[1.03]" delay={(i % 3) * 0.06} />
        <span className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-night/80 text-sm text-cream opacity-0 backdrop-blur transition-opacity duration-300 group-hover:opacity-100">＋</span>
      </button>
    );
  };

  const group = (title: string, shots: Shot[], offset: number, tall?: boolean, first?: boolean) =>
    shots.length ? (
      <div key={title} className={first ? "" : "mt-[12vh]"}>
        {first ? null : (
          <h3 className="display mb-6 flex items-baseline gap-3 text-[clamp(1.8rem,3vw,2.8rem)]">
            {title} <span className="text-[0.55em] text-ink/30">{String(shots.length).padStart(2, "0")}</span>
          </h3>
        )}
        <div className={tall ? "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" : "grid gap-6"}>
          {shots.map((s, j) => tile(s, offset + j, "", tall))}
        </div>
      </div>
    ) : null;

  return (
    <>
      {clips.length ? (
        <section data-theme="dark" className="bg-night py-[14vh] text-cream">
          <div className="gutter">
            <h2 className="display mb-10 text-center text-[clamp(2.4rem,5vw,5rem)]">{labels.how}</h2>
            <div className={`mx-auto grid gap-4 ${clips.length === 1 ? "max-w-5xl" : clips.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
              {clipShots.map((c, i) => (
                <button
                  key={c.video}
                  type="button"
                  ref={lb.register(i)}
                  onClick={() => lb.show(i)}
                  data-cursor={labels.open}
                  className={`group relative block overflow-hidden rounded-2xl bg-ink-2 text-left ${clips.length === 3 && i === 0 ? "md:col-span-2 md:row-span-2" : ""}`}
                >
                  <LazyVideo mp4={c.video} poster={c.src} className="aspect-[16/10] size-full object-cover object-top transition-transform duration-[1.2s] ease-expo group-hover:scale-[1.03]" label={c.alt} />
                  <span className="absolute left-3 top-3 rounded-full bg-acid px-2.5 py-0.5 text-xs font-semibold text-night">{String(i + 1).padStart(2, "0")}</span>
                  <span className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-night/80 text-sm text-cream opacity-0 backdrop-blur transition-opacity duration-300 group-hover:opacity-100">＋</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section data-theme="light" className="gutter py-[14vh]">
        <h2 className="display mb-12 text-center text-[clamp(2.4rem,5vw,5rem)]">{labels.screens}</h2>
        {group(labels.screens, screens, C, false, true)}
        {group(labels.pages, pages, C + screens.length)}
        {group(labels.admin, extra, C + screens.length + pages.length)}
        {group(labels.mobile, mobile, C + screens.length + pages.length + extra.length, true)}
      </section>
      {lb.portal}
    </>
  );
}
