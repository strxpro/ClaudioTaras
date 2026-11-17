"use client";

import { useEffect } from "react";

/**
 * Phones: typing must never make the page jump. While the on-screen keyboard is open the page gets
 * room for it at the bottom (--kb on <html>, used as body padding), the floating bars step aside
 * (html.kb), and the field being typed in is brought calmly to the middle of what is still visible.
 */
export function KeyboardSafe() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !matchMedia("(pointer: coarse)").matches) return;
    const html = document.documentElement;
    let field: HTMLElement | null = null;
    let t = 0;
    const typing = (el: Element | null): el is HTMLElement =>
      !!el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !/checkbox|radio|range|button|submit|file/.test((el as HTMLInputElement).type)) || (el as HTMLElement).isContentEditable);
    const update = () => {
      const kb = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
      html.style.setProperty("--kb", `${kb}px`);
      html.classList.toggle("kb", kb > 80 && !!field);
      if (field && kb > 80) {
        clearTimeout(t);
        t = window.setTimeout(() => {
          if (!field || field.closest("[data-kb-own]")) return;
          const r = field.getBoundingClientRect();
          const mid = vv.offsetTop + vv.height * 0.42;
          const dy = r.top + r.height / 2 - mid;
          if (Math.abs(dy) > 24) window.scrollBy({ top: dy, behavior: "smooth" });
        }, 120);
      }
    };
    const onIn = (e: FocusEvent) => {
      if (!typing(e.target as Element)) return;
      field = e.target as HTMLElement;
      update();
    };
    const onOut = () => {
      field = null;
      setTimeout(update, 60);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    addEventListener("focusin", onIn);
    addEventListener("focusout", onOut);
    return () => {
      clearTimeout(t);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      removeEventListener("focusin", onIn);
      removeEventListener("focusout", onOut);
      html.classList.remove("kb");
    };
  }, []);
  return null;
}
