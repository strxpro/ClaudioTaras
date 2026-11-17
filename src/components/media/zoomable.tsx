"use client";

import type { ReactNode } from "react";
import { useLightbox, type Shot } from "./lightbox";

/** Wraps any media so a click opens it (image or looping video) in the masked pop-out viewer. */
export function Zoomable({ shot, label, labels, className, children }: { shot: Shot; label: string; labels: { close: string; prev: string; next: string }; className?: string; children: ReactNode }) {
  const lb = useLightbox([shot], labels);
  return (
    <>
      <div
        ref={lb.register(0)}
        role="button"
        tabIndex={0}
        aria-label={`${shot.alt} — ${label}`}
        onClick={() => lb.show(0)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), lb.show(0))}
        data-cursor={label}
        className={`group cursor-pointer ${className ?? ""}`}
      >
        {children}
      </div>
      {lb.portal}
    </>
  );
}
