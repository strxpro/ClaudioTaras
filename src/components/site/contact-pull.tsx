"use client";

import { useEffect, useRef } from "react";
import s from "./contact-pull.module.css";

const C = 2 * Math.PI * 46;

/**
 * The end of a page: keep scrolling and a ring around an arrow fills up; when it closes, you are
 * taken to the contact page (through the normal page transition). Clicking it works too.
 */
export function ContactPull({ href, title, lead, hint }: { href: string; title: string; lead: string; hint: string }) {
  const root = useRef<HTMLElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const link = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const el = root.current!;
    // keep our own handles: React detaches refs before this effect's cleanup runs, and a frame
    // can land in between (right after the link took us to the contact page)
    const circle = ring.current!;
    const a = link.current!;
    let raf = 0;
    let fired = false;
    let near = false;
    let gone = false;
    const tick = () => {
      raf = 0;
      if (!near || gone) return;
      raf = requestAnimationFrame(tick);
      const r = el.getBoundingClientRect();
      const total = Math.max(1, r.height - innerHeight);
      const p = Math.min(1, Math.max(0, -r.top / total));
      circle.style.strokeDashoffset = String(C * (1 - p));
      el.style.setProperty("--p", p.toFixed(3));
      if (p > 0.985 && !fired) {
        fired = true;
        a.click();
      }
      if (p < 0.6) fired = false;
    };
    const io = new IntersectionObserver(([e]) => {
      near = e.isIntersecting;
      if (near && !raf) raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      gone = true;
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section ref={root} className={s.pull}>
      <div className={s.sticky}>
        <p className={s.lead}>{lead}</p>
        <a ref={link} href={href} className={s.circle} aria-label={title}>
          <svg viewBox="0 0 100 100" aria-hidden>
            <circle className={s.track} cx="50" cy="50" r="46" />
            <circle ref={ring} className={s.fill} cx="50" cy="50" r="46" style={{ strokeDasharray: C, strokeDashoffset: C }} />
          </svg>
          <span className={s.arrow} aria-hidden>
            ↓
          </span>
        </a>
        <p className={s.title}>{title}</p>
        <p className={s.hint}>{hint}</p>
      </div>
    </section>
  );
}
