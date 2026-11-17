"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Dictionary } from "@/lib/dict";
import type { Locale } from "@/lib/i18n";
import { sfx } from "@/lib/sound";
import { DayPicker } from "./day-picker";
import s from "./story.module.css";

/** Line icons for the answer cards (24×24, stroke). */
const ICON: Record<string, string> = {
  web: "M3 5h18v14H3zM3 9h18M6.5 7h.01M9 7h.01",
  shop: "M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2",
  app: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  team: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M17 11a2.5 2.5 0 1 0 0-5M21 20a5 5 0 0 0-4-4.9",
  brand: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z",
  seo: "M4 19V9M10 19V5M16 19v-7M3 21h18M15 6l3-3 3 3M18 3v8",
  yes: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
  maybe: "M12 21a9 9 0 1 0 0-18v18zM12 3a9 9 0 0 1 0 18",
  help: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z",
  fast: "M13 2L4 14h7l-1 8 9-12h-7z",
  month: "M4 5h16v15H4zM4 10h16M8 3v4M16 3v4M8 14h3",
  quarter: "M4 5h16v15H4zM4 10h16M8 3v4M16 3v4M8 14h8M8 17h5",
  calm: "M7 3h10M7 21h10M8 3c0 5 8 6 8 9s-8 4-8 9M16 3c0 5-8 6-8 9s8 4 8 9",
};
const ICONS = [
  ["web", "shop", "app", "team", "brand", "seo"],
  ["yes", "maybe", "help"],
  ["fast", "month", "quarter", "calm"],
];

export type Availability = { available: boolean; busyUntil?: string; busyNote?: string; callDays?: number[]; callHours?: string[] };
type Props = { dict: Dictionary; locale: Locale; preset: number[]; availability?: Availability; compact?: boolean };

/** The next call days: from tomorrow, or the day after "busy until", on the chosen weekdays. */
function callDays(a: Availability, count: number) {
  const days = a.callDays?.length ? a.callDays : [1, 2, 3, 4, 5];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  if (a.busyUntil) {
    const b = new Date(`${a.busyUntil}T12:00:00`);
    b.setDate(b.getDate() + 1);
    if (b > d) d.setTime(b.getTime());
  }
  const out: Date[] = [];
  for (let i = 0; i < 60 && out.length < count; i++) {
    const wd = d.getDay() || 7;
    if (days.includes(wd)) out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * The contact, one question at a time: what you need (multi) → do you have an idea → when →
 * your email (the giant field with the talking bubble). A valid email opens a bottom sheet to add
 * a few lines or a file, then it sends. Single-choice steps move on by themselves; "back" and the
 * progress bar are always there.
 */
export function ContactFlow({ dict, locale, preset, availability, compact }: Props) {
  const fc = compact ? ` ${s.flowCompact}` : "";
  const st = dict.story;
  const c = st.contact;
  const f = st.footer;
  const [step, setStep] = useState(0);
  const [needs, setNeeds] = useState<number[]>(preset);
  const [idea, setIdea] = useState(-1);
  const [time, setTime] = useState(-1);
  const [email, setEmail] = useState("");
  const [sheet, setSheet] = useState(false);
  const [note, setNote] = useState("");
  // phones: after a screen change inside the flow, bring its top back into view (Safari keeps the old
  // scroll offset while the content above changes height, which reads as a jump)
  const box = useRef<HTMLDivElement | null>(null);
  const settle = () =>
    requestAnimationFrame(() => {
      const el = box.current;
      if (!el || !matchMedia("(pointer: coarse)").matches) return;
      const r = el.getBoundingClientRect();
      if (r.top < 60 || r.top > innerHeight * 0.5) window.scrollBy({ top: r.top - 76, behavior: "smooth" });
    });
  // the call slot picked first ("" = no date; null = not decided yet)
  const [when, setWhen] = useState<string | null>(availability ? null : "");
  const [day, setDay] = useState(0);
  const slots = useMemo(() => (availability ? callDays(availability, 40) : []), [availability]);
  const hours = availability?.callHours?.length ? availability.callHours : ["10:00", "12:00", "15:00", "17:00"];
  const dFmt = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }), [locale]);
  const whenLabel = (v: string) => {
    const [dd, hh] = v.split(" ");
    return `${dFmt.format(new Date(`${dd}T12:00:00`))} · ${hh}`;
  };
  // only a real change of step / call slot scrolls (not the mount, nor a repeated effect run —
  // a "first run" flag let StrictMode / remounts pull the page down to the form on load)
  const seen = useRef<string | null>(null);
  useEffect(() => {
    const key = `${when}|${step}`;
    const prev = seen.current;
    seen.current = key;
    if (prev === null || prev === key) return;
    settle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [when, step]);
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  // photos are shrunk in the browser (max 1600 px, JPEG) so several fit in one upload
  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list).slice(0, 6 - files.length);
    const out: { file: File; url: string }[] = [];
    for (const fl of picked) {
      if (fl.type === "application/pdf") {
        if (fl.size > 4 * 1024 * 1024) {
          setErr(c.fileTooBig);
          continue;
        }
        out.push({ file: fl, url: "" });
        continue;
      }
      if (!fl.type.startsWith("image/")) continue;
      const small = await shrink(fl).catch(() => fl);
      out.push({ file: small, url: URL.createObjectURL(small) });
    }
    setFiles((cur) => [...cur, ...out].slice(0, 6));
  };
  // the floating bars step aside while this sheet is open
  useEffect(() => {
    document.documentElement.classList.toggle("sheet-open", sheet);
    return () => document.documentElement.classList.remove("sheet-open");
  }, [sheet]);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState("");
  const [bx, setBx] = useState("50%");
  const input = useRef<HTMLInputElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const valid = EMAIL.test(email.trim());

  useEffect(() => setNeeds((n) => (n.length ? n : preset)), [preset]);

  useEffect(() => {
    if (step === 3) setTimeout(() => input.current?.focus({ preventScroll: true }), 350);
  }, [step]);

  // the bubble rides on the end of what is typed
  useEffect(() => {
    const m = measure.current;
    const i = input.current;
    if (!m || !i) return;
    m.textContent = email || f.placeholder;
    const w = m.offsetWidth;
    const W = i.offsetWidth;
    // a long address shrinks to fit instead of running off the edge
    const base = parseFloat(getComputedStyle(m).fontSize) || 60;
    const k = email ? Math.min(1, (W * 0.94) / Math.max(1, w)) : 1;
    i.style.fontSize = k < 1 ? `${Math.max(20, base * k)}px` : "";
    setBx(`${Math.max(80, Math.min(W - 80, W / 2 + (email ? w / 2 : 0)))}px`);
  }, [email, f.placeholder, step]);

  const go = (to: number) => {
    setErr("");
    setStep(Math.max(0, Math.min(3, to)));
  };
  const pickOne = (set: (v: number) => void, v: number, next: number) => {
    sfx("tap");
    set(v);
    setTimeout(() => go(next), 380);
  };

  const submit = async (withExtras: boolean) => {
    if (state === "sending") return;
    setState("sending");
    const payload = {
      services: needs.map((n) => c.opts1[n]),
      budget: "—",
      timeline: time >= 0 ? c.opts3[time] : "—",
      name: email.split("@")[0],
      email: email.trim(),
      message: [idea >= 0 ? `${c.q2} ${c.opts2[idea]}` : "", withExtras && note.trim() ? note.trim() : f.message].filter(Boolean).join("\n\n"),
      locale,
    };
    const body = new FormData();
    body.set("payload", JSON.stringify(payload));
    if (withExtras) files.forEach((x) => body.append("file", x.file));
    try {
      const res = await fetch("/api/contact", { method: "POST", body });
      if (!res.ok) throw new Error(String(res.status));
      setState("sent");
      sfx("chime");
      setSheet(false);
    } catch (e) {
      setState("error");
      setErr(String(e).includes("413") ? c.fileTooBig : f.bubbles.error);
    }
  };

  const reset = () => {
    setStep(0);
    setIdea(-1);
    setTime(-1);
    setEmail("");
    setNote("");
    files.forEach((x) => x.url && URL.revokeObjectURL(x.url));
    setFiles([]);
    setState("idle");
  };

  const b = f.bubbles;
  const bubble = state === "sent" ? b.sent : state === "sending" ? b.sending : state === "error" ? b.error : !email ? b.idle : valid ? b.valid : b.typing;
  const tilt = ((bubble.length * 7) % 9) - 4;
  // answers as cards: a line icon, the words, and a tick that pops in when chosen
  const options = (list: string[], on: (k: number) => boolean, click: (k: number) => void, multi = false) => (
    <div className={s.optGrid} role={multi ? "group" : "radiogroup"} data-count={list.length}>
      {list.map((o, k) => (
        <button
          key={o}
          type="button"
          role={multi ? "checkbox" : "radio"}
          aria-checked={on(k)}
          className={`${s.optCard} ${on(k) ? s.optCardOn : ""}`}
          style={{ ["--i" as string]: k } as CSSProperties}
          onClick={() => click(k)}
        >
          <span className={s.optIcon} aria-hidden>
            <svg viewBox="0 0 24 24">
              <path d={ICON[ICONS[step]?.[k] ?? "web"]} />
            </svg>
          </span>
          <span className={s.optText}>{o}</span>
          <span className={s.optTick} aria-hidden>
            ✓
          </span>
        </button>
      ))}
    </div>
  );

  if (state === "sent")
    return (
      <div className={`${s.flow} ${s.sentBox} ${s.stepIn}${fc}`} role="status">
        <div className={s.sentIcon}>✓</div>
        <h3 className={`${s.serif} ${s.question}`}>{c.sentTitle}</h3>
        <p style={{ color: "var(--muted)", maxWidth: 420, margin: "0 auto 22px" }}>{c.sentText}</p>
        <button type="button" className={s.backBtn} onClick={reset}>
          ↺ {c.again}
        </button>
      </div>
    );

  const w = c.when;
  // the note is typed once in the admin (in Polish), so other languages get only the dates; a note that
  // just repeats a date ("Zajęty do 19-11") adds nothing next to "free from …"
  const busyNote = availability?.busyNote && locale === "pl" && !/\d{1,2}\s*[.\-‐-–/]\s*\d{1,2}/.test(availability.busyNote) ? availability.busyNote : "";
  const availLine = availability ? (
    <p className={s.avail}>
      <i className={availability.available && !availability.busyUntil ? s.availOk : s.availBusy} />
      {availability.available && !availability.busyUntil
        ? w.free
        : `${busyNote ? w.busy.replace("{note}", busyNote) : ""}${busyNote && slots[0] ? " · " : ""}${slots[0] ? w.busyFrom.replace("{date}", dFmt.format(slots[0])) : ""}`}
    </p>
  ) : null;

  if (when === null)
    return (
      <div ref={box} className={`${s.flow} ${s.stepIn}${fc}`}>
        {availLine}
        <h3 className={`${s.serif} ${s.question}`}>{w.qDate}</h3>
        <p className={s.whenHint}>{w.dateHint}</p>
        <DayPicker slots={slots} day={day} onPick={setDay} locale={locale} labels={w} />
        <div className={s.hours}>
          {hours.map((h, k) => (
            <button key={h} type="button" className={s.hourBtn} style={{ ["--i" as string]: k } as CSSProperties} onClick={() => (sfx("tap"), setWhen(`${ymd(slots[day])} ${h}`))}>
              {h}
            </button>
          ))}
        </div>
        <div className={s.flowNext}>
          <button type="button" className={s.backBtn} onClick={() => setWhen("")}>
            {w.dateSkip} →
          </button>
        </div>
      </div>
    );

  return (
    <div ref={box} className={`${s.flow}${fc}`}>
      {availLine}
      {when ? (
        <button type="button" className={s.whenChip} onClick={() => setWhen(null)}>
          📅 {w.call}: {whenLabel(when)} <span aria-hidden>✎</span>
        </button>
      ) : null}
      <div className={s.progress} aria-hidden>
        {c.steps.map((_, k) => (
          <span key={k} className={step > k || (k === 3 && valid) ? "done" : ""}>
            <i style={{ transform: step > k || (k === 3 && valid) ? "scaleX(1)" : step === k ? "scaleX(0.35)" : undefined }} />
          </span>
        ))}
      </div>
      <div className={s.stepHead}>
        <button type="button" className={s.backBtn} onClick={() => go(step - 1)} disabled={step === 0}>
          ← {c.back}
        </button>
        <span>
          {step + 1} / 4 · {c.steps[step]}
        </span>
      </div>

      <div key={step} className={s.stepIn}>
        {step === 0 ? (
          <>
            <h3 className={`${s.serif} ${s.question}`}>{c.q1}</h3>
            {options(
              c.opts1,
              (k) => needs.includes(k),
              (k) => {
                sfx("tick");
                setNeeds((n) => (n.includes(k) ? n.filter((x) => x !== k) : [...n, k]));
              },
              true,
            )}
            <div className={s.flowNext}>
              <button type="button" className={s.cta} onClick={() => (needs.length ? go(1) : setErr(c.pick))}>
                {c.next} →
              </button>
            </div>
          </>
        ) : null}
        {step === 1 ? (
          <>
            <h3 className={`${s.serif} ${s.question}`}>{c.q2}</h3>
            {options(c.opts2, (k) => idea === k, (k) => pickOne(setIdea, k, 2))}
          </>
        ) : null}
        {step === 2 ? (
          <>
            <h3 className={`${s.serif} ${s.question}`}>{c.q3}</h3>
            {options(c.opts3, (k) => time === k, (k) => pickOne(setTime, k, 3))}
          </>
        ) : null}
        {step === 3 ? (
          <>
            <h3 className={`${s.serif} ${s.question}`} style={{ fontSize: "clamp(22px, 2.4vw, 32px)", fontFamily: "var(--sans)", textTransform: "none", fontWeight: 700 }}>
              {c.q4}
            </h3>
            <form
              className={s.inputWrap}
              style={{ marginTop: 70 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (valid) setSheet(true);
              }}
            >
              <div className={s.field}>
              <span className={s.bubble} style={{ ["--bx" as string]: bx, ["--tilt" as string]: `${tilt}deg` } as CSSProperties} aria-live="polite">
                {bubble}
                {!email ? (
                  <span className={s.dots}>
                    <i />
                    <i />
                    <i />
                  </span>
                ) : null}
              </span>
              <input
                ref={input}
                className={s.emailInput}
                style={email ? undefined : { caretColor: "transparent" }}
                type="email"
                inputMode="email"
                autoComplete="email"
                enterKeyHint="next"
                aria-label={f.placeholder}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (state === "error") setState("idle");
                }}
              />
              {!email ? (
                <span className={s.ph} aria-hidden>
                  {[...f.placeholder].map((ch, k) => (
                    <span key={k} className={s.phL} style={{ animationDelay: `${0.1 + k * 0.03}s` }}>
                      {ch}
                    </span>
                  ))}
                </span>
              ) : null}
              <span className={s.line} />
              <span ref={measure} className={s.serif} style={{ position: "absolute", visibility: "hidden", whiteSpace: "pre", fontSize: "clamp(40px, 6.4vw, 92px)", left: 0, top: 0 }} />
              </div>
              <div className={s.flowNext}>
                <button type="submit" className={s.cta} disabled={!valid} style={{ opacity: valid ? 1 : 0.4 }}>
                  {c.next} →
                </button>
              </div>
            </form>
            <p className={s.fNote} style={{ textAlign: "center", marginTop: 14 }}>
              {f.note}
            </p>
          </>
        ) : null}
      </div>
      <p className={s.flowError} role="alert">
        {err}
      </p>

      {sheet ? (
        <>
          <div className={s.sheetBack} onClick={() => setSheet(false)} />
          <div className={s.sheet} role="dialog" aria-modal="true" aria-label={c.extraTitle}>
            <div className={s.sheetHandle} />
            <h3 className={`${s.serif} ${s.sheetTitle}`}>{c.extraTitle}</h3>
            <textarea className={s.textarea} placeholder={c.extraMsg} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} />
            {files.length ? (
              <div className={s.thumbs}>
                {files.map((x, k) => (
                  <span key={k} className={s.thumb}>
                    {x.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={x.url} alt={x.file.name} />
                    ) : (
                      <b>PDF</b>
                    )}
                    <button
                      type="button"
                      aria-label="✕"
                      onClick={() => {
                        if (x.url) URL.revokeObjectURL(x.url);
                        setFiles((cur) => cur.filter((_, j) => j !== k));
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            {files.length < 6 ? (
              <label className={s.fileBtn}>
                <span aria-hidden>📎</span>
                <span style={{ flex: 1, minWidth: 0 }}>{files.length ? `+ ${c.extraFile}` : c.extraFile}</span>
                <span style={{ opacity: 0.5, fontSize: 12 }}>{files.length}/6</span>
                <input type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => void addFiles(e.target.files).then(() => (e.target.value = ""))} />
              </label>
            ) : null}
            <p className={s.flowError} role="alert">
              {err}
            </p>
            <div className={s.sheetActions}>
              <button type="button" className={s.btnGhost} onClick={() => submit(false)} disabled={state === "sending"}>
                {c.sendPlain}
              </button>
              <button type="button" className={s.btnSolid} onClick={() => submit(true)} disabled={state === "sending"}>
                {state === "sending" ? `${f.bubbles.sending}…` : `${c.send} ↗`}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** WhatsApp: a little composer above the pill; "send" opens WhatsApp with the text ready. */
/**
 * WhatsApp bubble: grows out of the green button it was opened from (a small green blob that turns
 * into the white card), stays above the on-screen keyboard on phones, and sends you to WhatsApp
 * with the message typed in. Closing shrinks it back into the button.
 */
export function WaComposer({ dict, phone, from, onClose }: { dict: Dictionary; phone: string; from?: DOMRect | null; onClose: () => void }) {
  const w = dict.story.whatsapp;
  const [text, setText] = useState("");
  const [lift, setLift] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const closing = useRef(false);

  const morph = (el: HTMLElement, reverse: boolean) => {
    if (!from || matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
    const r = el.getBoundingClientRect();
    const k = Math.max(0.08, from.width / r.width);
    const dx = from.left + from.width / 2 - (r.left + r.width / 2);
    const dy = from.top + from.height / 2 - (r.top + r.height / 2);
    const blob = { transform: `translate(${dx}px, ${dy}px) scale(${k}, ${Math.max(0.08, from.height / r.height)})`, borderRadius: "48%", backgroundColor: "#25d366" };
    const card = { transform: "none", borderRadius: "26px", backgroundColor: "#ffffff" };
    return el.animate(reverse ? [card, blob] : [blob, card], { duration: reverse ? 380 : 560, easing: reverse ? "cubic-bezier(.55,0,.75,.2)" : "cubic-bezier(.22,1,.36,1)", fill: "both" });
  };

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    sfx("tick");
    const el = box.current;
    el?.classList.add(s.waLeaving);
    const a = el ? morph(el, true) : null;
    if (a) a.onfinish = onClose;
    else onClose();
  };

  useEffect(() => {
    const el = box.current!;
    sfx("pop");
    morph(el, false);
    // desktop: start typing right away; phones: wait for a tap (no keyboard jumping up unasked)
    if (matchMedia("(hover: hover) and (pointer: fine)").matches) setTimeout(() => ref.current?.focus({ preventScroll: true }), 300);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", esc);
    // keep the bubble just above the keyboard (iOS doesn't resize the page for it)
    const vv = window.visualViewport;
    const onVV = () => vv && setLift(Math.max(0, Math.round(innerHeight - (vv.offsetTop + vv.height))));
    vv?.addEventListener("resize", onVV);
    vv?.addEventListener("scroll", onVV);
    onVV();
    return () => {
      removeEventListener("keydown", esc);
      vv?.removeEventListener("resize", onVV);
      vv?.removeEventListener("scroll", onVV);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = () => {
    sfx("chime");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent((text.trim() || w.placeholder).trim())}`, "_blank", "noopener");
    close();
  };

  return (
    <>
      <div className={s.waBack} onClick={close} />
      <div
        ref={box}
        data-kb-own
        className={s.wa}
        role="dialog"
        aria-label={w.title}
        style={lift > 40 ? { bottom: `${lift + 12}px`, maxHeight: `calc(100dvh - ${lift + 24}px)` } : undefined}
      >
        <div className={s.waInner}>
          <div className={s.waHead}>
            <span className={s.waDot}>
              <WaIcon />
            </span>
            <span>
              {w.title}
              <small>+{phone.replace(/^(\d{2})(\d{3})(\d{3})(\d+)$/, "$1 $2 $3 $4")}</small>
            </span>
            <button type="button" className={s.waClose} onClick={close} aria-label={w.close}>
              ✕
            </button>
          </div>
          <div className={s.waChat}>
            <p className={s.waIncoming}>{w.greeting}</p>
            <textarea
              ref={ref}
              className={s.waField}
              value={text}
              rows={3}
              placeholder={w.placeholder}
              enterKeyHint="send"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
              }}
            />
          </div>
          <button type="button" className={s.waSend} onClick={send}>
            {w.send}
            <WaIcon size={18} />
          </button>
        </div>
      </div>
    </>
  );
}

export function WaIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.2h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.13c-.24.69-1.42 1.32-1.96 1.4-.5.08-1.13.11-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-3s.75-2.13 1.02-2.42c.26-.29.58-.36.77-.36h.55c.18 0 .42-.07.65.5.24.58.82 2 .89 2.15.07.14.12.31.02.5-.1.19-.14.31-.29.48-.14.17-.3.38-.43.5-.14.14-.29.3-.13.59.17.29.74 1.22 1.58 1.98 1.09.97 2.01 1.27 2.3 1.41.29.14.46.12.63-.07.17-.19.72-.84.91-1.13.19-.29.38-.24.65-.14.26.1 1.69.8 1.98.94.29.14.48.22.55.34.07.12.07.7-.17 1.39Z" />
    </svg>
  );
}

/** Shrink a photo in the browser: longest side 1600 px, JPEG 0.82 (keeps uploads small enough for several). */
async function shrink(file: File): Promise<File> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(bmp.width * k);
  cv.height = Math.round(bmp.height * k);
  cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/jpeg", 0.82));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
