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

  if (isLocale(first)) {
    const res = NextResponse.next();
    res.cookies.set("ct_locale", first, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    return remember(res);
  }

  const saved = request.cookies.get("ct_locale")?.value;
  // 1) the visitor's own earlier choice, 2) geolocation from the hosting edge, 3) browser language
  const locale = isLocale(saved) ? saved : (localeFromCountry(country) ?? pickLocale(request.headers.get("accept-language")));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return remember(NextResponse.redirect(url));
}

export const config = {
  matcher: ["/((?!api|_next|media|uploads|favicon|icon|apple-icon|opengraph-image|robots.txt|sitemap.xml|.*\\..*).*)"],
};
