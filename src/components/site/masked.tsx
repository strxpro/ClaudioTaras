"use client";

import { useState } from "react";
import type { MaskedContact } from "@/lib/masked";
import { Flag } from "./logo";
import s from "./masked.module.css";

const decode = (c: string) => {
  try {
    const b = atob(c.split("").reverse().join(""));
    return decodeURIComponent(escape(b));
  } catch {
    return "";
  }
};

/**
 * A phone number or e-mail whose ending stays blurred until the pointer rests on it or the eye is
 * tapped (phones and touch screens). The real value is decoded only then, and only then is it a link.
 */
export function Masked({ c, eye }: { c: MaskedContact; eye: { show: string; hide: string } }) {
  const [hover, setHover] = useState(false);
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState("");
  const shown = hover || open;
  const reveal = () => {
    if (!full) setFull(decode(c.code));
  };
  const value = full || c.head + c.dummy;
  const tail = full ? full.slice(c.head.length) : c.dummy;
  const href = full ? (c.kind === "tel" ? `tel:${full.replace(/[^\d+]/g, "")}` : `mailto:${full}`) : undefined;
  const flag = c.label === "PL" ? "pl" : c.label === "IT" ? "it" : null;

  return (
    <span
      className={`${s.wrap} ${shown && full ? s.on : ""}`}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        reveal();
        setHover(true);
      }}
      onPointerLeave={() => setHover(false)}
    >
      {flag ? (
        <span className={s.flag} aria-hidden>
          <Flag locale={flag} className={s.flagSvg} />
        </span>
      ) : null}
      <a className={s.value} href={shown ? href : undefined} aria-label={shown && full ? value : undefined} onFocus={reveal}>
        <span>{c.head}</span>
        <span className={s.tail} aria-hidden={!shown}>
          {tail}
        </span>
      </a>
      <button
        type="button"
        className={s.eye}
        aria-label={open ? eye.hide : eye.show}
        aria-pressed={open}
        onClick={() => {
          reveal();
          setOpen((o) => !o);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {open ? null : <path className={s.slash} d="M4 4l16 16" />}
        </svg>
      </button>
    </span>
  );
}
