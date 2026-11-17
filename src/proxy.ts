import { NextResponse, type NextRequest } from "next/server";
import { isLocale, localeFromCountry, pickLocale } from "@/lib/i18n";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];

  // Admin: cheap presence check here, the real signature check happens on the server.
  if (first === "admin") {
    if (pathname !== "/admin/login" && !request.cookies.get("ct_admin")) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return NextResponse.next();
  }

  const country = request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry") ?? request.headers.get("x-country");
  // remembered for the language picker ("based on your location")
  const remember = (res: NextResponse) => {
    if (country && /^[A-Z]{2}$/i.test(country)) res.cookies.set("ct_country", country.toUpperCase(), { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
    return res;
  };

  if (isLocale(first)) return remember(NextResponse.next());

  // 1) a language the visitor picked by hand earlier, 2) the device's language (browser / phone settings),
  // 3) the country from the hosting edge (geolocation), 4) English
  const saved = request.cookies.get("ct_lang")?.value;
  const device = pickLocale(request.headers.get("accept-language"), null);
  const locale = isLocale(saved) ? saved : (device ?? localeFromCountry(country) ?? "en");
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return remember(NextResponse.redirect(url));
}

export const config = {
  matcher: ["/((?!api|_next|media|uploads|favicon|icon|apple-icon|opengraph-image|robots.txt|sitemap.xml|.*\\..*).*)"],
};
