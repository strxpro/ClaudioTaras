import { NextResponse } from "next/server";
import { isLocale, type Locale } from "@/lib/i18n";
import { storyProps } from "@/lib/story-props";

/** The home story's data for another language — the in-place language switch swaps it in without a reload. */
export async function GET(req: Request) {
  const locale = new URL(req.url).searchParams.get("locale") ?? "";
  if (!isLocale(locale)) return NextResponse.json({ error: "locale" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { settings, ...props } = await storyProps(locale as Locale);
  return NextResponse.json(props, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" } });
}
