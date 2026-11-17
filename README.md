# Claudio Taras — Portfolio

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · GSAP · Lenis · three.js (WebGL) · Web Audio · 6 języków (PL, IT, EN, ES, DE, FR) · panel admina · bot Telegram z AI.

## Start

```bash
npm install
npm run dev
```

- Strona: http://localhost:3100 (przekierowuje na język przeglądarki, np. `/pl`).
- Panel: http://localhost:3100/admin (hasło: `ADMIN_PASSWORD` w `.env.local`).
- **Podłączenie AI, Telegrama, bazy, e-maili i publikacja: [SETUP.md](SETUP.md)**. Status na żywo: panel → Połączenia.

## Strona główna (`src/components/story/`)

Jedna długa, przewijana opowieść. Silnik w `story.tsx` liczy postęp przewijania (Lenis) i zapisuje zmienne CSS tylko na elementach, które ich używają, i tylko gdy się zmienią. Wszystko działa na kompozytorze, bez przebudowy Reacta w trakcie przewijania.

| Sekcja | Co się dzieje |
|---|---|
| Preloader (`site/preloader.tsx`) | edytor kodu pisze `hero.tsx`, linijki „teleportują się” w logo, język, przycisk i tytuł |
| Hero | „Portfolio — strony · sklepy · aplikacje — lata”, nazwisko na całą szerokość, spirala kart projektów w WebGL (`deck.tsx`), można ją kręcić |
| Problem → 24 h | jedna karta wychodzi ze spirali, odwraca się i ląduje w telefonie jako karta „o mnie” (ostra kopia w HTML), atramentowe odsłonięcie (`ink.tsx`) i zegar |
| Projekty | lista wszystkich projektów; zdjęcia podążają za kursorem, klik płynnie otwiera case study |
| Usługi | arkusz w telefonie z korektorem i wyborem usługi |
| Galeria 3D (`showcase.tsx`) | laptop i telefon z Blendera (`public/models/devices.glb`, źródło `.capture/blender/devices.blend`), odbicia ze studia z Blendera (`studio.hdr`), wypalone cienie i AO klawiatury; przy wejściu otwiera się klapa, telefon wstaje, ekrany się włączają; zmiana projektu to sprężysty obrót w kierunku nawigacji |
| Liczby (`balls.tsx`) | kulki z fizyką wpadają do kolumn i liczą lata, projekty, języki, godziny |
| Klienci | koło z logotypami (przeciągnij), litery nagłówka przechodzą w kolejny |
| Kontakt (`contact-flow.tsx`) | pieczęć z logo, 4 krótkie pytania, zapis w panelu + Telegram + e-mail |
| Pasek na dole | logo, język, „Pogadajmy”, muzyka (`lib/sound.ts`, generowana na żywo), WhatsApp |

Case study: `/[lang]/work/[slug]`. Przejścia między stronami (`site/page-transition.tsx`): trzy płynne warstwy (pomarańcz, grafit, papier) z falującą krawędzią, potem nazwa celu.

## Panel admina (`src/app/admin/`)

- **Pulpit**: odwiedziny, nowe zapytania, **„Dodaj projekt automatycznie”** (link albo folder, np. `F:\Pizzeria`): w tle `scripts/import/run.mjs` uruchamia projekt, nagrywa filmy desktop + telefon, robi zrzuty, wycina logo, pisze teksty w 6 językach (AI) i opcjonalnie publikuje na `*.vercel.app`. Działa lokalnie.
- **Projekty**: teksty w 6 językach, kolejność, wyróżnienie, kolor, technologie, liczby; ✨ teksty AI, 🌐 tłumaczenie, „↻ Odśwież automatycznie”, strony na hasło.
- **Wiadomości**: zapytania z formularza, notatki, odpowiedź e-mailem (AI poprawia i tłumaczy na język klienta).
- **Statystyki**: bez cookies i bez IP.
- **Teksty strony**: każdy napis w 6 językach.
- **Ustawienia**: kontakt, zdjęcie, bio, dostępność.
- **Połączenia**: status bazy, bota, AI, głosówek, e-maili i domeny na żywo, z instrukcją i przyciskami testowymi.

Bot Telegram (`src/lib/bot/`): polecenia tekstem i głosem, plan + ✅ przed każdą zmianą, „Cofnij”, odpowiedzi klientom, statystyki, import projektów. Opis: [TELEGRAM.md](TELEGRAM.md).

## Dane

- Domyślnie lokalnie: `.data/db.json` (tworzony z `src/lib/seed`), statystyki w `.data/views.json`.
- Z `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`: tabele z `supabase/schema.sql` i `supabase/migrations/`. Przeniesienie danych: `npm run db:push`.

## Polecenia

```bash
npm run setup        # kreator: klucze AI, Telegram, Supabase, e-maile (sprawdza każdy na żywo)
npm run dev:all      # strona + bot Telegram razem
npm run dev          # sama strona + panel na :3100
npm run build        # wersja produkcyjna
npm run typecheck    # sprawdzenie typów
npm run bot:dev      # bot Telegram lokalnie (drugi terminal)
npm run bot:webhook  # bot na opublikowanej stronie
npm run db:push      # .data → Supabase
```

## Media (filmy, zrzuty, logo)

```bash
node scripts/capture2.mjs <slug> <url>          # płynne nagranie sekcja po sekcji (desktop + telefon) + zrzuty
node scripts/extra-shots.mjs <slug> <url> ...   # dodatkowe ekrany → shots/eNN.webp
node scripts/case-extras.mjs <slug> <url>       # logo z nagłówka + podstrony z menu
node scripts/logo-file.mjs <slug> <url-logo>    # logo prosto z pliku strony
.capture/pyenv/Scripts/python.exe scripts/logo_tone.py <slug>   # logo-light/dark.png
python scripts/clips.py [slug ...]              # krótkie pętle „Jak to działa”
.capture/pyenv/Scripts/python.exe scripts/sheet.py <slug>       # arkusz kontrolny zrzutów
```

Środowisko Pythona (Pillow + NumPy) tworzysz raz: `python -m venv .capture/pyenv && .capture/pyenv/Scripts/pip install pillow numpy`.
Wideo: VP9 WebM + MP4 dla Safari, ładowane dopiero przy zbliżeniu do ekranu.
