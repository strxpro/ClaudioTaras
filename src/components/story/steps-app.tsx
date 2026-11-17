"use client";

import { useEffect, useRef, useState } from "react";
import s from "./steps-app.module.css";

export type AppCopy = {
  title: string;
  step: string;
  chat: { me: string; you: string };
  plan: { title: string; items: string[] };
  build: { title: string; note: string };
  live: { title: string; note: string; sub: string };
};

const STEP_MS = 3000;

/**
 * The phone's screen once the card has landed: a tiny app that plays how working together goes,
 * as stories (bars on top, one step every 3 s, tap to skip): you write → a plan in 24 h → design and
 * code, live → your site is online. Everything is CSS, sized in card px (--cu) like the card it replaces.
 */
export function StepsApp({ copy, onClass }: { copy: AppCopy; onClass: string }) {
  const [k, setK] = useState(0);
  const [run, setRun] = useState(0);
  const [on, setOn] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // the story engine marks the landed card with a class; follow it without re-rendering the story
  useEffect(() => {
    const host = root.current!.parentElement!;
    const read = () => setOn(host.classList.contains(onClass));
    read();
    const mo = new MutationObserver(read);
    mo.observe(host, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [onClass]);

  useEffect(() => {
    if (!on) {
      setK(0);
      return;
    }
    const id = setTimeout(() => setK((v) => (v + 1) % 4), STEP_MS);
    return () => clearTimeout(id);
  }, [on, k, run]);

  // a tap on the phone (the card hit area in story.tsx) skips ahead
  useEffect(() => {
    const next = () => {
      setK((v) => (v + 1) % 4);
      setRun((r) => r + 1);
    };
    addEventListener("app:next", next);
    return () => removeEventListener("app:next", next);
  }, []);

  return (
    <div ref={root} className={`${s.app} ${on ? s.on : ""}`} aria-hidden>
      <div className={s.bars}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={s.bar}>
            <i key={i === k ? `${k}-${run}` : i} className={i < k ? s.full : i === k && on ? s.fill : ""} />
          </span>
        ))}
      </div>
      <p className={s.head}>
        <span className={s.dot} />
        {copy.title}
        <em>{copy.step.replace("{n}", String(k + 1))}</em>
      </p>

      {/* 1 · you write */}
      <section className={`${s.scr} ${k === 0 ? s.cur : ""}`}>
        <p className={`${s.bubble} ${s.me}`}>{copy.chat.me}</p>
        <p className={s.typing}>
          <i />
          <i />
          <i />
        </p>
        <p className={`${s.bubble} ${s.you}`}>{copy.chat.you}</p>
      </section>

      {/* 2 · a plan within 24 h */}
      <section className={`${s.scr} ${k === 1 ? s.cur : ""}`}>
        <div className={s.ring}>
          <svg viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" />
            <circle className={s.ringFg} cx="50" cy="50" r="42" />
          </svg>
          <b>24h</b>
        </div>
        <p className={s.title}>{copy.plan.title}</p>
        <ul className={s.checks}>
          {copy.plan.items.map((t, i) => (
            <li key={t} style={{ ["--i" as string]: i }}>
              <span>✓</span>
              {t}
            </li>
          ))}
        </ul>
      </section>

      {/* 3 · design and code, you watch it grow */}
      <section className={`${s.scr} ${k === 2 ? s.cur : ""}`}>
        <div className={s.site}>
          <span className={s.nav} />
          <span className={s.heroBlock} />
          <span className={s.line1} />
          <span className={s.line2} />
          <div className={s.cards}>
            <span />
            <span />
            <span />
          </div>
          <span className={s.cursor} />
        </div>
        <p className={s.title}>{copy.build.title}</p>
        <p className={s.note}>{copy.build.note}</p>
      </section>

      {/* 4 · online */}
      <section className={`${s.scr} ${k === 3 ? s.cur : ""}`}>
        <div className={s.toggle}>
          <span />
        </div>
        <p className={s.big}>{copy.live.title}</p>
        <p className={s.note}>{copy.live.note}</p>
        <div className={s.chart}>
          {[22, 30, 26, 44, 52, 48, 70, 86].map((h, i) => (
            <span key={i} style={{ ["--h" as string]: `${h}%`, ["--i" as string]: i }} />
          ))}
        </div>
        <p className={s.sub}>{copy.live.sub}</p>
      </section>
    </div>
  );
}
