"use client";

import { useRouter } from "next/navigation";
import { startTransition, useCallback, useId, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { preload } from "react-dom";
import { gsap } from "gsap";
import type { Dictionary } from "@/lib/dict";
import { localeFromCountry, locales, localeNames, type Locale } from "@/lib/i18n";
import { HOME_KEY, morphTo, rememberHome } from "@/components/site/morph";
import { BACK_KEY } from "@/components/site/back-button";
import { LangLink } from "@/components/site/lang-switch";
import { Flag, LogoMark } from "@/components/site/logo";
import s from "./story.module.css";
import type { DeckCard } from "./cards";
import { clamp01, lin, newProgress } from "./engine";
import { Deck } from "./deck";
import { Ink } from "./ink";
import { Showcase, type ShowcaseItem } from "./showcase";
import { WarpCarousel } from "@/components/ui/warp-carousel";
import { statCards } from "./stat-cards";
import { StepsApp } from "./steps-app";
import { ContactFlow, WaComposer, WaIcon } from "./contact-flow";
import { PillLang, SoundButton } from "./pill-controls";
import { sfx } from "@/lib/sound";
import { whenNear, whenStill } from "@/lib/when-still";
import { scrollPos, viewH } from "@/lib/scroll-pos";
import type { MaskedContact } from "@/lib/masked";
import { Masked } from "@/components/site/masked";

export type StoryProject = {
  slug: string;
  name: string;
  category: string;
  year: number;
  tagline: string;
  summary: string;
  accent: string;
  stack: string[];
  cover: string;
  mobile: string;
  status: string;
  /** "in progress" label when the project is still being built */
  wip?: string;
  logo?: string;
  /** the phone recording (mp4), played on the 3D phone */
  mobVideo?: string;
};

type Props = {
  dict: Dictionary;
  locale: Locale;
  projects: StoryProject[];
  featured: StoryProject[];
  socials: { label: string; url: string }[];
  /** phones + e-mail with blurred endings */
  contacts: MaskedContact[];
  /** busy / free + call slots for the contact flow */
  availability?: import("./contact-flow").Availability;
  years: number;
  age: number;
  portrait?: string;
  whatsapp: string;
};

const PROBLEM_ML = [42.4, 25.1, 17, 42.4];
const pad2 = (n: number) => String(n).padStart(2, "0");
const DAY = 24 * 3600 - 1;
const thisYear = new Date().getFullYear();
const fill = (t: string, age: number, years: number) => t.replace(/\{age\}/g, String(age)).replace(/\{years\}/g, String(years));

/** data-in key → the class that starts that section's CSS entrance */
const IN_CLASS: Record<string, string> = { problem: s.in, journey: s.jIn, stats: s.statsIn, guilds: s.gIn, footer: s.live };

export function Story({ dict, locale, projects, featured, socials, years, age, portrait, whatsapp, contacts, availability }: Props) {
  const st = dict.story;
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const headline = useRef<HTMLHeadingElement>(null);
  const problemHead = useRef<HTMLHeadingElement>(null);
  const journey = useRef<HTMLElement>(null);
  const rows = useRef<HTMLDivElement>(null);
  const voice = useRef<HTMLElement>(null);
  const totem = useRef<HTMLElement>(null);
  const guilds = useRef<HTMLElement>(null);
  const wheel = useRef<HTMLDivElement>(null);
  const guildTitle = useRef<HTMLDivElement>(null);
  const footer = useRef<HTMLElement>(null);
  const burst = useRef<HTMLDivElement>(null);
  const cardHit = useRef<HTMLButtonElement>(null);
  const aboutDom = useRef<HTMLDivElement>(null);
  const localTime = useRef<HTMLElement>(null);
  // the time where I work (Sardinia), for the hero's foot
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
    const put = () => localTime.current && (localTime.current.textContent = fmt.format(new Date()));
    put();
    const id = setInterval(put, 15000);
    return () => clearInterval(id);
  }, [locale]);
  const clockDigits = useRef<(HTMLSpanElement | null)[]>([]);
  const timerText = useRef<HTMLSpanElement>(null);
  const progress = useRef(newProgress());

  const pill = useRef<HTMLDivElement>(null);
  const [lettersOn, setLettersOn] = useState(false);
  const [service, setService] = useState(0);
  const [pick, setPick] = useState(0);
  const [lang, setLang] = useState(false);
  const [detected, setDetected] = useState<Locale | null>(null);
  const [wa, setWa] = useState<{ from: DOMRect | null } | null>(null);
  const [burstOn, setBurstOn] = useState(false);
  const [idle, setIdle] = useState(0);

  // ------------------------------------------------------------ data for the WebGL layers
  const deckCards = useMemo<DeckCard[]>(
    () =>
      projects.map((p) => ({
        label: `${p.category} · ${p.year}`,
        title: p.name,
        body: p.tagline,
        chips: [],
        footer: p.status,
        img: p.cover,
        accent: p.accent,
      })),
    [projects],
  );
  const aboutCard = useMemo<DeckCard>(
    () => ({
      label: st.card.kicker,
      title: st.card.title,
      body: fill(st.card.body, age, years),
      chips: st.card.chips.map((c) => fill(c, age, years)),
      footer: st.card.footer,
      img: portrait ?? "",
      accent: "#ff5a36",
      about: true,
      role: st.card.role,
    }),
    [st, age, years, portrait],
  );
  // the 3D devices show the same screens in every language: rebuild them only when the screens change
  const showKey = featured.map((p) => `${p.cover}|${p.mobile}|${p.mobVideo ?? ""}`).join("~");
  const showItems = useMemo<ShowcaseItem[]>(
    () => featured.map((p) => ({ desk: p.cover.replace(/w=\d+/, "w=1200"), mob: p.mobile || p.cover, accent: p.accent, mobVideo: p.mobVideo })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showKey],
  );
  // the hero cards' pictures start downloading with the HTML (not after the scripts), behind the loader
  for (const c of deckCards) if (c.img) preload(c.img, { as: "image" });
  if (portrait) preload(portrait, { as: "image" });
  // the real numbers on the stat ring — languages: Polish, Italian and English; replies within 24 h
  const stats = useMemo(
    () => statCards(st.stats.cards, [String(years), String(projects.length), "3", "24"], new Date().getFullYear() - years),
    [st, years, projects.length],
  );
  // canvas text needs the real (next/font generated) family names
  const [faces, setFaces] = useState<{ sans: string; serif: string } | null>(null);
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    setFaces({ sans: v("--font-inter") || "Inter, system-ui, sans-serif", serif: v("--font-gilda") || "Georgia, serif" });
  }, []);
  const [narrow, setNarrow] = useState(false);
  const [statIdx, setStatIdx] = useState(0);
  // the stat ring (WebGL + painted cards) starts only when its section comes near — not during the intro
  const statsRing = useRef<HTMLDivElement>(null);
  const [statsNear, setStatsNear] = useState(false);
  useEffect(() => {
    const el = statsRing.current;
    if (!el) return;
    // built in a quiet moment (a few seconds after the intro, or well before the section arrives),
    // as a low-priority update, so building it never lands in the middle of a scroll
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel = () => {};
    const go = () => {
      near();
      clearTimeout(timer);
      cancel();
      startTransition(() => setStatsNear(true));
    };
    const near = whenNear(el, go);
    const later = () => {
      timer = setTimeout(() => (cancel = whenStill(go)), 4000);
    };
    if (document.documentElement.dataset.intro === "done") later();
    else addEventListener("intro:done", later, { once: true });
    return () => {
      near();
      clearTimeout(timer);
      cancel();
      removeEventListener("intro:done", later);
    };
  }, []);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const openWa = (e: React.MouseEvent<HTMLElement>) => {
    const btn = e.currentTarget;
    setWa({ from: btn.classList.contains(s.pillWa) ? btn.getBoundingClientRect() : null });
  };
  // voice pill → first contact step (Sito / App / Gestionale → options 0, 2, 3)
  const preset = useMemo(() => [[0], [2], [3]][service] ?? [0], [service]);

  // ------------------------------------------------------------ the engine (no layout reads per frame)
  useEffect(() => {
    const el = root.current!;
    const P = progress.current;
    // Each scroll variable is written only on the elements that read it, and only when it changes.
    // (Writing them on the page root restyled the whole document on every scrolled frame.)
    const pick = (...cls: string[]) => cls.flatMap((c) => Array.from(el.querySelectorAll<HTMLElement>(`.${CSS.escape(c)}`)));
    const one = (e: HTMLElement | null) => (e ? [e] : []);
    const T: Record<string, HTMLElement[]> = {
      "--vsheet": pick(s.modal, s.tapHint),
      "--vcard": pick(s.deck),
      "--forge": one(voice.current),
      "--inkp": pick(s.clock, s.accept),
      "--dgrow": pick(s.acceptDivider),
      "--hl": pick(s.accept),
      "--phone": pick(s.phone, s.sheetClip, s.tapHint),
      "--vreveal": one(voice.current),
      "--afade": pick(s.clock, s.accept, s.tapHint),
      "--s5off": one(journey.current),
      "--totemscale": pick(s.totemCanvas),
      "--g8off": one(guilds.current),
      "--g8rot": one(guilds.current),
      "--g8hl": one(guilds.current),
      "--g8morph": one(guilds.current),
      "--g8par": one(guilds.current),
    };
    const seen: Record<string, string> = {};
    const set = (k: string, v: number) => {
      const str = v.toFixed(4);
      if (seen[k] === str) return;
      seen[k] = str;
      for (const t of T[k] ?? []) t.style.setProperty(k, str);
    };
    const rowSeen: string[] = [];
    let headHidden = false;
    let aboutOn = false;
    let sheetLive = false;
    const geo ={ jTop: 0, jH: 0, vTop: 0, tTop: 0, gTop: 0, gH: 0, fTop: 0, title: 0, rows: [] as number[] };
    const top = (e: Element | null | undefined) => (e ? e.getBoundingClientRect().top + scrollY : 0);
    const measure = () => {
      geo.jTop = top(journey.current);
      geo.jH = journey.current?.offsetHeight ?? 0;
      geo.vTop = top(voice.current);
      geo.tTop = top(totem.current);
      geo.gTop = top(guilds.current);
      geo.gH = guilds.current?.offsetHeight ?? 0;
      geo.fTop = top(footer.current);
      geo.title = top(guildTitle.current);
      geo.rows = Array.from(rows.current?.children ?? []).map((r) => top(r));
    };
    let pillShown = false;
    let theme = "dark";
    let hitOn = false;

    const update = () => {
      // no layout reads here: the position comes from Lenis, the height is cached (see scroll-pos)
      const vh = viewH() || innerHeight;
      const sc = scrollPos();
      const a = sc / vh;
      P.p = a;
      P.lastScrollAt = performance.now();

      const L = Math.min(1, sc / (vh * 0.33));
      const h1 = headline.current;
      if (h1) {
        // once it has faded out, drop it from rendering: its blend mode would keep compositing the page
        const gone = L >= 1;
        if (gone !== headHidden) {
          headHidden = gone;
          h1.style.visibility = gone ? "hidden" : "";
        }
        if (!gone) {
          h1.style.transform = `translate3d(0, ${(-sc * 0.18).toFixed(1)}px, 0) scale(${(1 - 0.62 * L).toFixed(4)})`;
          h1.style.opacity = String(1 - L);
        }
      }

      // the services stage plays a little faster so the 3D gallery follows right after it (no empty screen)
      const b = lin(geo.vTop + vh * 0.1, geo.vTop + vh * 0.8, sc);
      const vsheet = lin(0, 0.32, b);
      const vcard = lin(0.42, 0.7, b);
      const collapse = lin(0.55, 0.9, b);
      P.collapse = collapse;
      set("--vsheet", vsheet);
      set("--vcard", vcard);
      set("--forge", collapse);
      const jTopV = geo.jTop - sc;
      const jBotV = geo.jTop + geo.jH - sc;
      P.deckHidden = vcard > 0.999 || (jTopV < 0 && jBotV > vh);

      const ink = lin(1.9, 2.6, a) * (1 - collapse);
      P.ink = ink;
      set("--inkp", ink);
      set("--dgrow", lin(2.1, 2.45, a));
      set("--hl", lin(2.3, 2.72, a));
      const phone = lin(2.2, 2.65, a) * (1 - vcard);
      set("--phone", phone);

      const out = clamp01((vh - jBotV) / vh);
      const inn = clamp01((vh - jTopV) / vh);
      const afade = clamp01(jTopV / (vh * 0.7));
      set("--vreveal", out);
      set("--afade", afade);
      set("--s5off", Math.min(1, 1 - inn + out));
      const list = rows.current?.children;
      if (list)
        for (let k = 0; k < list.length; k++) {
          const v = clamp01((vh * 0.9 - (geo.rows[k] - sc)) / (vh * 0.45)).toFixed(3);
          if (rowSeen[k] === v) continue;
          rowSeen[k] = v;
          (list[k] as HTMLElement).style.setProperty("--rp", v);
        }

      // the about card answers clicks once it sits in the phone
      const canTap = phone > 0.92 && afade > 0.5 && vsheet < 0.05;
      if (canTap !== hitOn) {
        hitOn = canTap;
        cardHit.current?.classList.toggle(s.cardHitOn, canTap);
        if (!canTap) setBurstOn(false);
      }
      const live = vsheet > 0.001;
      if (live !== sheetLive) {
        sheetLive = live;
        for (const m of T["--vsheet"]) if (m.classList.contains(s.modal)) m.classList.toggle(s.mLive, live);
      }
      // once it has landed, the crisp HTML copy of the card takes over from the WebGL one
      const landed = phone > 0.995 && vsheet < 0.004 && a > 2.3;
      if (landed !== aboutOn) {
        aboutOn = landed;
        P.aboutDom = landed;
        P.aboutAt = performance.now();
        aboutDom.current?.classList.toggle(s.aboutOn, landed);
      }

      set("--totemscale", 1 - 0.35 * lin(geo.tTop, geo.tTop + vh, sc));

      const g = clamp01((vh - (geo.gTop - sc)) / vh);
      set("--g8off", 1 - g);
      set("--g8rot", 1 - g);
      P.g8rot = 1 - g;
      const tt = (geo.title - sc) / vh;
      set("--g8hl", lin(1.05, 0.6, tt));
      set("--g8morph", lin(0.52, 0.12, tt));
      set("--g8par", clamp01((sc + vh - geo.gTop) / (vh + geo.gH)));

      // pill: only after the header has scrolled away, never over the contact flow
      const on = sc > 140 && !(geo.fTop - sc < vh * 0.55);
      // classes, not React state: a state change here re-rendered the whole page mid-scroll
      if (on !== pillShown) {
        pillShown = on;
        pill.current?.classList.toggle(s.waitPillOn, on);
      }
      const probe = vh - 52;
      const within = (t: number, h: number) => t - sc < probe && t + h - sc > probe;
      let th = "dark";
      if (within(geo.jTop, geo.jH) || within(geo.gTop, geo.gH)) th = "light";
      else if (ink > 0.55 && geo.tTop - sc > probe) th = "lilac";
      if (th !== theme) {
        theme = th;
        pill.current?.classList.toggle(s.waitPillLight, th === "light");
        pill.current?.classList.toggle(s.waitPillLilac, th === "lilac");
      }
    };

    measure();
    update();
    let queued = 0;
    const onScroll = () => {
      // with Lenis attached, its own scroll callback (below) already updates in this frame
      if (offLenis) return;
      if (!queued) queued = requestAnimationFrame(() => ((queued = 0), update()));
    };
    addEventListener("scroll", onScroll, { passive: true });
    // with Lenis, update inside its own frame callback (same frame as the scroll, no 1-frame lag)
    let offLenis: (() => void) | undefined;
    let tries = 0;
    const hook = () => {
      const l = window.__lenis;
      if (l) offLenis = l.on("scroll", update);
      else if (tries++ < 120) attachRaf = requestAnimationFrame(hook);
    };
    let attachRaf = requestAnimationFrame(hook);
    const onResize = () => {
      measure();
      update();
    };
    addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(queued);
      cancelAnimationFrame(attachRaf);
      offLenis?.();
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, []);

  // ------------------------------------------------------------ intro: letters rise after the loader
  useEffect(() => {
    const go = () => setTimeout(() => setLettersOn(true), 350);
    if (document.documentElement.dataset.intro === "done") go();
    else addEventListener("intro:done", go, { once: true });
    const m = document.cookie.match(/(?:^|; )ct_country=([A-Z]{2})/);
    if (m) setDetected(localeFromCountry(m[1]));
    return () => removeEventListener("intro:done", go);
  }, []);

  // ------------------------------------------------------------ headline + problem lines fitted to the width
  useEffect(() => {
    const fit = () => {
      const h = headline.current;
      if (h) {
        const gut = innerWidth <= 768 ? 16 : 40;
        h.style.fontSize = "200px";
        const w = h.scrollWidth;
        if (w > 0) h.style.fontSize = `${(200 * (innerWidth - gut * 2)) / w}px`;
      }
      const ph = problemHead.current;
      if (ph && innerWidth > 768) {
        ph.style.setProperty("--pfs", "6.4vw");
        const lines = Array.from(ph.children) as HTMLElement[];
        const gut = 40;
        const limit = innerWidth - gut;
        const widths = lines.map((l) => {
          l.style.marginLeft = "0px";
          const range = document.createRange();
          range.selectNodeContents(l);
          return range.getBoundingClientRect().width;
        });
        const k = Math.min(1, ...widths.map((w) => (limit - gut) / w));
        if (k < 1) ph.style.setProperty("--pfs", `${6.4 * k}vw`);
        lines.forEach((l, i) => {
          const w = widths[i] * k;
          l.style.marginLeft = `${Math.max(gut, Math.min((PROBLEM_ML[i] / 100) * innerWidth, limit - w))}px`;
        });
      }
    };
    fit();
    document.fonts?.ready.then(fit);
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, []);

  // ------------------------------------------------------------ "in" flags (CSS-driven entrances)
  useEffect(() => {
    const els = Array.from(root.current!.querySelectorAll<HTMLElement>("[data-in]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          // a class on that section only (a state flag re-rendered the whole page each time)
          const cls = IN_CLASS[(e.target as HTMLElement).dataset.in!];
          if (cls) e.target.classList.add(cls);
          io.unobserve(e.target);
        }
      },
      { threshold: 0.3 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  // ------------------------------------------------------------ 24h countdown (the clock and the phone)
  useEffect(() => {
    let left = DAY;
    let first = true;
    const tick = () => {
      const str = pad2(Math.floor(left / 3600)) + pad2(Math.floor((left % 3600) / 60)) + pad2(left % 60);
      // the big digits only matter while the clock is uncovered (saves a full-width repaint per second)
      if (first || progress.current.ink > 0.001) clockDigits.current.forEach((d, k) => d && d.textContent !== str[k] && (d.textContent = str[k]));
      if (timerText.current) timerText.current.textContent = `${str.slice(0, 2)}:${str.slice(2, 4)}:${str.slice(4)}`;
      left = left > 0 ? left - 1 : DAY;
      first = false;
    };
    tick();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ------------------------------------------------------------ hero: grab the spiral and spin it
  useEffect(() => {
    const h = hero.current!;
    const P = progress.current;
    let last: number | null = null;
    let start: { x: number; y: number; t: number } | null = null;
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("a, button, ul")) return;
      last = e.clientX;
      start = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const move = (e: PointerEvent) => {
      if (last === null) return;
      P.spinVel += (e.clientX - last) * -0.004;
      last = e.clientX;
    };
    // a short tap (not a drag) on a card opens that project
    const up = (e: PointerEvent) => {
      last = null;
      if (start && e.type === "pointerup" && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 10 && performance.now() - start.t < 450)
        dispatchEvent(new CustomEvent("deck:tap", { detail: { x: e.clientX, y: e.clientY } }));
      start = null;
    };
    h.addEventListener("pointerdown", down);
    addEventListener("pointermove", move, { passive: true });
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    return () => {
      h.removeEventListener("pointerdown", down);
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
    };
  }, []);

  // ------------------------------------------------------------ journey rows: photos drift towards the cursor (cached rects)
  useEffect(() => {
    const list = rows.current;
    if (!list || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let mx = -1;
    let my = -1;
    let active = false;
    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
    };
    addEventListener("mousemove", onMove, { passive: true });
    const io = new IntersectionObserver(([e]) => (active = e.isIntersecting));
    io.observe(list);
    const imgs = Array.from(list.querySelectorAll<HTMLElement>("[data-photo]"));
    const cur = imgs.map(() => 0);
    let raf = 0;
    const shown = imgs.map(() => "");
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!active) return;
      const sc = scrollPos();
      imgs.forEach((img, k) => {
        const cy = (img.dataset.cy ? Number(img.dataset.cy) : 0) - sc;
        const cx = img.dataset.cx ? Number(img.dataset.cx) : 0;
        let target = 0;
        if (mx >= 0) target = Math.max(-60, Math.min(60, (mx - cx) * 0.16)) / (1 + ((my - cy) / 140) ** 2);
        cur[k] += (target - cur[k]) * 0.12;
        // only touch the DOM when the photo actually moves
        const v = `translateX(${cur[k].toFixed(1)}px)`;
        if (v === shown[k]) return;
        shown[k] = v;
        img.style.transform = v;
      });
    };
    const cache = () =>
      imgs.forEach((img) => {
        const r = img.getBoundingClientRect();
        const t = img.style.transform;
        img.dataset.cx = String(r.left + r.width / 2 - (parseFloat(t.replace(/[^\d.-]/g, "")) || 0));
        img.dataset.cy = String(r.top + r.height / 2 + scrollY);
      });
    cache();
    const ro = new ResizeObserver(cache);
    ro.observe(list);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      removeEventListener("mousemove", onMove);
    };
  }, []);

  // ------------------------------------------------------------ clients wheel: drag it round, with inertia
  useEffect(() => {
    const sec = guilds.current!;
    const w = wheel.current!;
    const n = projects.length;
    let spin = 0;
    let vel = 0;
    let last: number | null = null;
    let raf = 0;
    let visible = false;
    let topK = -1;
    const items = Array.from(w.querySelectorAll<HTMLElement>(`.${CSS.escape(s.crestItem)}`));
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(sec);
    const down = (e: PointerEvent) => {
      last = e.clientX;
      vel = 0;
    };
    const move = (e: PointerEvent) => {
      if (last === null) return;
      const d = (e.clientX - last) * 0.25;
      last = e.clientX;
      spin += d;
      vel = d;
    };
    const up = () => (last = null);
    sec.addEventListener("pointerdown", down);
    addEventListener("pointermove", move, { passive: true });
    addEventListener("pointerup", up);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      if (last === null) {
        vel *= 0.95;
        spin += vel + 0.02;
      }
      w.style.setProperty("--wspin", `${spin.toFixed(2)}deg`);
      const rot = -progress.current.g8rot * 40 + spin;
      let best = 0;
      let bestD = 999;
      for (let k = 0; k < n; k++) {
        const a = ((((k * 360) / n + rot) % 360) + 540) % 360 - 180;
        if (Math.abs(a) < bestD) {
          bestD = Math.abs(a);
          best = k;
        }
      }
      if (best !== topK) {
        items[topK]?.classList.remove(s.crestTop);
        items[best]?.classList.add(s.crestTop);
        topK = best;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      sec.removeEventListener("pointerdown", down);
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
    };
  }, [projects.length]);

  // ------------------------------------------------------------ showcase: the 3D canvas fills only the free band
  // between the project info on top and the picker below, so the model never sits under text
  useEffect(() => {
    const sec = totem.current;
    if (!sec) return;
    const q = (c: string) => sec.querySelector<HTMLElement>(`.${CSS.escape(c)}`);
    const fit = () => {
      const top = q(s.totemTop);
      const bot = q(s.totemBottom);
      const cv = q(s.totemCanvas);
      if (!top || !bot || !cv) return;
      const R = sec.getBoundingClientRect();
      const a = top.getBoundingClientRect().bottom - R.top + 6;
      const b = Math.max(0, R.bottom - bot.getBoundingClientRect().top + 6);
      const band = Math.max(120, R.height - a - b);
      // the canvas reaches past the band (under the texts) so the swaying, hopping laptop never meets a
      // hard canvas edge; the camera still fits the pair to the band (data-band = band / canvas height)
      const pad = Math.max(0, Math.min(a, b, band * 0.3));
      const h = band + pad * 2;
      // (a canvas doesn't stretch between top/bottom like a div: give it the height explicitly)
      cv.dataset.band = (band / h).toFixed(4);
      cv.style.top = `${Math.round(a - pad)}px`;
      cv.style.height = `${Math.round(h)}px`;
    };
    fit();
    document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(sec);
    return () => ro.disconnect();
  }, []);

  // ------------------------------------------------------------ the about card: project shots fan out from behind the phone
  useEffect(() => {
    const host = burst.current;
    if (!host) return;
    const imgs = Array.from(host.children) as HTMLElement[];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.killTweensOf(imgs);
    if (burstOn) {
      progress.current.flipAt = performance.now();
      const rx = Math.min(innerWidth * 0.42, 560);
      const ry = innerHeight * 0.34;
      imgs.forEach((img, k) => {
        const a = -Math.PI / 2 + ((k - (imgs.length - 1) / 2) / imgs.length) * Math.PI * 1.9;
        gsap.fromTo(
          img,
          { x: -img.offsetWidth / 2, y: -img.offsetHeight / 2, scale: 0.4, rotate: 0, opacity: 0 },
          {
            x: Math.cos(a) * rx - img.offsetWidth / 2,
            y: Math.sin(a) * ry - img.offsetHeight / 2 + ry * 0.15,
            scale: 1,
            rotate: (k % 2 ? 1 : -1) * (6 + (k % 3) * 4),
            opacity: 1,
            duration: reduced ? 0 : 0.9,
            delay: reduced ? 0 : k * 0.05,
            ease: "back.out(1.6)",
          },
        );
        if (!reduced) gsap.to(img, { y: `+=${10 + (k % 3) * 6}`, duration: 2.4 + k * 0.2, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1 + k * 0.05 });
      });
    } else {
      gsap.killTweensOf(imgs);
      gsap.to(imgs, { x: (_: number, el: HTMLElement) => -el.offsetWidth / 2, y: (_: number, el: HTMLElement) => -el.offsetHeight / 2, scale: 0.4, rotate: 0, opacity: 0, duration: 0.5, ease: "power3.in", stagger: 0.02 });
    }
  }, [burstOn]);

  // ------------------------------------------------------------ standing still for 30 s → a gentle bounce reminds you to scroll
  useEffect(() => {
    const P = progress.current;
    let nudgedAt = -1;
    const id = setInterval(() => {
      const lenis = window.__lenis;
      if (!lenis || document.hidden || document.documentElement.dataset.intro !== "done") return;
      if ((document.activeElement as HTMLElement | null)?.closest("input, textarea")) return;
      const y = scrollY;
      if (y > document.documentElement.scrollHeight - innerHeight * 1.6) return;
      if (performance.now() - P.lastScrollAt < 30_000 || nudgedAt === y) return;
      nudgedAt = y;
      setIdle((v) => v + 1);
      lenis.scrollTo(y + 150, {
        duration: 0.55,
        easing: (t: number) => 1 - (1 - t) ** 3,
        onComplete: () => lenis.scrollTo(y, { duration: 1, easing: (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2 }),
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ------------------------------------------------------------ back from a case study: land on its row, then morph home
  useEffect(() => {
    let back: string | null = null;
    let home: { y: number; at: number } | null = null;
    try {
      back = sessionStorage.getItem(BACK_KEY);
      home = JSON.parse(sessionStorage.getItem(HOME_KEY) || "null");
      sessionStorage.removeItem(HOME_KEY);
    } catch {}
    // came back (browser back, header arrow, logo…) from a project opened here: same place as before
    if (!back && home && window.__ctBooted && Date.now() - home.at < 30 * 60_000) {
      const y = home.y;
      const go = () => (window.__lenis ? window.__lenis.scrollTo(y, { immediate: true, force: true }) : scrollTo(0, y));
      let r1 = requestAnimationFrame(() => (r1 = requestAnimationFrame(go)));
      const again = setTimeout(go, 320); // once more after late layout (fonts, images)
      return () => {
        cancelAnimationFrame(r1);
        clearTimeout(again);
      };
    }
    if (!back) return;
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        try {
          sessionStorage.removeItem(BACK_KEY);
        } catch {}
        const target = document.querySelector<HTMLElement>(`[data-morph="${back}"]`);
        if (!target) return;
        // where the visitor was when they opened it, else that project's row
        const y = home && Date.now() - home.at < 30 * 60_000 ? home.y : target.getBoundingClientRect().top + scrollY - innerHeight * 0.4;
        if (window.__lenis) window.__lenis.scrollTo(y, { immediate: true, force: true });
        else scrollTo(0, y);
        requestAnimationFrame(() => dispatchEvent(new CustomEvent("wheel:ready", { detail: back })));
      });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const openProject = useCallback(
    (p: StoryProject, from: HTMLElement | null) => {
      const href = `/${locale}/work/${p.slug}`;
      router.prefetch(href);
      rememberHome(p.slug);
      sfx("whoosh");
      if (!from || matchMedia("(prefers-reduced-motion: reduce)").matches) return router.push(href);
      // the picture already on screen (decoded): a bigger one would decode mid-flight and stutter
      // (phones: the case hero shows the site's phone layout, so the window opens on that one)
      const pic = innerWidth <= 768 && p.mobile ? p.mobile : (from as HTMLImageElement).currentSrc || p.cover;
      morphTo(from, [pic, p.cover], () => router.push(href, { scroll: true }));
    },
    [locale, router],
  );

  // a card tapped in the hero spiral (deck.tsx works out which) opens its project, flying from the card
  useEffect(() => {
    const onPick = (e: Event) => {
      const { index, rect } = (e as CustomEvent<{ index: number; rect: { left: number; top: number; width: number; height: number } }>).detail;
      const p = projects[index];
      if (!p) return;
      sfx("tap");
      const ghost = document.createElement("div");
      Object.assign(ghost.style, { position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: "14px", pointerEvents: "none" });
      document.body.appendChild(ghost);
      openProject(p, ghost);
      setTimeout(() => ghost.remove(), 50);
    };
    addEventListener("deck:pick", onPick);
    return () => removeEventListener("deck:pick", onPick);
  }, [projects, openProject]);

  const heroLetters = useMemo(() => {
    let i = 0;
    return "Claudio Taras".split(" ").map((w, wi) => (
      <span key={wi} style={{ whiteSpace: "nowrap" }}>
        {wi > 0 ? <span className={s.space} /> : null}
        {[...w].map((ch) => (
          <span key={i} className={s.letter} style={{ animationDelay: `${i++ * 45}ms` }}>
            {ch}
          </span>
        ))}
      </span>
    ));
  }, []);

  const acceptWords = useMemo(() => {
    let i = 0;
    return st.accept.title.map((line, li) => (
      <span key={li} style={{ display: "block" }}>
        {line.split(" ").map((w, wi) => (
          <span key={wi}>
            <span className={s.word} style={{ ["--i" as string]: i++ } as CSSProperties}>
              {w}
            </span>{" "}
          </span>
        ))}
      </span>
    ));
  }, [st.accept.title]);

  const sel = featured[pick] ?? featured[0];
  const step = (d: number) => {
    sfx("tap");
    setPick((v) => (v + d + featured.length) % featured.length);
  };
  const ig = socials.find((x) => /instagram/i.test(x.label));

  return (
    <div ref={root} className={s.page}>
      {/* ============================================================ fixed layers */}
      <div className={s.atmos} aria-hidden />
      <Ink progress={progress} className={s.inkCanvas} />
      <div className={s.clock} aria-hidden data-live-ignore>
        <div className={s.clockNum}>
          {[0, 1, 2].map((g) => (
            <span key={g} className={s.clockGroup}>
              {g > 0 ? <span className={s.clockColon}>:</span> : null}
              <span className={s.clockDigit} ref={(e) => void (clockDigits.current[g * 2] = e)} />
              <span className={s.clockDigit} ref={(e) => void (clockDigits.current[g * 2 + 1] = e)} />
            </span>
          ))}
        </div>
      </div>

      <div ref={burst} className={s.burst} aria-hidden>
        {featured.slice(0, 8).map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={p.slug} src={p.cover} alt="" loading="lazy" decoding="async" />
        ))}
      </div>

      <div className={s.phone} aria-hidden>
        <div className={s.phoneBody}>
          <div className={s.phoneScreen}>
            <span className={s.island} />
            <div className={s.status}>
              <span>9:41</span>
              <span>● ● ▮</span>
            </div>
            <div className={s.appBar}>
              <LogoMark size={22} />
              Claudio Taras
            </div>
            <div className={s.phoneActions}>
              <span className={s.roundBtn}>✕</span>
              <span className={s.timerPill}>
                <span ref={timerText} data-live-ignore>23:59:59</span>
              </span>
              <span className={`${s.roundBtn} ${s.roundBtnOn}`}>✓</span>
            </div>
            <div className={s.tabBar}>
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </div>

      <Deck cards={deckCards} hero={aboutCard} progress={progress} className={s.deck} />

      <button ref={cardHit} type="button" className={s.cardHit} aria-label={`${st.card.title} — ${st.card.kicker}`} onClick={() => {
          sfx("swipe");
          dispatchEvent(new Event("app:next"));
          setBurstOn((v) => !v);
          // the HTML card turns once (the WebGL one does the same while it is showing)
          const inner = aboutDom.current?.firstElementChild as HTMLElement | null;
          if (inner && !matchMedia("(prefers-reduced-motion: reduce)").matches)
            inner.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(360deg)" }], { duration: 950, easing: "cubic-bezier(.65,0,.25,1)" });
        }}
      />
      <span className={s.tapHint} aria-hidden>
        {st.accept.hint}
      </span>

      {/* the about card once it sits in the phone: real text, always sharp (geometry = cards.ts paintAbout) */}
      <div ref={aboutDom} className={s.aboutCard} aria-hidden>
        <div className={s.acInner}>
          <div className={s.acFront}>
            <span className={s.acWash} />
            <span className={s.acAvatar}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {portrait ? <img src={portrait} alt="" /> : <LogoMark className={s.acMark} />}
            </span>
            <p className={s.acKicker}>{st.card.kicker}</p>
            <p className={s.acName}>{st.card.title}</p>
            <p className={s.acRole}>{st.card.role}</p>
            <span className={s.acRule} />
            <p className={s.acBody}>{fill(st.card.body, age, years)}</p>
            <dl className={s.acFacts}>
              {aboutCard.chips.slice(0, 3).map((c) => {
                const [k, v] = c.split("|");
                return (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                );
              })}
            </dl>
            <p className={s.acFoot}>{st.card.footer}</p>
          </div>
          <div className={s.acBack}>
            <LogoMark className={s.acBackMark} />
          </div>
        </div>
        <StepsApp copy={st.app} onClass={s.aboutOn} />
      </div>

      <div className={s.sheetClip}>
        <div className={s.modal}>
          <span className={s.handle} />
          <p className={s.mHead}>{st.voice.modalTitle}</p>
          <p className={s.mSub}>{st.voice.modalSub}</p>
          <div className={s.mStage} aria-hidden>
            <Equalizer />
          </div>
          <p className={s.mCaption}>{st.voice.caption}</p>
          <div className={s.mPills} role="radiogroup" aria-label={st.voice.modalTitle}>
            {st.voice.pills.map((p, k) => (
              <button key={p} type="button" role="radio" aria-checked={service === k} className={`${s.mPill} ${service === k ? s.mPillOn : ""}`} onClick={() => setService(k)}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={s.accept} aria-hidden>
        <div className={`${s.colontitle} ${s.colontitleFixed}`}>
          <span>{st.accept.label}</span>
        </div>
        <p className={`${s.serif} ${s.acceptHead}`}>{acceptWords}</p>
        <span className={s.acceptDivider} />
        <div className={s.acceptBody}>
          <p className={s.acceptLead}>{st.accept.lead}</p>
          <p className={s.acceptPara}>{st.accept.body}</p>
        </div>
      </div>

      {/* ============================================================ hero */}
      <section ref={hero} className={s.hero} aria-label="Claudio Taras">
        <nav className={s.nav}>
          <a href={`/${locale}`} className={s.logo} aria-label="Claudio Taras" data-intro="logo">
            <LogoMark className={s.logoMark} />
            <span className={s.logoText}>
              Claudio Taras
              <small>{dict.hero.role}</small>
            </span>
          </a>
          <div className={s.navRight}>
            <div className={s.lang}>
              <button type="button" className={s.langBtn} data-intro="lang" aria-expanded={lang} aria-label={dict.nav.language} onClick={() => setLang((v) => !v)}>
                <Flag locale={locale} className={s.flag} />
                {locale}
              </button>
              {lang ? (
                <ul className={s.langList}>
                  {detected ? <li className={s.langNote}>📍 {st.detected}</li> : null}
                  {locales.map((l) => (
                    <li key={l}>
                      <LangLink locale={l} current={locale} onDone={() => setLang(false)}>
                        <Flag locale={l} className={s.flag} />
                        {localeNames[l]}
                        <span>{l === detected ? "📍" : l}</span>
                      </LangLink>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <a href="#contact" data-magnetic className={s.cta} data-label={st.footer.label} data-intro="cta">
              {dict.hero.cta}
            </a>
          </div>
        </nav>
        <h1 ref={headline} data-intro="title" className={`${s.serif} ${s.headline} ${lettersOn ? s.lettersOn : ""}`} aria-label={`Claudio Taras — ${dict.hero.portfolio} · ${dict.hero.role}`}>
          {/* masthead over the name: says what this page is, spans exactly the width of the name */}
          <span className={s.heroMeta} aria-hidden>
            <span className={s.hmLabel}>{dict.hero.portfolio}</span>
            <i className={s.hmRule} />
            <span className={s.hmWhat}>{dict.hero.what}</span>
            <i className={`${s.hmRule} ${s.hmRule2}`} />
            <span className={s.hmYears}>
              {thisYear - years}–{thisYear}
            </span>
          </span>
          {heroLetters}
        </h1>
        <span className={s.dragHint} aria-hidden>
          <i />
          {dict.work.drag}
        </span>
        <div className={s.heroFoot}>
          <p className={s.hfLine}>
            {dict.hero.line1} <em>{dict.hero.line2}</em>
          </p>
          <p className={s.hfTime}>
            <span className={s.hfDot} />
            Sardinia · {dict.hero.localTime} <b ref={localTime} data-live-ignore>--:--</b>
          </p>
          <span className={s.hfScroll} aria-hidden>
            {dict.hero.scroll}
            <i />
          </span>
        </div>
      </section>

      {/* ============================================================ 01 problem */}
      <section className={s.problem} data-in="problem" aria-label={st.problem.label}>
        <div className={s.colontitle}>
          <span>{st.problem.label}</span>
        </div>
        <div className={s.problemInner}>
          <h2 ref={problemHead} className={`${s.serif} ${s.problemHead}`}>
            {st.problem.lines.map((l, k) => (
              <span key={k} className={s.problemLine} style={{ marginLeft: `${PROBLEM_ML[k]}vw` }}>
                {l}
              </span>
            ))}
          </h2>
          <p className={s.problemBody}>{st.problem.body}</p>
        </div>
      </section>

      <section className={s.bridge} aria-hidden />
      <section className={s.acceptSpace} aria-label={st.accept.label}>
        <h2 className="sr-only">{st.accept.title.join(" ")}</h2>
        <p className="sr-only">
          {st.accept.lead} {st.accept.body} {fill(st.card.body, age, years)}
        </p>
      </section>

      {/* ============================================================ 03 journey: every project */}
      <section ref={journey} id="work" className={s.journey} aria-label={st.journey.label}>
        <div className={s.colontitle}>
          <span>{st.journey.label}</span>
        </div>
        <div className={s.journeyInner} data-in="journey">
          <h2 className={`${s.serif} ${s.jHead}`}>
            <span className={s.jHeadLine}>
              {st.journey.title1[0]} <Crest images={projects.map((p) => p.cover)} /> {st.journey.title1[1]}
            </span>
            <span className={s.jHeadLine}>{st.journey.title2}</span>
          </h2>
          <p className={s.jSub}>{st.journey.sub}</p>
          <div ref={rows} className={s.jList}>
            {projects.map((p, k) => (
              <div
                key={p.slug}
                className={s.row}
                role="link"
                tabIndex={0}
                data-cursor={st.totem.view}
                onClick={(e) => openProject(p, (e.currentTarget as HTMLElement).querySelector("[data-photo]"))}
                onKeyDown={(e) => e.key === "Enter" && openProject(p, (e.currentTarget as HTMLElement).querySelector("[data-photo]"))}
              >
                <div className={s.rowLeft}>
                  <div>
                    <p className={s.rowLabel}>
                      {p.category} · {p.year}
                      {p.wip ? (
                        <span className={s.wipTag}>
                          <i /> {p.wip}
                        </span>
                      ) : null}
                    </p>
                    <p className={s.rowTitle}>{p.name}</p>
                  </div>
                  <p className={s.rowNum}>{pad2(k + 1)}</p>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img data-photo data-bend data-morph={p.slug} className={s.rowPhoto} src={p.cover} alt="" loading="lazy" decoding="async" />
                <p className={s.rowDesc}>{p.tagline}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ 04 voice: services */}
      <section ref={voice} id="services" className={s.voice} style={{ height: "150vh" }} aria-label={st.voice.label}>
        <div className={s.voiceSticky} style={{ position: "sticky", top: 0 }}>
          <div className={s.colontitle} style={{ opacity: "clamp(0, calc((var(--vreveal, 0) - 0.75) / 0.2), 1)" }}>
            <span>{st.voice.label}</span>
          </div>
          <p className={`${s.serif} ${s.colL}`}>
            {st.voice.left.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </p>
          <p className={`${s.serif} ${s.colR}`}>
            {st.voice.right.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </p>
          <span className={s.voiceDivider} />
          <p className={s.bodyL}>{st.voice.bodyL}</p>
          <p className={s.bodyR}>{st.voice.bodyR}</p>
        </div>
      </section>

      {/* ============================================================ 05 showcase (3D) */}
      <section
        ref={totem}
        className={s.totem}
        aria-label={st.totem.label}
        data-cursor="arrows"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button, a")) return;
          const r = e.currentTarget.getBoundingClientRect();
          step(e.clientX < r.left + r.width / 2 ? -1 : 1);
        }}
      >
        <div className={s.totemBackdrop} />
        <div className={s.colontitle}>
          <span>{st.totem.label}</span>
        </div>
        <Showcase items={showItems} index={pick} className={s.totemCanvas} />
        <div className={s.totemTop}>
          <div key={`l${pick}`} className={s.projInfo} aria-live="polite">
            <p className={s.projMeta}>
              {sel?.category} · {sel?.year}
            </p>
            <p className={s.projName}>{sel?.name}</p>
            <p className={s.oneLiner}>{sel?.tagline}</p>
          </div>
          <div className={s.projNav}>
            <button type="button" data-magnetic className={s.projArrow} onClick={() => step(-1)} aria-label="←">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M19 12H5m6-6-6 6 6 6" />
              </svg>
            </button>
            <span className={s.projCount}>
              {pad2(pick + 1)} <i>/</i> {pad2(featured.length)}
            </span>
            <button type="button" data-magnetic className={s.projArrow} onClick={() => step(1)} aria-label="→">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
        <span className={s.totemDivider} />
        <div className={s.totemBottom}>
          <h2 className={`${s.serif} ${s.totemTitle}`}>
            {st.totem.title.map((l, k) => (
              <span key={k} style={{ display: "block" }}>
                {l.replace("{n}", String(projects.length))}
              </span>
            ))}
          </h2>
          <div className={s.selector}>
            <p className={s.pitch}>{st.totem.pitch}</p>
            <div className={s.pills} role="tablist" aria-label={st.totem.label}>
              {featured.map((p, k) => (
                <button key={p.slug} type="button" role="tab" aria-selected={k === pick} className={`${s.pill} ${k === pick ? s.pillOn : ""}`} onClick={() => {
                    sfx("tap");
                    setPick(k);
                  }}
                >
                  {p.name.replace(/^(Gelateria|L'|Il)\s*/i, "").split(" ")[0]}
                </button>
              ))}
            </div>
            <div className={s.openRow}>
              {/* phones: the arrows sit by the button, under the thumb */}
              <button type="button" className={`${s.projArrow} ${s.arrowM}`} onClick={() => step(-1)} aria-label="←">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M19 12H5m6-6-6 6 6 6" />
                </svg>
              </button>
              {sel ? (
                <a data-magnetic className={s.openLink} onClick={() => rememberHome(sel.slug)} href={`/${locale}/work/${sel.slug}`} data-label={sel.name}>
                  {st.totem.view} ↗
                </a>
              ) : null}
              <button type="button" className={`${s.projArrow} ${s.arrowM}`} onClick={() => step(1)} aria-label="→">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ 06 stats */}
      <section className={s.stats} data-in="stats" aria-label={st.stats.label}>
        <div className={s.colontitle}>
          <span>{st.stats.label}</span>
        </div>
        <div className={s.statsTop}>
          <h2 className={`${s.serif} ${s.statsHead}`}>
            {st.stats.title.map((l, k) => (
              <span key={k} className={s.mask} style={{ display: "block" }}>
                <span className={s.statsLine}>{l}</span>
              </span>
            ))}
          </h2>
          <p className={s.statsBody}>{st.stats.body}</p>
        </div>
        <div ref={statsRing} className={s.statsRing}>
          {faces && statsNear ? (
            <WarpCarousel
              cards={stats}
              background="#dfe5ec"
              font={faces.sans}
              numeralFont={faces.serif}
              warp={0.32}
              interval={3.4}
              step={1}
              index={statIdx}
              onIndexChange={setStatIdx}
              scrollDrive={narrow ? 1 / 300 : 1 / 420}
              zoom={narrow ? 1.32 : 1}
              ariaLabel={st.stats.label}
              style={{ position: "absolute", inset: 0 }}
            />
          ) : null}
        </div>
        {/* four tabs: the card that faces you is lit; a tap turns the ring to another one */}
        <div className={s.statTabs} role="tablist" aria-label={st.stats.label}>
          {stats.map((c, k) => (
            <button
              key={c.image}
              type="button"
              role="tab"
              aria-selected={((statIdx % 4) + 4) % 4 === k}
              className={((statIdx % 4) + 4) % 4 === k ? s.statTabOn : undefined}
              onClick={() => {
                sfx("tick");
                setStatIdx(k);
              }}
            >
              <b>
                {c.value}
                {c.unit ?? ""}
              </b>
              <span>{c.title.replace(/\n/g, " ")}</span>
            </button>
          ))}
        </div>
        <ul className="sr-only">
          {stats.map((c) => (
            <li key={c.image}>
              {c.title.replace(/\n/g, " ")}: {c.value}
              {c.unit ?? ""} — {c.footer}
            </li>
          ))}
        </ul>
      </section>

      {/* ============================================================ 07 clients wheel */}
      <section ref={guilds} className={s.guilds} data-in="guilds" aria-label={st.guilds.label}>
        <div className={s.colontitle}>
          <span>{st.guilds.label}</span>
        </div>
        <span className={s.gDrag} aria-hidden>
          ↔ {st.guilds.drag}
        </span>
        <div ref={wheel} className={s.wheel} aria-hidden>
          {projects.map((p, k) => {
            const ang = (k * 360) / projects.length;
            return (
              <div key={p.slug} className={s.spoke} style={{ transform: `rotate(${ang}deg)` }}>
                <div
                  className={s.crestItem}
                  style={{ transform: `translate(-50%, -50%) rotate(calc(${-ang}deg + var(--g8rot, 0) * 40deg - var(--wspin, 0deg)))` }}
                >
                  <div className={s.crestFace} style={{ background: p.logo ? p.accent : "#ddd" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className={p.logo ? s.crestLogo : undefined} src={p.logo || p.cover} alt="" loading="lazy" decoding="async" draggable={false} />
                  </div>
                  <span className={s.crestName}>{p.name}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className={s.shader}>
          <div className={s.sb1} />
          <div className={s.sb2} />
          <div className={s.shaderGrad} />
        </div>
        <div className={s.cover} />
        <p className={s.gKicker}>{st.guilds.kicker}</p>
        <div ref={guildTitle} className={s.gHeadWrap}>
          <h2 className={`${s.serif} ${s.gHead}`}>
            <Letters lines={st.guilds.head} cls={s.gLetter} />
          </h2>
        </div>
        <div className={s.gLeadStack}>
          <p className={`${s.serif} ${s.gLead}`}>
            <Letters lines={st.guilds.lead} cls={s.gLeadLetter} />
          </p>
          <p className={s.gBody}>{st.guilds.body}</p>
        </div>
      </section>

      {/* ============================================================ 08 contact */}
      <footer ref={footer} id="contact" className={s.footer} data-in="footer" aria-label={st.footer.label}>
        <div className={s.glow} />
        <div className={s.footTop}>
          <span>{st.footer.label}</span>
        </div>
        <Seal text={`Claudio Taras • ${dict.hero.role} • `} />
        <p className={s.fLead}>
          {st.footer.lead.split(" ").map((w, k) => (
            <span key={k} className={s.fw} style={{ animationDelay: `${0.2 + k * 0.04}s` }}>
              {w + " "}
            </span>
          ))}
        </p>
        <p className={s.fPitch}>{st.footer.pitch}</p>
        <div className={s.formZone} style={{ padding: 0 }}>
          <ContactFlow dict={dict} locale={locale} preset={preset} availability={availability} />
        </div>
        <div className={s.fContacts}>
          {contacts.map((c) => (
            <Masked key={c.code} c={c} eye={{ show: dict.footer.show, hide: dict.footer.hide }} />
          ))}
        </div>
        <div className={s.fBottom}>
          <span>{dict.footer.made}</span>
          <span aria-hidden />
          <span style={{ justifySelf: "end", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            {ig ? (
              <a href={ig.url} target="_blank" rel="noreferrer">
                Instagram ↗
              </a>
            ) : null}
            <button type="button" onClick={openWa} style={{ border: 0, background: "none", font: "inherit", color: "inherit", cursor: "pointer", padding: 0 }}>
              WhatsApp ↗
            </button>
          </span>
        </div>
      </footer>

      <div ref={pill} className={s.waitPill} data-kb-hide>
        <span className={s.pillMark} aria-hidden>
          <LogoMark size={34} />
        </span>
        <PillLang locale={locale} detected={detected} note={st.detected} label={dict.nav.language} />
        <a href="#contact" data-magnetic className={s.pillBtn} data-label={st.footer.label} onClick={() => sfx("tap")}>
          {dict.work.letsTalk}
        </a>
        <SoundButton labels={st.sound} />
        <button type="button" data-magnetic className={`${s.pillWa} ${wa ? s.pillWaOpen : ""}`} onClick={openWa} aria-label={st.whatsapp.title}>
          <WaIcon />
        </button>
      </div>
      {wa ? <WaComposer dict={dict} phone={whatsapp} from={wa.from} onClose={() => setWa(null)} /> : null}
      {idle ? (
        <span key={idle} className={s.idleHint}>
          ↓ {st.idle}
        </span>
      ) : null}
    </div>
  );
}

/** Lines of serif capitals split into letters carrying an index (--i) for staggered CSS reveals. */
function Letters({ lines, cls }: { lines: string[]; cls: string }) {
  // indices are normalised to 0..36 so long translations still finish their reveal
  const total = Math.max(1, lines.join("").replace(/ /g, "").length - 1);
  let i = 0;
  return (
    <>
      {lines.map((line, li) => (
        <span key={li} style={{ display: "block" }}>
          {line.split(" ").map((w, wi, ws) => (
            <span key={wi} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
              {[...w].map((ch, ci) => (
                <span key={ci} className={cls} style={{ ["--i" as string]: ((i++ / total) * 36).toFixed(2) } as CSSProperties}>
                  {ch}
                </span>
              ))}
              {wi < ws.length - 1 ? <span style={{ display: "inline-block", width: "0.26em" }} /> : null}
            </span>
          ))}
        </span>
      ))}
    </>
  );
}

/** Inline crest in a headline, flipping through project screens. */
function Crest({ images }: { images: string[] }) {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (images.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setK((v) => (v + 1) % images.length), 1400);
    return () => clearInterval(id);
  }, [images.length]);
  return (
    <span className={s.crest} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={k} src={images[k]} alt="" />
    </span>
  );
}

/** The voice modal's "listening" visual: bars breathing at different speeds (paused while hidden). */
function Equalizer() {
  return (
    <div className={s.eq}>
      {Array.from({ length: 21 }).map((_, k) => (
        <i
          key={k}
          style={{
            height: `${((10 + 50 * Math.abs(Math.sin(k * 0.7))) / 80) * 100}%`,
            animationDuration: `${0.9 + (k % 4) * 0.25}s`,
            background: k % 5 === 2 ? "#ff8a5c" : undefined,
          }}
        />
      ))}
    </div>
  );
}

/** Contact seal: the CT. mark inside a slowly turning ring of type; it leans towards the pointer. */
function Seal({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = `seal${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  useEffect(() => {
    const el = ref.current!;
    if (!matchMedia("(hover: hover)").matches) return;
    let r: DOMRect | null = null;
    const measure = () => (r = el.getBoundingClientRect());
    const move = (e: PointerEvent) => {
      if (!r) measure();
      const x = (e.clientX - (r!.left + r!.width / 2)) / innerWidth;
      el.style.rotate = `${(x * 12).toFixed(2)}deg`;
    };
    const reset = () => (r = null);
    addEventListener("pointermove", move, { passive: true });
    addEventListener("scroll", reset, { passive: true });
    addEventListener("resize", reset);
    return () => {
      removeEventListener("pointermove", move);
      removeEventListener("scroll", reset);
      removeEventListener("resize", reset);
    };
  }, []);
  // the phrase repeated until it wraps the circle once
  const ring = text.repeat(Math.max(1, Math.ceil(64 / text.length)));
  return (
    <div ref={ref} className={s.tile} aria-hidden style={{ transition: "rotate .6s cubic-bezier(.22,1,.36,1), opacity .15s, transform .55s cubic-bezier(.22,1,.36,1) .15s" }}>
      <svg className={s.sealRing} viewBox="0 0 200 200">
        <defs>
          <path id={id} d="M100,100 m-80,0 a80,80 0 1,1 160,0 a80,80 0 1,1 -160,0" />
        </defs>
        <text>
          <textPath href={`#${id}`} textLength={Math.round(2 * Math.PI * 80 - 6)} lengthAdjust="spacing">
            {ring}
          </textPath>
        </text>
      </svg>
      <LogoMark className={s.sealMark} />
    </div>
  );
}

/** Big arrow that follows the pointer over the showcase: left half = previous, right half = next. */
