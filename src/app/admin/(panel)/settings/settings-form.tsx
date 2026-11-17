"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Settings } from "@/lib/types";
import { saveSettings } from "../../actions";
import { Card, Field, LocaleInput, MediaInput, Toggle, inputCls } from "../ui";

export function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const up = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));

  return (
    <div className="grid gap-5 pb-10">
      <Card title="Kontakt i dostępność">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="E-mail (publiczny)">
            <input value={s.email} onChange={(e) => up("email", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Telefony" hint="Na stronie końcówka jest rozmyta; odkrywa się po najechaniu myszą albo kliknięciu oka. Pierwszy numer = WhatsApp.">
            <div className="grid gap-2">
              {(s.phones?.length ? s.phones : [{ label: "PL", number: s.phone }]).map((p, i, all) => (
                <div key={i} className="grid grid-cols-[72px_1fr_auto] gap-2">
                  <input value={p.label} placeholder="PL" onChange={(e) => up("phones", all.map((x, j) => (j === i ? { ...x, label: e.target.value.toUpperCase() } : x)))} className={inputCls} />
                  <input value={p.number} placeholder="+48 …" inputMode="tel" onChange={(e) => up("phones", all.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))} className={inputCls} />
                  <button type="button" onClick={() => up("phones", all.filter((_, j) => j !== i))} className="rounded-lg px-3 text-sm text-ember hover:bg-ember/10" aria-label="Usuń numer">
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => up("phones", [...(s.phones?.length ? s.phones : [{ label: "PL", number: s.phone }]), { label: "", number: "" }])}
                className="justify-self-start rounded-full border border-ink/15 px-3 py-1.5 text-xs"
              >
                + Dodaj numer
              </button>
            </div>
          </Field>
          <Field label="Lokalizacja" hint="Pokazywana w hero, np. „Sardinia · Europe — remote worldwide”">
            <input value={s.location} onChange={(e) => up("location", e.target.value)} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Rok urodzenia">
              <input type="number" value={s.birthYear} onChange={(e) => up("birthYear", Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="Lata doświadczenia">
              <input type="number" value={s.yearsExperience} onChange={(e) => up("yearsExperience", Number(e.target.value))} className={inputCls} />
            </Field>
          </div>
        </div>
        <Toggle checked={s.available} onChange={(v) => up("available", v)} label="Przyjmuję nowe projekty (zielona kropka w nagłówku)" />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Zajęty do (rozmowy od następnego dnia)" hint="Puste = wolny od jutra. Bot ustawia to sam, gdy napiszesz mu np. „jestem zajęty do 20, robię sklep”.">
            <input type="date" value={s.busyUntil ?? ""} onChange={(e) => up("busyUntil", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Nad czym teraz pracujesz" hint="Pokazywane przy statusie w kontakcie, np. „sklep dla piekarni”.">
            <input value={s.busyNote ?? ""} maxLength={200} onChange={(e) => up("busyNote", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Dni na rozmowy">
            <div className="flex flex-wrap gap-1.5">
              {["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"].map((d, i) => {
                const days = s.callDays ?? [1, 2, 3, 4, 5];
                const on = days.includes(i + 1);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => up("callDays", on ? days.filter((x) => x !== i + 1) : [...days, i + 1].sort())}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${on ? "bg-ink text-bone" : "bg-ink/5 text-ink/60"}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Godziny rozmów (czas włoski)" hint="Oddzielone przecinkami, np. 10:00, 12:00, 15:00, 17:00">
            <input
              value={(s.callHours ?? ["10:00", "12:00", "15:00", "17:00"]).join(", ")}
              onChange={(e) => up("callHours", e.target.value.split(/[,\s]+/).filter((h) => /^\d{1,2}:\d{2}$/.test(h)))}
              className={inputCls}
            />
          </Field>
        </div>
      </Card>

      <Card title="O mnie">
        <LocaleInput label="Bio" value={s.bio} onChange={(v) => up("bio", v)} area rows={5} />
        <MediaInput label="Zdjęcie (opcjonalnie — bez zdjęcia pokazuje się interaktywna kula 3D z technologiami)" folder="portrait" value={s.portrait} onChange={(v) => up("portrait", v)} />
      </Card>

      <Card
        title="Social media"
        aside={
          <button type="button" onClick={() => up("socials", [...s.socials, { label: "", url: "" }])} className="rounded-full bg-ink px-3 py-1.5 text-xs text-bone">
            + Dodaj
          </button>
        }
      >
        {s.socials.map((so, i) => (
          <div key={i} className="grid gap-2 md:grid-cols-[160px_1fr_auto]">
            <input value={so.label} placeholder="Nazwa" onChange={(e) => up("socials", s.socials.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={inputCls} />
            <input value={so.url} placeholder="https://…" onChange={(e) => up("socials", s.socials.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} className={inputCls} />
            <button type="button" onClick={() => up("socials", s.socials.filter((_, j) => j !== i))} className="rounded-lg px-3 text-sm text-ember hover:bg-ember/10">
              Usuń
            </button>
          </div>
        ))}
      </Card>

      <div className="flex items-center justify-end gap-4">
        <span className="text-sm text-ink/60" role="status">
          {msg}
        </span>
        <button
          onClick={() =>
            start(async () => {
              const res = await saveSettings(s);
              setMsg(res.error ?? "Zapisano ✓");
              router.refresh();
            })
          }
          disabled={pending}
          className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-bone disabled:opacity-50"
        >
          {pending ? "Zapisywanie…" : "Zapisz ustawienia"}
        </button>
      </div>
    </div>
  );
}
