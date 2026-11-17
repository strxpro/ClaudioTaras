"use client";

import { useEffect, useRef } from "react";

type Src = { webm?: string; mp4?: string; poster?: string };

/**
 * Video that is mounted with sources only when `load` is true and plays only when `play` is true.
 * Used in the pinned showcase where visibility is driven by scroll progress, not the viewport.
 */
export function ControlledVideo({ src, load, play, className, label }: { src: Src; load: boolean; play: boolean; className?: string; label?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || !load) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (play) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [play, load]);
  return (
    <video ref={ref} className={className} poster={src.poster} muted loop playsInline preload={load ? "auto" : "none"} aria-label={label}>
      {load && src.webm ? <source src={src.webm} type="video/webm" /> : null}
      {load && src.mp4 ? <source src={src.mp4} type="video/mp4" /> : null}
    </video>
  );
}

export function BrowserFrame({ url, children, className }: { url?: string; children: React.ReactNode; className?: string }) {
  const host = url ? url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "") : "localhost";
  return (
    <div className={`browser-frame ${className ?? ""}`}>
      <div className="flex h-[clamp(20px,2.2vw,30px)] items-center gap-[0.4vw] bg-[#1b1b19] px-[0.8vw]">
        <span className="size-[clamp(5px,0.55vw,9px)] rounded-full bg-[#ff5f57]" />
        <span className="size-[clamp(5px,0.55vw,9px)] rounded-full bg-[#febc2e]" />
        <span className="size-[clamp(5px,0.55vw,9px)] rounded-full bg-[#28c840]" />
        <span className="mx-auto max-w-[50%] truncate rounded-full bg-white/8 px-3 font-mono text-[clamp(7px,0.62vw,11px)] text-white/55">{host}</span>
      </div>
      <div className="relative aspect-[16/10] bg-black">{children}</div>
    </div>
  );
}

export function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`phone-frame ${className ?? ""}`}>
      <div className="screen aspect-[390/844]">
        <span className="absolute left-1/2 top-[1.6%] z-10 h-[2.6%] w-[30%] -translate-x-1/2 rounded-full bg-black" />
        {children}
      </div>
    </div>
  );
}
