"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import type { Dictionary } from "@/lib/dict";
import type { Locale } from "@/lib/i18n";
import { sfx } from "@/lib/sound";
import { LogoMark } from "./logo";
import { PillLang, SoundButton } from "@/components/story/pill-controls";
import { WaComposer, WaIcon } from "@/components/story/contact-flow";
import s from "@/components/story/story.module.css";
import v from "./cta-pill.module.css";

/**
 * The floating call-to-action pill of the home page (logo · language · Let's talk · sound · WhatsApp),
 * on every other page too. The home page keeps its own copy (its scroll engine themes it).
 */
export function CtaPill({ dict, locale, whatsapp }: { dict: Dictionary; locale: Locale; whatsapp: string }) {
  const path = usePathname() ?? "";
  const [wa, setWa] = useState<{ from: DOMRect | null } | null>(null);
  const st = dict.story;
  // not on the home page (it has its own) nor on the contact page (that page is the contact)
  if (/^\/[a-z]{2}\/?$/.test(path) || /\/contact\/?$/.test(path)) return null;
  const onContact = /\/contact\/?$/.test(path);
  return (
    <div className={v.vars}>
      <div className={`${s.waitPill} ${s.waitPillOn} ${s.waitPillLight}`}>
        <a href={`/${locale}`} className={s.pillMark} aria-label="Claudio Taras">
          <LogoMark size={34} />
        </a>
        <PillLang locale={locale} detected={null} note={st.detected} label={dict.nav.language} />
        <a href={onContact ? "#main" : `/${locale}/contact`} data-magnetic className={s.pillBtn} data-label={st.footer.label} onClick={() => sfx("tap")}>
          {dict.work.letsTalk}
        </a>
        <SoundButton labels={st.sound} />
        <button
          type="button"
          data-magnetic
          className={`${s.pillWa} ${wa ? s.pillWaOpen : ""}`}
          onClick={(e) => setWa({ from: e.currentTarget.getBoundingClientRect() })}
          aria-label={st.whatsapp.title}
        >
          <WaIcon />
        </button>
      </div>
      {wa ? <WaComposer dict={dict} phone={whatsapp} from={wa.from} onClose={() => setWa(null)} /> : null}
    </div>
  );
}
