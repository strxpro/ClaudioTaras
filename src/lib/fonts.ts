import { Anton, Archivo, Bricolage_Grotesque, Gilda_Display, Instrument_Serif, Inter, Inter_Tight } from "next/font/google";

/** Admin panel display face (the public site uses the serifs below). */
export const anton = Anton({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  variable: "--font-anton",
  display: "swap",
  preload: false,
});

/** Case pages: tall, high-contrast serif set in capitals. */
export const instrumentSerif = Instrument_Serif({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

/** Home story headlines: a wide, sharp, high-contrast display serif. */
export const gilda = Gilda_Display({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  variable: "--font-gilda",
  display: "swap",
});

/** Home story text and UI. */
export const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

/** Case pages text and UI. */
export const bricolage = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  variable: "--font-bricolage",
  display: "swap",
  preload: false,
});

/** Reading text: bigger, tighter, friendlier than the UI face (home bodies, case pages, works index). */
export const interTight = Inter_Tight({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter-tight",
  display: "swap",
});

/** Bold condensed display grotesk for project names (works index, case titles, menu). */
export const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const fontVars = `${anton.variable} ${instrumentSerif.variable} ${gilda.variable} ${inter.variable} ${bricolage.variable} ${interTight.variable} ${archivo.variable}`;
