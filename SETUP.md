# Jak wszystko podłączyć: AI, Telegram, baza danych, e-maile, publikacja

Wszystkie klucze wpisujesz w jednym pliku: **`.env.local`** w folderze projektu (wzór: `.env.example`).
Po każdej zmianie zrestartuj serwer (`Ctrl+C`, potem `npm run dev`).

**Status na żywo:** panel → **Połączenia** (`http://localhost:3100/admin/connect`). Każda usługa ma tam kolorową kropkę (zielona = działa), listę brakujących linijek do skopiowania, kroki „gdzie kliknąć” i przyciski testowe: e-mail, wiadomość na Telegram, podłączenie webhooka. Po każdym kroku poniżej wejdź tam i kliknij „Sprawdź ponownie”.

## Najszybciej: kreator w terminalu

```bash
npm run setup
```

Kreator pyta po kolei o każdy klucz, od razu sprawdza go w usłudze i zapisuje do `.env.local`. Enter pomija krok albo zostawia obecną wartość.
- **Telegram:** po wklejeniu tokenu napisz do swojego bota `/start`. Kreator sam odczyta Twój numer ID i bot wyśle Ci potwierdzenie.
- **Supabase:** sprawdza klucz i tabele, podaje link do SQL Editor i przenosi dane z komputera.
- **Resend:** sprawdza klucz i domeny, może wysłać testowy e-mail.
- **Panel:** pomaga ustawić hasło i losuje sekret.

Tylko Telegram: `npm run setup:telegram`. Potem uruchom stronę i bota jednym poleceniem:

```bash
npm run dev:all
```

Poniżej te same kroki opisane ręcznie, z linkami, gdzie co kliknąć.

Kolejność jest celowa: każdy krok działa sam, a razem zajmują ok. 45 minut. Wszystko mieści się w darmowych planach.

| Krok | Usługa | Po co | Czas |
|---|---|---|---|
| 1 | Groq | mózg bota, teksty i tłumaczenia w panelu, głosówki | 3 min |
| 2 | Telegram | bot: zapytania, odpowiedzi klientom, zmiany na stronie z telefonu | 5 min |
| 3 | Supabase | baza danych i zdjęcia (wymagana po publikacji) | 10 min |
| 4 | Vercel + domena | strona w internecie | 10 min (+ DNS) |
| 5 | Webhook | bot działa bez Twojego komputera | 1 klik |
| 6 | Resend | e-maile: powiadomienia, „dziękuję” do klienta, Twoje odpowiedzi | 10 min (+ DNS) |

---

## Krok 1. AI: Groq (darmowy)

1. Wejdź na **https://console.groq.com/keys** i zaloguj się (np. kontem Google).
2. **Create API Key** → nazwa „portfolio” → skopiuj klucz (zaczyna się od `gsk_`; pokazuje się tylko raz).
3. W `.env.local`:
   ```
   GROQ_API_KEY=gsk_...
   ```
4. Restart. W panelu → Połączenia: „AI” i „Głosówki” zmienią się na zielone.

Opcjonalnie:
- zapas, gdy Groq jest zajęty (też za darmo): **https://aistudio.google.com/apikey** → `GEMINI_API_KEY=...`;
- najlepsza jakość tekstów (płatne za użycie, zwykle grosze dziennie): **https://console.anthropic.com** → `ANTHROPIC_API_KEY=...`.

Bez żadnego klucza AI też działa (darmowe Pollinations), ale wolno i z przerwami.

## Krok 2. Bot Telegram

1. W Telegramie otwórz **@BotFather** → wyślij `/newbot`.
2. Nazwa: „Claudio Portfolio”. Login musi kończyć się na `_bot`, np. `claudio_portfolio_bot`.
3. BotFather odeśle **token** (`123456789:AA...`). Do `.env.local`:
   ```
   TELEGRAM_BOT_TOKEN=123456789:AA...
   TELEGRAM_WEBHOOK_SECRET=<losowy ciąg: panel → Połączenia → „Wylosuj sekret”>
   ```
4. Uruchom stronę razem z botem (jedno polecenie, `Ctrl+C` zatrzymuje oba):
   ```bash
   npm run dev:all
   ```
5. Napisz do swojego bota `/start`. Odpowie Twoim numerem ID. Dopisz go:
   ```
   ADMIN_TELEGRAM_ID=123456789
   ```
   (kilka osób: `123,456`). Zrestartuj `npm run dev:all`. Kreator `npm run setup:telegram` robi ten krok sam.
6. Panel → Połączenia → „Wyślij test na Telegram”. Powinna przyjść wiadomość „✅ Test z panelu”.

Lokalnie bot działa, dopóki chodzi `npm run dev:all`. Po publikacji (krok 5) działa sam.
Co bot umie i przykłady poleceń: **TELEGRAM.md**.

## Krok 3. Baza danych: Supabase

Lokalnie strona działa bez bazy (plik `.data/db.json`). Na Vercelu pliki nie są trwałe, więc **przed publikacją** potrzebna jest Supabase.

1. **https://supabase.com/dashboard** → **New project**:
   - nazwa: `portfolio`;
   - region: **Frankfurt (eu-central-1)**, najbliżej Polski i Włoch;
   - hasło bazy: wygeneruj i zapisz w menedżerze haseł (aplikacja go nie potrzebuje).
2. Po ok. minucie: lewe menu → **SQL Editor** → **New query**:
   1. wklej całą zawartość pliku `supabase/schema.sql` → **Run** (tabele projektów, wiadomości, ustawień + magazyn zdjęć „media”);
   2. nowe zapytanie: wklej `supabase/migrations/20261106_analytics_realtime.sql` → **Run** (statystyki odwiedzin).
3. **Project Settings → API Keys**:
   - **Project URL** (`https://xxxx.supabase.co`) → `SUPABASE_URL`;
   - zakładka **Legacy API keys** → klucz **service_role** (sekretny, zaczyna się od `eyJ`) → `SUPABASE_SERVICE_ROLE_KEY`.

   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```
   Klucza service_role nie wklejaj nigdzie poza `.env.local` i Vercelem: daje pełny dostęp do bazy.
4. Restart, potem przenieś obecne projekty, wiadomości i ustawienia (można powtarzać, niczego nie kasuje):
   ```bash
   npm run db:push
   ```
5. Panel → Połączenia → „Baza danych” na zielono, z liczbą projektów i wiadomości. Pod logo panelu zobaczysz „Panel · Supabase”.

Darmowy projekt Supabase usypia się po ok. tygodniu bez żadnego ruchu. Wtedy w panelu Supabase klikasz „Restore”. Przy odwiedzinach na stronie to się nie zdarza.

## Krok 4. Publikacja: Vercel + domena

1. **https://vercel.com/new** → zaloguj się (np. przez GitHub).
2. Wgraj projekt jednym ze sposobów:
   - z GitHuba (polecane: każda zmiana publikuje się sama): projekt musi być w repozytorium; daj znać, przygotuję commit i wypchnę go;
   - albo z terminala, w folderze projektu: `npx vercel` (pierwszy raz zapyta o login i nazwę), produkcyjnie: `npx vercel --prod`.
3. Vercel → projekt → **Settings → Environment Variables** → **Import .env** i wskaż plik `.env.local`. Albo wklej zmienne ręcznie (lista na dole tej instrukcji).
4. **Settings → Domains** → dodaj swoją domenę i ustaw u jej dostawcy rekordy DNS, które pokaże Vercel.
5. Ustaw adres strony (w Vercelu i w `.env.local`):
   ```
   NEXT_PUBLIC_SITE_URL=https://twojadomena.pl
   ```
   Zmień też hasło panelu `ADMIN_PASSWORD` na własne, mocne. `ADMIN_SECRET` to 32+ losowe znaki (przycisk „Wylosuj sekret”).
6. **Deployments → Redeploy**, żeby nowe zmienne weszły w życie.

Uwagi:
- folder `public/media` (filmy i zrzuty projektów) ma ok. 150 MB. Jeśli Vercel zgłosi za duży rozmiar wgrywanej paczki, daj znać: przeniosę media do magazynu Supabase;
- automatyczny import projektów (nagrywanie filmów i zrzutów) działa tylko na Twoim komputerze, bo na Vercelu nie ma przeglądarki do nagrywania.

## Krok 5. Bot na stałe (webhook)

Gdy strona działa pod `https://twojadomena.pl` i ma w Vercelu zmienne z kroku 2:
- **Panel na opublikowanej stronie → Połączenia → „Podłącz webhook”**,
- albo z komputera: `npm run bot:webhook`.

Od teraz Telegram wysyła wiadomości prosto do strony, a komputer może być wyłączony.
Uwaga: `npm run bot:dev` odłącza webhook. Po lokalnych testach podłącz go z powrotem.

## Krok 6. E-maile: Resend

Trzy rodzaje wiadomości, wszystkie w Twoim szablonie z logo:
- do Ciebie: nowe zapytanie z załącznikami;
- do klienta od razu: „Dziękuję, odezwę się w ciągu 24 godzin”, w jego języku;
- do klienta: Twoja odpowiedź z panelu albo z Telegrama.

1. **https://resend.com** → Sign up.
2. **Domains → Add domain** → wpisz swoją domenę → dodaj u dostawcy domeny rekordy DNS (TXT/MX/CNAME), które pokaże Resend → **Verify**. Zwykle trwa to kilka minut, czasem do kilku godzin.
3. **API Keys → Create API key** (wystarczy „Sending access”) → skopiuj (`re_...`).
4. Do `.env.local` i Vercela:
   ```
   RESEND_API_KEY=re_...
   NOTIFY_EMAIL=twoj-adres@gmail.com
   NOTIFY_FROM=Claudio Taras <ciao@twojadomena.pl>
   ```
   `NOTIFY_EMAIL` to skrzynka, na którą przychodzą zapytania. `NOTIFY_FROM` to nadawca z **zweryfikowanej** domeny.
5. Panel → Połączenia → „Wyślij testowy e-mail”.

Dopóki domena nie jest zweryfikowana, Resend wysyła tylko na adres, którym założyłeś konto.

---

## Wszystkie zmienne w jednym miejscu

| Zmienna | Skąd | Lokalnie | Vercel |
|---|---|---|---|
| `ADMIN_PASSWORD` | wymyślasz | ✓ | ✓ |
| `ADMIN_SECRET` | losowe 32+ znaków | ✓ | ✓ |
| `NEXT_PUBLIC_SITE_URL` | Twoja domena (https) | – | ✓ |
| `GROQ_API_KEY` | console.groq.com | ✓ | ✓ |
| `GEMINI_API_KEY` | aistudio.google.com (opcjonalnie) | ✓ | ✓ |
| `ANTHROPIC_API_KEY` | console.anthropic.com (opcjonalnie) | ✓ | ✓ |
| `TELEGRAM_BOT_TOKEN` | @BotFather | ✓ | ✓ |
| `TELEGRAM_WEBHOOK_SECRET` | losowy ciąg | ✓ | ✓ |
| `ADMIN_TELEGRAM_ID` | bot po `/start` | ✓ | ✓ |
| `SUPABASE_URL` | Supabase → API Keys | opcjonalnie | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Legacy API keys | opcjonalnie | ✓ |
| `RESEND_API_KEY` | resend.com | opcjonalnie | ✓ |
| `NOTIFY_EMAIL` | Twoja skrzynka | opcjonalnie | ✓ |
| `NOTIFY_FROM` | nadawca z Twojej domeny | opcjonalnie | ✓ |

## Gdy coś nie działa

| Objaw | Rozwiązanie |
|---|---|
| Bot milczy lokalnie | Czy chodzi `npm run dev:all` (w logu linia `[bot] @… słucha`)? Czy `ADMIN_TELEGRAM_ID` to Twój numer? (`npm run setup:telegram` ustawi go sam) |
| Bot milczy po publikacji | Panel → Połączenia → „Podłącz webhook”. Jeśli Telegram zgłasza błąd, jest on pokazany przy bocie. |
| „Baza danych: zły klucz” | Wklejony klucz `anon` zamiast `service_role`. |
| „Baza danych: brak tabel” | Nie uruchomiono `supabase/schema.sql` w SQL Editor. |
| E-mail nie przychodzi | Sprawdź spam. Domena w Resend musi mieć status „Verified”, a `NOTIFY_FROM` adres z tej domeny. |
| AI wolne albo „zajęte” | Brak `GROQ_API_KEY`: działa tylko darmowy zapas. |
| Zmiana w `.env.local` nic nie dała | Restart `npm run dev`; na Vercelu „Redeploy”. |

## Panel admina

- Adres: `/admin` (lokalnie `http://localhost:3100/admin`), hasło: `ADMIN_PASSWORD`.
- Zakładki: Pulpit (odwiedziny, nowe zapytania, „Dodaj projekt automatycznie”), Projekty, Wiadomości (odpowiedź e-mailem, ✨ AI poprawia i tłumaczy), Statystyki (bez cookies), Teksty strony (każdy napis w 6 językach), Ustawienia (kontakt, zdjęcie, bio, dostępność), **Połączenia**.
- Statystyki działają same: bez cookies, bez zapisywania IP, z poszanowaniem „Do Not Track”.
