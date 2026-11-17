"use client";

import { useEffect, useRef, useState } from "react";
import { locales, localeNames, type Locale } from "@/lib/i18n";
import { sfx, sound } from "@/lib/sound";
import { whenStill } from "@/lib/when-still";
import { LangLink } from "@/components/site/lang-switch";
import { Flag } from "@/components/site/logo";
import s from "./story.module.css";

const WAVE_W = 28;
const WAVE_H = 20;
/** three sine layers drawn on top of each other: frequency across the button, drift speed, height */
const LAYERS = [
  { f: 1.5, sp: 2.4, k: 1 },
  { f: 2.3, sp: -1.7, k: 0.6 },
  { f: 1.05, sp: 1.1, k: 0.38 },
];

/**
 * Music on/off. Playing: a soft, smooth sound wave that swells with the actual music. Click: the
 * music fades to zero, the wave settles into a flat line and a stroke crosses the button out.
 * The music itself starts on the visitor's first click or tap anywhere (browsers require one),
 * unless they muted it on an earlier visit.
 */
export function SoundButton({ labels }: { labels: { on: string; off: string } }) {
  const [playing, setPlaying] = useState(false);
  const [wanted, setWanted] = useState(true);
  const paths = useRef<(SVGPathElement | null)[]>([]);

  useEffect(() => {
    const e = sound();
    const sync = () => {
      setPlaying(e.playing);
      setWanted(e.wanted);
    };
    sync();
    const off = e.subscribe(sync);
    // first gesture anywhere starts the music (the button itself handles its own click)
    const first = (ev: Event) => {
      if ((ev.target as Element | null)?.closest?.("[data-sound]")) return;
      if (e.wanted && !e.playing) void e.start();
      done();
    };
    // the audio graph (opening the audio device takes a few hundred ms on some machines) is built in
    // a still, idle moment after the intro, so the first click only resumes it
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel = () => {};
    const ready = () => void (timer = setTimeout(() => (cancel = whenStill(() => e.prepare(), 900)), 1200));
    if (document.documentElement.dataset.intro === "done") ready();
    else addEventListener("intro:done", ready, { once: true });
    const evs = ["pointerdown", "keydown", "touchend"] as const;
    const done = () => evs.forEach((n) => removeEventListener(n, first, true));
    evs.forEach((n) => addEventListener(n, first, true));
    return () => {
      off();
      done();
      clearTimeout(timer);
      cancel();
      removeEventListener("intro:done", ready);
    };
  }, []);

  // the wave: amplitude eases towards the music's loudness (or a quiet sway while waiting for the
  // first tap, or zero when muted); the loop stops once it has flattened out
  useEffect(() => {
    const e = sound();
    const buf = new Float32Array(512);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let amp = e.playing ? 0.4 : 0;
    let phase = 0;
    let last = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const waiting = e.wanted && !e.playing && !e.ctx;
      const target = e.playing ? 0.32 + e.level(buf) * 0.85 : waiting ? 0.22 : 0;
      amp += (target - amp) * Math.min(1, dt * (target > amp ? 5 : 2.6));
      phase += dt * (reduced ? 0 : 1 + amp * 1.4);
      LAYERS.forEach((L, i) => {
        const el = paths.current[i];
        if (!el) return;
        let d = "";
        for (let x = 0; x <= WAVE_W; x += 1) {
          const env = Math.sin((Math.PI * x) / WAVE_W) ** 1.4;
          const y = WAVE_H / 2 + amp * 7.5 * L.k * env * Math.sin((2 * Math.PI * L.f * x) / WAVE_W + phase * L.sp);
          d += `${x ? "L" : "M"}${x} ${y.toFixed(2)}`;
        }
        el.setAttribute("d", d);
      });
      if (!e.playing && !waiting && amp < 0.004) return; // flat: stop until something changes
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [playing, wanted]);

  const flat = `M0 ${WAVE_H / 2}H${WAVE_W}`;
  return (
    <button
      type="button"
      data-sound
      data-magnetic
      className={`${s.soundBtn} ${playing ? s.soundOn : ""} ${!wanted ? s.soundOff : ""}`}
      aria-pressed={playing}
      aria-label={playing ? labels.off : labels.on}
      title={playing ? labels.off : labels.on}
      onClick={() => {
        sound().toggle();
        if (!sound().playing) sfx("tick");
      }}
    >
      <svg className={s.soundWave} viewBox={`0 0 ${WAVE_W} ${WAVE_H}`} aria-hidden>
        {LAYERS.map((_, k) => (
          <path key={k} ref={(el) => void (paths.current[k] = el)} d={flat} />
        ))}
      </svg>
      <svg className={s.soundStrike} viewBox="0 0 42 42" aria-hidden>
        <path className={s.soundCut} d="M12 12 30 30" />
        <path d="M12 12 30 30" />
      </svg>
    </button>
  );
}

/** Language picker in the floating pill: the current flag; opens upwards. */
export function PillLang({ locale, detected, note, label }: { locale: Locale; detected: Locale | null; note: string; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("pointerdown", away);
    addEventListener("keydown", esc);
    return () => {
      removeEventListener("pointerdown", away);
      removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className={s.pillLang}>
      <button
        type="button"
        className={s.pillLangBtn}
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          sfx("tap");
          setOpen((v) => !v);
        }}
      >
        <Flag locale={locale} className={s.flag} />
      </button>
      {open ? (
        <ul className={s.pillLangList}>
          {detected ? <li className={s.langNote}>📍 {note}</li> : null}
          {locales.map((l) => (
            <li key={l}>
              <LangLink locale={l} current={locale} onDone={() => setOpen(false)}>
                <Flag locale={l} className={s.flag} />
                {localeNames[l]}
                <span>{l === detected ? "📍" : l}</span>
              </LangLink>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
