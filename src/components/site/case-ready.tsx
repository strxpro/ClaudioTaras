"use client";

import { useEffect } from "react";

/**
 * Tells a running morph transition that the case page is ready (so the overlay can fade): once it has
 * painted and its hero picture is decoded — fading onto an empty frame read as a flash. Max 1.2 s.
 */
export function CaseReady() {
  useEffect(() => {
    let gone = false;
    let a = 0;
    const fire = () => !gone && window.dispatchEvent(new Event("case:ready"));
    const b = requestAnimationFrame(() => {
      a = requestAnimationFrame(() => {
        const img = document.querySelector<HTMLImageElement>("main section img");
        if (!img || (img.complete && img.naturalWidth)) return fire();
        Promise.race([img.decode().catch(() => undefined), new Promise((r) => setTimeout(r, 1200))]).then(fire);
      });
    });
    return () => {
      gone = true;
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, []);
  return null;
}
