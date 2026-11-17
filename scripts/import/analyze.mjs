// Reads a running website and returns plain facts about it: name, description, sections, navigation,
// detected features (booking, shop, menu, gallery, map, languages…), tech stack, accent colour,
// location and year. No AI here — the facts feed scripts/import/write.mjs.
import { chromium } from "playwright";
import { unlock } from "../lib/gate.mjs";

const DECLINE = /^(rifiuta|reject|decline|solo (necessari|essenziali|tecnici)|only (necessary|essential)|essenziali|odrzuć|refuser|rechazar|nega)/i;

/** Feature rules: a feature counts when its pattern matches the page text, links or markup. */
const FEATURES = [
  ["booking", /prenot|reserv|book(ing| now| a table)|rezerw|termin|disponibilit|check-?in/i],
  ["ordering", /ordina(re)? online|order online|zamów online|asporto|delivery|consegna|takeaway|pedido/i],
  ["ecommerce", /carrello|add to cart|aggiungi al carrello|koszyk|checkout|cart\b|warenkorb|panier|carrito/i],
  ["menu", /\bmen[uù]\b|la carta|carta dei|our menu|il nostro menu/i],
  ["gallery", /galleri|gallery|galeria|galerie|foto\b|photos/i],
  ["reviews", /recensioni|reviews|opinie|bewertungen|avis|reseñas|tripadvisor/i],
  ["events", /eventi|events|wydarzen|veranstaltung|événements|eventos|calendar|calendario/i],
  ["blog", /\bblog\b|news|notizie|aktualno|actualités|noticias/i],
  ["newsletter", /newsletter|iscriviti|subscribe|zapisz się/i],
  ["voting", /\bvot[ao]\b|votazion|vote\b|głosuj|głosowanie/i],
  ["login", /accedi|login|log in|sign in|zaloguj|anmelden|connexion|area riservata|dashboard/i],
];

export async function analyze(url, { local = false } = {}) {
  const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "it-IT" });
  const page = await ctx.newPage();
  const requests = new Set();
  page.on("request", (r) => {
    try {
      requests.add(new URL(r.url()).hostname);
    } catch {}
  });
  const res = await page.goto(url, { waitUntil: "load", timeout: 120000 }).catch(() => null);
  const headers = res ? res.headers() : {};
  await unlock(page);
  await page.waitForTimeout(5000);
  for (const b of await page.$$("button, [role=button], a")) {
    const t = ((await b.innerText().catch(() => "")) || "").trim();
    if (t && DECLINE.test(t) && (await b.isVisible().catch(() => false))) {
      await b.click({ timeout: 1500 }).catch(() => {});
      break;
    }
  }
  // walk the page once so lazy sections render
  await page
    .evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 500) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      scrollTo(0, 0);
    })
    .catch(() => {});
  await page.waitForTimeout(1200);

  const raw = await page.evaluate(() => {
    const meta = (n) => document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.getAttribute("content")?.trim() || "";
    const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    const headings = [...document.querySelectorAll("h1, h2, h3")].filter(vis).map((h) => clean(h.textContent)).filter((t) => t && t.length < 140);
    const nav = [...document.querySelectorAll("header a, nav a")].map((a) => clean(a.textContent)).filter((t) => t && t.length < 40);
    const buttons = [...document.querySelectorAll("button, a[class*='btn' i], a[class*='button' i]")].filter(vis).map((b) => clean(b.textContent)).filter((t) => t && t.length < 40);
    const text = clean(document.body.innerText).slice(0, 6000);
    const links = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") || "");
    const forms = [...document.querySelectorAll("form")].map((f) => [...f.querySelectorAll("input, textarea, select")].map((i) => i.getAttribute("type") || i.tagName.toLowerCase()));
    const html = document.documentElement.outerHTML;
    // structured data: address + business type
    let locality = "";
    let ldType = "";
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const walk = (o) => {
          if (!o || typeof o !== "object") return;
          if (Array.isArray(o)) return o.forEach(walk);
          if (!ldType && typeof o["@type"] === "string" && o["@type"] !== "WebSite" && o["@type"] !== "WebPage") ldType = o["@type"];
          if (!locality && o.address && typeof o.address === "object") locality = o.address.addressLocality || "";
          Object.values(o).forEach(walk);
        };
        walk(JSON.parse(s.textContent || ""));
      } catch {}
    }
    // accent: the most common saturated colour on buttons / links / highlighted text
    const counts = new Map();
    const take = (c, w) => {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
      if (!m || (m[4] !== undefined && Number(m[4]) < 0.6)) return;
      const [r, g, b] = [+m[1], +m[2], +m[3]];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 60 || max < 70) return; // greys / near-black
      const key = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      counts.set(key, (counts.get(key) || 0) + w);
    };
    for (const el of document.querySelectorAll("a, button, [class*='btn' i], h1, h2, header *")) {
      if (!vis(el)) continue;
      const cs = getComputedStyle(el);
      take(cs.backgroundColor, 3);
      take(cs.color, 1);
    }
    const accent = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || meta("theme-color") || "";
    const years = [...text.matchAll(/(?:©|copyright)\s*(?:\d{4}\s*[-–]\s*)?(20\d\d)/gi)].map((m) => +m[1]);
    const g = window;
    const tech = {
      next: !!(g.__NEXT_DATA__ || g.__next_f || document.querySelector("script[src*='/_next/']")),
      nuxt: !!g.__NUXT__,
      astro: !!document.querySelector("astro-island, [data-astro-cid], [class*='astro-']") || /data-astro-/.test(html.slice(0, 200000)),
      wordpress: /wp-content|wp-includes/.test(html),
      shopify: !!g.Shopify,
      wix: /wixstatic|_wix/.test(html),
      squarespace: /squarespace/.test(html),
      webflow: !!document.documentElement.getAttribute("data-wf-page"),
      react: [...document.querySelectorAll("body *")].slice(0, 400).some((el) => Object.keys(el).some((k) => k.startsWith("__react"))),
      vue: !!document.querySelector("[data-v-app]") || !!g.__VUE__,
      svelte: !!document.querySelector("[class*='svelte-']"),
      tailwind: document.querySelectorAll("[class*='px-'], [class*='md:'], [class*='text-['], [class*='bg-[']").length > 25,
      gsap: !!g.gsap,
      scrolltrigger: !!g.ScrollTrigger,
      lenis: document.documentElement.classList.contains("lenis") || !!g.lenis,
      three: !!g.__THREE__,
      webgl: [...document.querySelectorAll("canvas")].some((c) => c.width > 200 && c.height > 150),
      lottie: !!document.querySelector("lottie-player, dotlottie-player") || !!g.lottie,
      swiper: !!document.querySelector(".swiper, swiper-container") || !!g.Swiper,
      leaflet: !!g.L?.map,
      gmaps: !!document.querySelector("iframe[src*='google.com/maps'], iframe[src*='maps.google']") || !!g.google?.maps,
      videoBg: [...document.querySelectorAll("video")].some((v) => v.autoplay || v.muted),
      pwa: !!document.querySelector("link[rel='manifest']"),
      jsonld: !!document.querySelector('script[type="application/ld+json"]'),
    };
    const hreflangs = [...new Set([...document.querySelectorAll("link[rel='alternate'][hreflang]")].map((l) => l.getAttribute("hreflang")).filter((h) => h && h !== "x-default"))];
    const flagLangs = [...new Set(links.map((h) => h.match(/^\/(it|en|de|fr|es|pl|nl|ru)(\/|$)/i)?.[1]?.toLowerCase()).filter(Boolean))];
    return {
      title: clean(document.title),
      description: meta("description") || meta("og:description"),
      siteName: meta("og:site_name"),
      lang: document.documentElement.lang || "",
      headings: [...new Set(headings)].slice(0, 30),
      nav: [...new Set(nav)].slice(0, 16),
      buttons: [...new Set(buttons)].slice(0, 20),
      text,
      links: links.slice(0, 400),
      forms,
      locality,
      ldType,
      accent,
      year: years.length ? Math.max(...years) : 0,
      tech,
      languages: hreflangs.length ? hreflangs : flagLangs,
      hasCountdown: /\b\d{1,3}\s*:\s*\d{2}\s*:\s*\d{2}\b/.test(text) || !!document.querySelector("[class*='countdown' i]"),
    };
  });
  await browser.close();

  const hay = [raw.text, raw.nav.join(" "), raw.buttons.join(" "), raw.headings.join(" "), raw.links.join(" ")].join(" \n ");
  const features = new Set(FEATURES.filter(([, re]) => re.test(hay)).map(([k]) => k));
  const inputs = raw.forms.flat();
  if (inputs.includes("date") || inputs.includes("datetime-local")) features.add("booking");
  if (raw.forms.some((f) => f.includes("email") && f.includes("textarea"))) features.add("contactForm");
  if (raw.links.some((h) => /wa\.me|whatsapp/i.test(h))) features.add("whatsapp");
  if (raw.tech.gmaps || raw.tech.leaflet) features.add("map");
  if (raw.languages.length > 1) features.add("multilingual");
  if (raw.tech.gsap || raw.tech.lenis || raw.tech.lottie) features.add("animations");
  if (raw.tech.three || raw.tech.webgl) features.add("threeD");
  if (raw.tech.videoBg) features.add("video");
  if (raw.tech.pwa) features.add("pwa");
  if (raw.hasCountdown) features.add("countdown");
  if ([...requests].some((h) => /stripe|paypal|satispay|nexi|sumup/.test(h))) features.add("payments");
  if (raw.tech.jsonld) features.add("seo");
  // "events" and "blog" match too easily on restaurant sites — keep them only with a nav entry
  for (const k of ["events", "blog", "login"]) if (features.has(k) && !FEATURES.find(([n]) => n === k)[1].test(raw.nav.join(" ") + raw.buttons.join(" "))) features.delete(k);

  const host = [...requests];
  const stack = [];
  const t = raw.tech;
  if (t.next) stack.push("Next.js");
  if (t.nuxt) stack.push("Nuxt");
  if (t.astro) stack.push("Astro");
  if (t.react && !t.next) stack.push("React");
  if (t.vue && !t.nuxt) stack.push("Vue");
  if (t.svelte) stack.push("Svelte");
  if (t.wordpress) stack.push("WordPress");
  if (t.shopify) stack.push("Shopify");
  if (t.wix) stack.push("Wix");
  if (t.squarespace) stack.push("Squarespace");
  if (t.webflow) stack.push("Webflow");
  if (t.tailwind) stack.push("Tailwind CSS");
  if (t.gsap) stack.push(t.scrolltrigger ? "GSAP ScrollTrigger" : "GSAP");
  if (t.lenis) stack.push("Lenis");
  if (t.three) stack.push("Three.js");
  else if (t.webgl) stack.push("WebGL");
  if (t.lottie) stack.push("Lottie");
  if (t.swiper) stack.push("Swiper");
  if (t.leaflet) stack.push("Leaflet");
  if (host.some((h) => h.endsWith("supabase.co"))) stack.push("Supabase");
  if (host.some((h) => /stripe/.test(h))) stack.push("Stripe");
  if (headers["x-vercel-id"] || host.some((h) => h.endsWith("vercel-insights.com") || h.endsWith("vercel.app"))) stack.push("Vercel");
  else if (headers["x-nf-request-id"]) stack.push("Netlify");
  else if (headers["cf-ray"]) stack.push("Cloudflare");
  if (host.some((h) => /googletagmanager|google-analytics/.test(h))) stack.push("Google Analytics");

  const name = pickName(raw);
  return {
    url,
    local,
    name,
    title: raw.title,
    description: raw.description,
    lang: raw.lang,
    headings: raw.headings,
    nav: raw.nav,
    buttons: raw.buttons,
    text: raw.text.slice(0, 3500),
    location: raw.locality || guessLocation(`${raw.title}. ${raw.description}`),
    businessType: raw.ldType,
    accent: /^#[0-9a-f]{6}$/i.test(raw.accent) ? raw.accent : "#2B2DF5",
    year: raw.year || new Date().getFullYear(),
    languages: raw.languages,
    features: [...features],
    stack,
  };
}

/** "…nel cuore di Santa Teresa Gallura, Sardegna" → "Santa Teresa Gallura, Sardegna" (prefers "City, Region"). */
function guessLocation(s) {
  const W = "[A-ZÀ-Ý][a-zà-ÿ']+";
  const lead = String.raw`(?:nel cuore di|nel centro di|a due passi da|vicino a|located in|based in|\bin|\ba|\bdi|\bat|\bw|\ben|\bim)\s+`;
  const place = String.raw`(${W}(?:\s+(?:d(?:i|el|ella|ei|e)\s+)?${W}){0,3})(?:,\s*(${W}(?:\s+${W})?))?`;
  const re = new RegExp(lead + place, "g");
  const hits = [...s.matchAll(re)].map((m) => (m[2] ? `${m[1]}, ${m[2]}` : m[1])).filter((h) => !/^(Il|La|Lo|Le|The|Home|Scopri|Benvenut)/.test(h));
  return (hits.find((h) => h.includes(",")) || hits[0] || "").slice(0, 60);
}

/** Site name: og:site_name, else the most "brand-like" part of the <title>. */
function pickName(raw) {
  if (raw.siteName && raw.siteName.length < 50) return raw.siteName;
  const parts = raw.title.split(/\s+[|–—·•-]\s+|\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return raw.headings[0] || "Nowy projekt";
  // the first part that isn't a generic page name ("Home | Villa Dea" → "Villa Dea")
  const generic = /^(home|homepage|start|benvenut[oi]|welcome|strona główna|inicio|accueil)$/i;
  return (parts.find((p) => !generic.test(p)) ?? parts[0]).slice(0, 60);
}
