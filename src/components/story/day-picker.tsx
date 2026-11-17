"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { sfx } from "@/lib/sound";
import s from "./story.module.css";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Labels = { qDate: string; cal: string; calTitle: string; calFree: string; calBusy: string; calPrev: string; calNext: string; calClose: string };

/**
 * The call days as a row of chips you can drag, scroll or step through with the arrows; the last chip
 * opens the whole calendar (a month grid: free days to tap, busy / past days greyed out).
 */
export function DayPicker({ slots, day, onPick, locale, labels }: { slots: Date[]; day: number; onPick: (k: number) => void; locale: string; labels: Labels }) {
  const row = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState<[boolean, boolean]>([true, false]);
  const [cal, setCal] = useState(false);
  const fmt = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }), [locale]);

  // arrows only where there is more to see
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const sync = () => setEnds([el.scrollLeft < 4, el.scrollLeft + el.clientWidth > el.scrollWidth - 4]);
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, []);

  // mouse: drag the row sideways (a drag is not a click)
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    let x0 = 0;
    let s0 = 0;
    let moved = false;
    let on = false;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      on = true;
      moved = false;
      x0 = e.clientX;
      s0 = el.scrollLeft;
    };
    const move = (e: PointerEvent) => {
      if (!on) return;
      const dx = e.clientX - x0;
      if (!moved && Math.abs(dx) > 5) {
        moved = true;
        el.style.scrollSnapType = "none";
        el.style.cursor = "grabbing";
      }
      if (moved) el.scrollLeft = s0 - dx;
    };
    const up = () => {
      if (!on) return;
      on = false;
      if (!moved) return;
      el.style.cursor = "";
      // let it settle on a chip again
      requestAnimationFrame(() => (el.style.scrollSnapType = ""));
      const eat = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      el.addEventListener("click", eat, { capture: true, once: true });
      setTimeout(() => el.removeEventListener("click", eat, { capture: true }), 0);
    };
    el.addEventListener("pointerdown", down);
    addEventListener("pointermove", move, { passive: true });
    addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
    };
  }, []);

  const page = (dir: number) => {
    const el = row.current;
    if (!el) return;
    sfx("tick");
    el.scrollBy({ left: dir * el.clientWidth * 0.75, behavior: "smooth" });
  };

  const pick = (k: number) => {
    sfx("tick");
    onPick(k);
    // bring the chip into view (it may have been picked in the calendar)
    requestAnimationFrame(() => row.current?.children[k]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }));
  };

  return (
    <>
      <div className={s.daysWrap} data-start={ends[0] ? "" : undefined} data-end={ends[1] ? "" : undefined}>
        <button type="button" className={`${s.daysArrow} ${s.daysPrev}`} onClick={() => page(-1)} aria-label={labels.calPrev} tabIndex={ends[0] ? -1 : 0}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div ref={row} className={s.days} role="listbox" aria-label={labels.qDate}>
          {slots.map((d, k) => {
            const [wd, ...rest] = fmt.format(d).split(/[ ,]+/);
            return (
              <button key={k} type="button" role="option" aria-selected={k === day} className={`${s.dayBtn} ${k === day ? s.dayOn : ""}`} style={{ ["--i" as string]: Math.min(k, 10) } as CSSProperties} onClick={() => pick(k)}>
                <small>{wd}</small>
                <b>{d.getDate()}</b>
                <small>{rest.filter((x) => !/^\d+\.?$/.test(x)).join(" ")}</small>
              </button>
            );
          })}
          <button
            type="button"
            className={`${s.dayBtn} ${s.dayCal}`}
            style={{ ["--i" as string]: Math.min(slots.length, 10) } as CSSProperties}
            onClick={() => {
              sfx("pop");
              setCal(true);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
              <path d="M3.5 10h17M8 3v4M16 3v4" />
            </svg>
            <small>{labels.cal}</small>
          </button>
        </div>
        <button type="button" className={`${s.daysArrow} ${s.daysNext}`} onClick={() => page(1)} aria-label={labels.calNext} tabIndex={ends[1] ? -1 : 0}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      {cal ? (
        <Calendar
          slots={slots}
          selected={day}
          locale={locale}
          labels={labels}
          onClose={() => setCal(false)}
          onPick={(k) => {
            setCal(false);
            pick(k);
          }}
        />
      ) : null}
    </>
  );
}

/** Month grid in a sheet: free call days are buttons, everything else is quietly greyed out. */
function Calendar({ slots, selected, locale, labels, onClose, onPick }: { slots: Date[]; selected: number; locale: string; labels: Labels; onClose: () => void; onPick: (k: number) => void }) {
  const index = useMemo(() => new Map(slots.map((d, k) => [ymd(d), k])), [slots]);
  const first = slots[0] ?? new Date();
  const lastDay = slots[slots.length - 1] ?? first;
  const start = new Date((slots[selected] ?? first).getFullYear(), (slots[selected] ?? first).getMonth(), 1);
  const [month, setMonth] = useState(start);
  const minM = new Date(first.getFullYear(), first.getMonth(), 1);
  const maxM = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1);
  const title = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month);
  // weekday initials, Monday first (the calls are in Italian time)
  const week = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { weekday: "short" });
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 1 + i)).replace(/\.$/, ""));
  }, [locale]);
  const today = ymd(new Date());

  const cells: (Date | null)[] = [];
  const lead = (month.getDay() + 6) % 7;
  for (let i = 0; i < lead; i++) cells.push(null);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let d = 1; d <= days; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d, 12));

  useEffect(() => {
    window.__lenis?.stop();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", esc);
    return () => {
      window.__lenis?.start();
      removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const step = (n: number) => {
    sfx("tick");
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  };

  return createPortal(
    <div className={s.calLayer} role="dialog" aria-modal="true" aria-label={labels.calTitle}>
      <div className={s.calBack} onClick={onClose} />
      <div className={s.calCard}>
        <div className={s.calHead}>
          <div>
            <p className={s.calKicker}>{labels.calTitle}</p>
            <p className={s.calMonth}>{title}</p>
          </div>
          <div className={s.calNav}>
            <button type="button" onClick={() => step(-1)} disabled={month <= minM} aria-label={labels.calPrev}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <button type="button" onClick={() => step(1)} disabled={month >= maxM} aria-label={labels.calNext}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
        <div className={s.calGrid}>
          {week.map((w, i) => (
            <span key={`w${i}`} className={s.calWeek}>
              {w}
            </span>
          ))}
          {cells.map((d, i) => {
            if (!d) return <span key={i} />;
            const key = ymd(d);
            const k = index.get(key);
            const free = k !== undefined;
            return (
              <button
                key={i}
                type="button"
                disabled={!free}
                className={`${s.calDay} ${free ? s.calFree : ""} ${k === selected ? s.calOn : ""} ${key === today ? s.calToday : ""}`}
                onClick={() => free && onPick(k)}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
        <div className={s.calFoot}>
          <span>
            <i className={s.calDotFree} /> {labels.calFree}
          </span>
          <span>
            <i className={s.calDotBusy} /> {labels.calBusy}
          </span>
          <button type="button" className={s.calClose} onClick={onClose}>
            {labels.calClose}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
