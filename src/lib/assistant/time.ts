/**
 * Claudio's clock: Italian time (Europe/Rome), daylight saving included. Every date the assistant
 * stores is UTC (ISO); everything he reads or says is Rome wall time ("jutro o 10").
 */
export const TZ = "Europe/Rome";

const FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Rome wall clock of an instant: { date: "2026-11-21", time: "20:00", … } */
export function rome(at: Date | number | string = Date.now()) {
  const p = Object.fromEntries(
    FMT.formatToParts(new Date(at))
      .filter((x) => x.type !== "literal")
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** ms to add to UTC to get Rome wall time at that instant (+1 h winter, +2 h summer) */
function offset(t: number) {
  const p = rome(t);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000;
}

/** "2026-11-22" + "10:00" Rome → the real instant */
export function at(date: string, time = "09:00"): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let t = wall - offset(wall);
  t = wall - offset(t); // second pass lands right on the DST change days
  return new Date(t);
}

export const today = () => rome().date;

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function addMonths(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate(); // 31 Jan + 1 month = 28/29 Feb
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday */
export function weekday(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

const DAY = ["", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota", "niedziela"];
const DAY_SHORT = ["", "pon", "wt", "śr", "czw", "pt", "sob", "niedz"];
const MONTH = ["", "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
const DAY_EN = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "sobota 21 listopada" */
export function longDay(date: string) {
  const [, m, d] = date.split("-").map(Number);
  return `${DAY[weekday(date)]} ${d} ${MONTH[m]}`;
}

/** "dziś", "jutro", "pojutrze", "czw 27.11" */
export function dayWord(date: string) {
  const t = today();
  if (date === t) return "dziś";
  if (date === addDays(t, 1)) return "jutro";
  if (date === addDays(t, 2)) return "pojutrze";
  if (date === addDays(t, -1)) return "wczoraj";
  const [, m, d] = date.split("-");
  return `${DAY_SHORT[weekday(date)]} ${d}.${m}`;
}

/** "jutro o 10:00", "czw 27.11 o 15:30", "dziś (cały dzień)" */
export function when(date: string, time?: string) {
  return time ? `${dayWord(date)} o ${time}` : `${dayWord(date)} (cały dzień)`;
}

/** "1 godz.", "15 min", "1 dzień" — how long before something */
export function lead(min: number) {
  if (min % 1440 === 0) return min === 1440 ? "1 dzień" : `${min / 1440} dni`;
  if (min % 60 === 0) return `${min / 60} godz.`;
  if (min > 60) return `${Math.floor(min / 60)} godz. ${min % 60} min`;
  return `${min} min`;
}

/** Two weeks of dates for the model: it is bad at weekday arithmetic, so it reads them off this list. */
export function dateTable(days = 15) {
  const t = today();
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(t, i);
    return `${d} ${DAY_EN[weekday(d)]} (${DAY[weekday(d)]})${i === 0 ? " = TODAY" : i === 1 ? " = tomorrow" : ""}`;
  }).join("\n");
}
