"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import type { StoryProps } from "@/lib/story-props";
import { Story } from "./story";

const TEXT = "h1,h2,h3,p,li,dt,dd,a,button,[data-intro]";

/** Visible text in the viewport (outermost elements only), for the swap animation. */
function visibleText(): HTMLElement[] {
  const vh = innerHeight;
  const out: HTMLElement[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(`main ${TEXT.split(",").join(", main ")}`))) {
    if (!el.textContent?.trim()) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh || r.width === 0) continue;
    if (out.some((o) => o.contains(el))) continue;
    out.push(el);
    if (out.length > 60) break;
  }
  return out;
}

declare global {
  interface Window {
    __storySwap?: (l: string) => void;
  }
}

/**
 * The home page, able to change language in place: the words blur out line by line, the new
 * language's data (prefetched on hover) is swapped in under the same scroll position, 3D scenes
 * and animations keep running, the address bar and <html lang> follow, and the words come back.
 */
export function StoryHost({ initial }: { initial: StoryProps }) {
  const [props, setProps] = useState(initial);
  const cache = useRef(new Map<string, Promise<StoryProps>>([[initial.locale, Promise.resolve(initial)]]));

  useEffect(() => {
    const get = (l: string) => {
      if (!cache.current.has(l)) cache.current.set(l, fetch(`/api/story?locale=${l}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))));
      return cache.current.get(l)!;
    };
    let busy = false;
    const swap = async (l: string) => {
      if (busy || l === document.documentElement.lang) return;
      busy = true;
      const data = get(l);
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const out = visibleText();
      if (!reduced && out.length) await gsap.to(out, { opacity: 0, y: -8, filter: "blur(6px)", duration: 0.28, ease: "power2.in", stagger: { each: 0.008 } });
      try {
        const next = await data;
        setProps(next);
        document.documentElement.lang = l;
        document.title = next.dict.meta.title;
        history.replaceState(history.state, "", `/${l}${location.search}${location.hash}`);
        document.cookie = `ct_locale=${l}; path=/; max-age=31536000; samesite=lax`;
        dispatchEvent(new CustomEvent("locale:changed", { detail: l }));
      } catch {
        location.href = `/${l}`;
        return;
      } finally {
        busy = false;
      }
      requestAnimationFrame(() => {
        gsap.set(out, { clearProps: "opacity,transform,filter" });
        const back = visibleText();
        if (!reduced)
          gsap.fromTo(back, { opacity: 0, y: 10, filter: "blur(6px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.55, ease: "expo.out", stagger: { each: 0.018 }, clearProps: "opacity,transform,filter" });
      });
    };
    const prefetch = (e: Event) => void get((e as CustomEvent<string>).detail).catch(() => {});
    window.__storySwap = (l) => void swap(l);
    addEventListener("locale:prefetch", prefetch);
    return () => {
      delete window.__storySwap;
      removeEventListener("locale:prefetch", prefetch);
    };
  }, []);

  return <Story {...props} />;
}
