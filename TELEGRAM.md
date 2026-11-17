# Bot Telegram portfolio — jak go podłączyć (krok po kroku)

Piszesz albo mówisz do bota, w dowolnym języku, np. „co nowego w zapytaniach?”, „zmień hasło Villa Dea na…”, „wyróżnij Lumo”, „nie przyjmuję teraz projektów”.
Bot pokazuje plan i czeka na ✅ (zawsze możesz „Cofnij”). Teksty tłumaczy sam na 6 języków.
Nowe zapytania z formularza przychodzą na Telegram (z załącznikami) z przyciskami **💬 Odpowiedz / ✓ Przeczytane / ✉️ Odpowiedziane / 🗄 Archiwum / WhatsApp**.
**Odpowiedź klientowi:** kliknij 💬 Odpowiedz albo po prostu odpowiedz na powiadomienie (przesuń w lewo) — tekstem lub głosówką, po polsku. Bot zrobi z tego e-mail w języku klienta, w Twoim szablonie, pokaże go i wyśle dopiero po ✅.
**Statystyki:** „ile osób było dziś na stronie?”, „skąd są odwiedzający?” albo `/stats`.
Gdy import nowego projektu się skończy, bot też da znać. Pełna konfiguracja (baza, e-maile, klucze, publikacja): **SETUP.md**. Czy wszystko działa, widzisz w panelu → **Połączenia** (tam też „Wyślij test na Telegram” i „Podłącz webhook”).

## Co jest potrzebne i ile to kosztuje

| Usługa | Do czego | Koszt |
|---|---|---|
| **Telegram** (@BotFather) | sam bot | za darmo |
| **Groq** (console.groq.com) | głosówki → tekst (Whisper) + „mózg” bota | za darmo |
| **Gemini** (aistudio.google.com) | zapasowy „mózg” / tłumaczenia | za darmo |
| **Anthropic** (opcjonalnie) | najlepsza jakość poleceń i tekstów | płatne za użycie, zwykle grosze dziennie |

Bez żadnego klucza bot i tłumaczenia też działają (darmowe Pollinations), ale wolniej, z gorszą jakością i czasem „zajęte” — **jeden darmowy klucz Groq rozwiązuje wszystko**.

## 1. Bot w Telegramie (2 min)
1. W Telegramie otwórz **@BotFather** → `/newbot` → nazwa np. „Claudio Portfolio” → login np. `claudio_portfolio_bot`.
2. Skopiuj **token** → `TELEGRAM_BOT_TOKEN`.
3. Wymyśl długi losowy ciąg (32+ znaków) → `TELEGRAM_WEBHOOK_SECRET`.
4. Twoje ID: napisz do swojego nowego bota `/start` (po kroku 3 poniżej) — odpowie Twoim numerem ID. Wpisz go jako `ADMIN_TELEGRAM_ID` (kilka osób: `123,456`).

## 2. Klucze AI (3 min)
1. **console.groq.com** → API Keys → Create → `GROQ_API_KEY` (głosówki + AI).
2. Opcjonalnie **aistudio.google.com** → Get API key → `GEMINI_API_KEY`.

## 3. Uruchom na swoim komputerze (bez publikacji)
W `.env.local` wpisz powyższe zmienne, potem w dwóch terminalach:

```bash
npm run dev
```

```bash
npm run bot:dev
```

Napisz do bota `/start`. Działa, dopóki chodzą oba polecenia. Lokalnie bot zmienia lokalną bazę (`.data/db.json`) i może importować projekty (zrzuty, wideo).

## 4. Na opublikowanej stronie (Vercel)
1. Strona na Vercel musi mieć **Supabase** (na Vercelu pliki nie są trwałe): uruchom `supabase/schema.sql` w Supabase → SQL Editor i dodaj `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
2. W Vercel → Settings → Environment Variables dodaj: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_TELEGRAM_ID`, `GROQ_API_KEY` (+ `GEMINI_API_KEY`), `NEXT_PUBLIC_SITE_URL`.
3. Podłącz bota do strony (raz): w panelu na opublikowanej stronie → **Połączenia → „Podłącz webhook”**, albo z komputera:

```bash
npm run bot:webhook
```

Uwaga: `npm run bot:dev` odłącza webhook (bot słucha wtedy Twojego komputera) — po testach uruchom znowu `npm run bot:webhook`.
Import nowych projektów (zrzuty, wideo) działa tylko na Twoim komputerze — na Vercelu nie ma przeglądarki do nagrywania.

## Przykłady poleceń
- „Co nowego w zapytaniach?” / „Pokaż ostatnie zapytanie” / „Oznacz zapytanie od Marco jako przeczytane”
- „Zmień hasło Villa Dea na: Dom nad morzem” → hasło + tłumaczenia na 6 języków
- „Przepisz teksty projektu Oltre, bardziej o AI” → nowe teksty w stylu portfolio
- „Funkcje Pizzerii: zamówienia online, ekran kuchni, śledzenie dostawy, panel menu”
- „Dodaj do Il Girasole liczbę 4,8 — ocena Google”
- „Przesuń Lumo na pierwsze miejsce” / „Wyróżnij SpabiNext” / „Ukryj Grindi Group”
- „Nie przyjmuję teraz projektów” / „Zmień telefon na …” / „Zmień moje bio na …”
- „Dodaj projekt https://nowastrona.it” / „Dodaj projekt z F:\Projekty\nowy” / „Odśwież zrzuty Pizzerii”
- Zdjęcie z podpisem „do galerii Onda” albo „to moje zdjęcie” (portret w sekcji O mnie)
- „Cofnij”
