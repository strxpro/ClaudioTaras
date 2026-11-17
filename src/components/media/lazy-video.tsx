"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  webm?: string;
  mp4?: string;
  poster?: string;
  className?: string;
  /** Force play/pause from outside (e.g. the active chapter in the showcase). */
  active?: boolean;
  label?: string;
  /** Start loading slightly before entering the viewport. */
  rootMargin?: string;
};

/**
 * Muted looping preview video that never loads until needed:
 * - preload="none" + poster, sources attached only when near the viewport
 * - plays only while visible (and `active`), pauses otherwise
 * - respects reduced motion and Save-Data (poster only)
 */
export function LazyVideo({ webm, mp4, poster, className, active = true, label, rootMargin = "300px" }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches || !!nav.connection?.saveData);
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setNear(true);
      },
      { rootMargin },
    );
    const io2 = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    io2.observe(el);
    return () => {
      io.disconnect();
      io2.disconnect();
    };
  }, [rootMargin]);

  useEffect(() => {
    const el = ref.current;
    if (!el || still || !near) return;
    if (visible && active) {
      const p = el.play();
      p?.catch(() => {});
    } else {
      el.pause();
    }
  }, [visible, active, near, still]);

  return (
    <video
      ref={ref}
      className={className}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      aria-label={label}
      disablePictureInPicture
    >
      {near && !still && webm ? <source src={webm} type="video/webm" /> : null}
      {near && !still && mp4 ? <source src={mp4} type="video/mp4" /> : null}
    </video>
  );
}
