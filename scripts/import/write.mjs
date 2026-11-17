// Turns the facts from analyze.mjs into portfolio copy in six languages.
// 1) AI writes the copy: Anthropic / Gemini / Groq / Cerebras / OpenRouter / Mistral / Ollama when
//    configured, else the keyless Pollinations — so it works with no setup at all.
// 2) Otherwise — or if the AI fails — built-in templates assemble honest copy from the detected
//    features, so an import never stops on missing AI.
const LANGS = ["en", "pl", "it", "es", "de", "fr"];

/* ----------------------------------------------------------------- templates */

const FEATURE = {
  booking: ["Online booking", "Rezerwacje online", "Prenotazioni online", "Reservas online", "Online-Reservierung", "Réservation en ligne"],
  ordering: ["Online ordering", "Zamówienia online", "Ordini online", "Pedidos online", "Online-Bestellungen", "Commandes en ligne"],
  ecommerce: ["Online shop with cart and checkout", "Sklep online z koszykiem i płatnościami", "Negozio online con carrello e checkout", "Tienda online con carrito y pago", "Onlineshop mit Warenkorb und Checkout", "Boutique en ligne avec panier et paiement"],
  menu: ["Digital menu", "Menu online", "Menù digitale", "Carta digital", "Digitale Speisekarte", "Menu digital"],
  gallery: ["Photo gallery", "Galeria zdjęć", "Galleria fotografica", "Galería de fotos", "Fotogalerie", "Galerie photo"],
  reviews: ["Guest reviews", "Opinie klientów", "Recensioni dei clienti", "Opiniones de clientes", "Kundenbewertungen", "Avis clients"],
  events: ["Events calendar", "Kalendarz wydarzeń", "Calendario eventi", "Calendario de eventos", "Eventkalender", "Agenda des événements"],
  blog: ["News & blog", "Aktualności i blog", "News e blog", "Noticias y blog", "News & Blog", "Actualités et blog"],
  newsletter: ["Newsletter sign-up", "Zapis do newslettera", "Iscrizione alla newsletter", "Suscripción al boletín", "Newsletter-Anmeldung", "Inscription à la newsletter"],
  voting: ["Public voting", "Głosowanie publiczności", "Voto del pubblico", "Votación del público", "Publikumsabstimmung", "Vote du public"],
  login: ["User accounts & dashboard", "Konta użytkowników i panel", "Area riservata e dashboard", "Cuentas de usuario y panel", "Benutzerkonten & Dashboard", "Comptes utilisateurs et tableau de bord"],
  admin: ["Admin panel", "Panel administracyjny", "Pannello di amministrazione", "Panel de administración", "Admin-Panel", "Panneau d'administration"],
  contactForm: ["Contact form", "Formularz kontaktowy", "Modulo di contatto", "Formulario de contacto", "Kontaktformular", "Formulaire de contact"],
  whatsapp: ["WhatsApp chat", "Czat WhatsApp", "Chat WhatsApp", "Chat de WhatsApp", "WhatsApp-Chat", "Chat WhatsApp"],
  map: ["Interactive map", "Interaktywna mapa", "Mappa interattiva", "Mapa interactivo", "Interaktive Karte", "Carte interactive"],
  animations: ["Scroll animations", "Animacje przy przewijaniu", "Animazioni allo scroll", "Animaciones al hacer scroll", "Scroll-Animationen", "Animations au défilement"],
  threeD: ["Interactive 3D", "Interaktywne 3D", "3D interattivo", "3D interactivo", "Interaktives 3D", "3D interactive"],
  video: ["Video hero", "Wideo w nagłówku", "Video in apertura", "Vídeo de portada", "Video-Header", "Vidéo d'accueil"],
  pwa: ["Installable app (PWA)", "Aplikacja do zainstalowania (PWA)", "App installabile (PWA)", "App instalable (PWA)", "Installierbare App (PWA)", "Application installable (PWA)"],
  countdown: ["Live countdown", "Odliczanie na żywo", "Conto alla rovescia live", "Cuenta atrás en directo", "Live-Countdown", "Compte à rebours en direct"],
  payments: ["Online payments", "Płatności online", "Pagamenti online", "Pagos online", "Online-Zahlungen", "Paiements en ligne"],
  seo: ["SEO & structured data", "SEO i dane strukturalne", "SEO e dati strutturati", "SEO y datos estructurados", "SEO & strukturierte Daten", "SEO et données structurées"],
  responsive: ["Mobile-first design", "Projekt mobile-first", "Design mobile-first", "Diseño mobile-first", "Mobile-first-Design", "Design mobile-first"],
};

const MULTI = (n) => ({
  en: `Multilingual (${n} languages)`,
  pl: `Wielojęzyczność (${n} ${n >= 2 && n <= 4 ? "języki" : "języków"})`,
  it: `Multilingue (${n} lingue)`,
  es: `Multilingüe (${n} idiomas)`,
  de: `Mehrsprachig (${n} Sprachen)`,
  fr: `Multilingue (${n} langues)`,
});

const CAT = {
  website: ["website", "strona internetowa", "sito web", "sitio web", "Website", "site web"],
  ecommerce: ["online store", "sklep internetowy", "e-commerce", "tienda online", "Onlineshop", "boutique en ligne"],
  webapp: ["web app", "aplikacja webowa", "web app", "aplicación web", "Web-App", "application web"],
  software: ["software", "oprogramowanie", "software", "software", "Software", "logiciel"],
  event: ["event website", "strona wydarzenia", "sito dell'evento", "web del evento", "Event-Website", "site de l'événement"],
};

const TAGLINE = {
  booking: ["Book in a few taps — no phone calls.", "Rezerwacja w kilka kliknięć — bez telefonów.", "Prenoti in pochi tocchi, senza telefonate.", "Reserva en pocos toques, sin llamadas.", "In wenigen Klicks reserviert – ohne Anrufe.", "Réserver en quelques clics, sans appel."],
  shop: ["From browsing to ordering in seconds.", "Od przeglądania do zamówienia w kilka sekund.", "Dalla vetrina all'ordine in pochi secondi.", "Del catálogo al pedido en segundos.", "Vom Stöbern zur Bestellung in Sekunden.", "De la vitrine à la commande en quelques secondes."],
  event: ["An event that lives online, too.", "Wydarzenie, które żyje także w sieci.", "Un evento che vive anche online.", "Un evento que también vive online.", "Ein Event, das auch online lebt.", "Un événement qui vit aussi en ligne."],
  tool: ["A tool that turns routine into one click.", "Narzędzie, które zamienia rutynę w jedno kliknięcie.", "Uno strumento che trasforma la routine in un clic.", "Una herramienta que convierte la rutina en un clic.", "Ein Tool, das Routine in einen Klick verwandelt.", "Un outil qui transforme la routine en un clic."],
  food: ["Appetite starts on the screen.", "Apetyt zaczyna się na ekranie.", "L'appetito inizia dallo schermo.", "El apetito empieza en la pantalla.", "Der Appetit beginnt am Bildschirm.", "L'appétit commence à l'écran."],
  site: ["A first impression that turns visitors into clients.", "Pierwsze wrażenie, które zamienia odwiedzających w klientów.", "Una prima impressione che trasforma i visitatori in clienti.", "Una primera impresión que convierte visitas en clientes.", "Ein erster Eindruck, der Besucher zu Kunden macht.", "Une première impression qui transforme les visiteurs en clients."],
};

const CHALLENGE = {
  website: ["Stand out online and turn interest into real contacts — on every screen.", "Wyróżnić się w sieci i zamienić zainteresowanie w realne kontakty — na każdym ekranie.", "Distinguersi online e trasformare l'interesse in contatti reali, su ogni schermo.", "Destacar online y convertir el interés en contactos reales, en cualquier pantalla.", "Online herausstechen und Interesse in echte Kontakte verwandeln – auf jedem Bildschirm.", "Se démarquer en ligne et transformer l'intérêt en vrais contacts, sur tous les écrans."],
  ecommerce: ["Make buying simple and fast, with a catalogue that is easy to manage.", "Uprościć i przyspieszyć zakupy, z katalogiem łatwym w zarządzaniu.", "Rendere l'acquisto semplice e veloce, con un catalogo facile da gestire.", "Hacer la compra simple y rápida, con un catálogo fácil de gestionar.", "Einkaufen einfach und schnell machen – mit einem leicht pflegbaren Katalog.", "Rendre l'achat simple et rapide, avec un catalogue facile à gérer."],
  webapp: ["Replace manual, repetitive work with one clear tool.", "Zastąpić ręczną, powtarzalną pracę jednym przejrzystym narzędziem.", "Sostituire il lavoro manuale e ripetitivo con un unico strumento chiaro.", "Sustituir el trabajo manual y repetitivo por una sola herramienta clara.", "Manuelle, wiederkehrende Arbeit durch ein klares Tool ersetzen.", "Remplacer le travail manuel et répétitif par un seul outil clair."],
  event: ["Build anticipation and keep the audience involved before, during and after the event.", "Budować napięcie i angażować publiczność przed, w trakcie i po wydarzeniu.", "Creare attesa e coinvolgere il pubblico prima, durante e dopo l'evento.", "Generar expectación e implicar al público antes, durante y después del evento.", "Vorfreude wecken und das Publikum vor, während und nach dem Event einbinden.", "Créer l'attente et impliquer le public avant, pendant et après l'événement."],
};
CHALLENGE.software = CHALLENGE.webapp;

const SOLUTION = {
  website: ["A custom design with a clear structure, fast loading and calls to action where they matter.", "Autorski projekt z czytelną strukturą, szybkim ładowaniem i wezwaniami do działania tam, gdzie mają znaczenie.", "Un design su misura con struttura chiara, caricamento veloce e call to action dove contano.", "Un diseño a medida con estructura clara, carga rápida y llamadas a la acción donde importan.", "Ein individuelles Design mit klarer Struktur, schnellen Ladezeiten und Calls-to-Action an den richtigen Stellen.", "Un design sur mesure, une structure claire, un chargement rapide et des appels à l'action là où ils comptent."],
  ecommerce: ["A fast storefront with smooth product pages, a simple cart and an easy back office.", "Szybki sklep z płynnymi kartami produktów, prostym koszykiem i wygodnym zapleczem.", "Una vetrina veloce con schede prodotto fluide, carrello semplice e gestione comoda.", "Una tienda rápida con fichas de producto fluidas, carrito simple y gestión cómoda.", "Ein schneller Shop mit flüssigen Produktseiten, einfachem Warenkorb und bequemem Backend.", "Une boutique rapide, des fiches produit fluides, un panier simple et une gestion facile."],
  webapp: ["A focused web app: clear flows, live data and an interface that needs no manual.", "Skupiona aplikacja webowa: jasne ścieżki, dane na żywo i interfejs, który nie wymaga instrukcji.", "Una web app mirata: flussi chiari, dati in tempo reale e un'interfaccia che non richiede manuale.", "Una app web enfocada: flujos claros, datos en vivo y una interfaz que no necesita manual.", "Eine fokussierte Web-App: klare Abläufe, Live-Daten und eine Oberfläche ohne Handbuch.", "Une application web ciblée : parcours clairs, données en direct et une interface sans mode d'emploi."],
  event: ["A bold event site with the programme, live updates and interaction for the audience.", "Wyrazista strona wydarzenia z programem, aktualnościami na żywo i interakcją dla publiczności.", "Un sito evento d'impatto con programma, aggiornamenti live e interazione per il pubblico.", "Una web del evento con carácter: programa, novedades en directo e interacción con el público.", "Eine starke Event-Website mit Programm, Live-Updates und Interaktion fürs Publikum.", "Un site d'événement marquant : programme, actualités en direct et interaction avec le public."],
};
SOLUTION.software = SOLUTION.webapp;

const ROLE = ["Design, development & SEO", "Projekt, development i SEO", "Design, sviluppo e SEO", "Diseño, desarrollo y SEO", "Design, Entwicklung & SEO", "Design, développement et SEO"];
const INSIDE = ["Inside:", "W środku:", "Dentro:", "Incluye:", "Mit dabei:", "Au programme :"];
const FROM = ["from design to launch", "od projektu po wdrożenie", "dal design al lancio", "del diseño al lanzamiento", "vom Design bis zum Launch", "du design au lancement"];
const AND = ["and", "i", "e", "y", "und", "et"];

const l10n = (arr) => Object.fromEntries(LANGS.map((l, i) => [l, arr[i]]));
const lc = (s, l) => (l === "de" || /^(?:[A-Z0-9]{2}|WhatsApp)/.test(s) ? s : s[0].toLowerCase() + s.slice(1));
const join = (items, i) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ${AND[i]} ${items.at(-1)}`);

export function categorize(f) {
  const has = (k) => f.features.includes(k);
  if (f.category) return f.category;
  if (f.software) return "software";
  if (has("ecommerce")) return "ecommerce";
  if (has("voting") || has("countdown") || /event|festival/i.test(f.businessType || "") || /festival|show\b|concert|evento|sagra/i.test(`${f.title} ${f.description}`)) return "event";
  if ((has("login") || has("admin")) && !has("booking") && !has("menu")) return "webapp";
  return "website";
}

/** Copy assembled from the detected facts (always works, no network). */
export function templateCopy(f) {
  const category = categorize(f);
  const has = (k) => f.features.includes(k);
  const keys = ["booking", "ordering", "ecommerce", "menu", "voting", "countdown", "events", "login", "admin", "gallery", "reviews", "map", "whatsapp", "contactForm", "newsletter", "payments", "threeD", "video", "animations", "pwa", "blog"].filter(has);
  const feats = keys.map((k) => l10n(FEATURE[k]));
  if (has("multilingual") && f.languages.length > 1) feats.splice(Math.min(2, feats.length), 0, MULTI(f.languages.length));
  feats.push(l10n(FEATURE.responsive));
  const features = feats.slice(0, 6);
  const listed = features.filter((x) => x.en !== FEATURE.responsive[0]).slice(0, 4);
  const tag = has("booking") ? "booking" : has("ecommerce") || has("ordering") ? "shop" : category === "event" ? "event" : category === "webapp" || category === "software" ? "tool" : has("menu") ? "food" : "site";
  const loc = f.location ? ` (${f.location})` : "";
  const summary = Object.fromEntries(
    LANGS.map((l, i) => {
      const head = `${f.name}${loc}: ${CAT[category][i]} — ${FROM[i]}.`;
      return [l, listed.length ? `${head} ${INSIDE[i]} ${join(listed.map((x) => lc(x[l], l)), i)}.` : head];
    }),
  );
  return {
    name: f.name,
    client: f.name,
    location: f.location || "",
    category,
    tagline: l10n(TAGLINE[tag]),
    summary,
    challenge: l10n(CHALLENGE[category]),
    solution: l10n(SOLUTION[category]),
    role: l10n(ROLE),
    features,
  };
}

/* ----------------------------------------------------------------- AI */

function prompt(f, compact = false) {
  const facts = {
    name: f.name,
    url: f.local ? "(local project, not public)" : f.url,
    title: f.title,
    description: f.description,
    site_language: f.lang,
    location: f.location,
    business_type: f.businessType,
    navigation: f.nav,
    headings: f.headings.slice(0, 20),
    buttons: f.buttons.slice(0, 12),
    detected_features: f.features,
    languages_offered: f.languages,
    tech_stack: f.stack,
    readme: compact ? undefined : f.readme?.slice(0, 1500),
    visible_text_excerpt: compact ? undefined : f.text?.slice(0, 2500),
  };
  if (compact) {
    // the keyless model refuses long prompts: keep only the essentials
    facts.headings = f.headings.slice(0, 6);
    facts.navigation = f.nav.slice(0, 8);
    facts.buttons = f.buttons.slice(0, 6);
  }
  return `You write short portfolio copy for Claudio Taras, a web designer & developer who designed and built this project.
Facts about the project (extracted automatically from the site/code):
${JSON.stringify(facts, null, 1)}

Return ONLY a JSON object with exactly these keys:
{"name": string, "client": string, "location": string, "category": "website"|"ecommerce"|"webapp"|"software"|"event",
 "tagline": L, "summary": L, "challenge": L, "solution": L, "role": L, "features": [L, L, L, L, L]}
where L is an object with keys "en","pl","it","es","de","fr" (all six, natural native phrasing, not word-for-word).
House style (same for every project in the portfolio):
- tagline: max 8 words, punchy, concrete, no clichés, no em-dash chains;
- summary: 2 sentences, max 220 characters; challenge: 1 sentence, max 140; solution: 1 sentence, max 170;
- role: Claudio's role as 2-4 short items joined with " · " (e.g. "Design · Development · SEO");
- features: exactly 4 items, 2-5 words each, things the product really does (from the facts);
- never invent numbers, clients or results; location = city/region only if it is in the facts, else ""; client = the business name.`;
}

async function post(url, headers, body) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const PROVIDERS = [
  {
    id: "anthropic",
    ok: () => process.env.ANTHROPIC_API_KEY,
    run: async (p) => {
      const j = await post("https://api.anthropic.com/v1/messages", { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, {
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
        max_tokens: 4000,
        messages: [{ role: "user", content: p }],
      });
      return j.content?.map((c) => c.text || "").join("");
    },
  },
  {
    id: "gemini",
    ok: () => process.env.GEMINI_API_KEY,
    run: async (p) => {
      const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
      const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { "x-goog-api-key": process.env.GEMINI_API_KEY }, {
        contents: [{ parts: [{ text: p }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.6 },
      });
      return j.candidates?.[0]?.content?.parts?.map((x) => x.text || "").join("");
    },
  },
  {
    id: "groq",
    ok: () => process.env.GROQ_API_KEY,
    run: async (p) => {
      const j = await post("https://api.groq.com/openai/v1/chat/completions", { authorization: `Bearer ${process.env.GROQ_API_KEY}` }, {
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        response_format: { type: "json_object" },
        temperature: 0.6,
        messages: [{ role: "user", content: p }],
      });
      return j.choices?.[0]?.message?.content;
    },
  },
  {
    id: "openrouter",
    ok: () => process.env.OPENROUTER_API_KEY,
    run: async (p) => {
      const j = await post("https://openrouter.ai/api/v1/chat/completions", { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }, {
        model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free",
        messages: [{ role: "user", content: p }],
      });
      return j.choices?.[0]?.message?.content;
    },
  },
  {
    id: "cerebras",
    ok: () => process.env.CEREBRAS_API_KEY,
    run: async (p) => {
      const j = await post("https://api.cerebras.ai/v1/chat/completions", { authorization: `Bearer ${process.env.CEREBRAS_API_KEY}` }, { model: "gpt-oss-120b", messages: [{ role: "user", content: p }] });
      return j.choices?.[0]?.message?.content;
    },
  },
  {
    id: "mistral",
    ok: () => process.env.MISTRAL_API_KEY,
    run: async (p) => {
      const j = await post("https://api.mistral.ai/v1/chat/completions", { authorization: `Bearer ${process.env.MISTRAL_API_KEY}` }, { model: "mistral-small-latest", messages: [{ role: "user", content: p }] });
      return j.choices?.[0]?.message?.content;
    },
  },
  {
    id: "ollama",
    ok: async () => {
      try {
        return (await fetch(`${process.env.OLLAMA_URL || "http://127.0.0.1:11434"}/api/tags`, { signal: AbortSignal.timeout(1500) })).ok;
      } catch {
        return false;
      }
    },
    run: async (p) => {
      const j = await post(`${process.env.OLLAMA_URL || "http://127.0.0.1:11434"}/api/chat`, {}, { model: process.env.OLLAMA_MODEL || "llama3.1", format: "json", stream: false, messages: [{ role: "user", content: p }] });
      return j.message?.content;
    },
  },
  {
    // free, no key — the last resort, so imports always get real copy
    id: "pollinations",
    ok: () => process.env.AI_NO_KEYLESS !== "1",
    run: async (p) => {
      const j = await post("https://text.pollinations.ai/openai", {}, { model: "openai", messages: [{ role: "user", content: p }] });
      return j.choices?.[0]?.message?.content;
    },
  },
];

const isL10n = (v) => v && typeof v === "object" && LANGS.every((l) => typeof v[l] === "string" && v[l].trim());

/** Best available copy: AI when configured (validated field by field), templates otherwise. */
export async function writeCopy(facts, log = () => {}) {
  const base = templateCopy(facts);
  const order = process.env.AI_PROVIDER ? PROVIDERS.filter((p) => p.id === process.env.AI_PROVIDER) : PROVIDERS;
  for (const pr of order) {
    if (!(await pr.ok())) continue;
    try {
      log(`AI: ${pr.id}…`);
      const text = (await pr.run(prompt(facts, pr.id === "pollinations"))) || "";
      const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      const out = { ...base, source: pr.id };
      for (const k of ["tagline", "summary", "challenge", "solution", "role"]) if (isL10n(json[k])) out[k] = json[k];
      const feats = Array.isArray(json.features) ? json.features.filter(isL10n).slice(0, 4) : [];
      if (feats.length >= 3) out.features = feats;
      if (typeof json.name === "string" && json.name.trim() && json.name.length < 60) out.name = json.name.trim();
      if (typeof json.client === "string" && json.client.trim()) out.client = json.client.trim();
      if (typeof json.location === "string" && json.location.length < 60) out.location = json.location.trim() || base.location;
      if (["website", "ecommerce", "webapp", "software", "event"].includes(json.category)) out.category = json.category;
      return out;
    } catch (e) {
      log(`AI ${pr.id} nie odpowiedziało (${String(e.message).slice(0, 120)}) — próbuję dalej`);
    }
  }
  return { ...base, source: "templates" };
}
