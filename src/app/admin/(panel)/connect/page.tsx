import { Board } from "./board";

export const metadata = { title: "Połączenia" };

/** Setup guide + live status of every outside service (database, Telegram, AI, voice, e-mail, hosting). */
export default function Connect() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="display text-5xl md:text-6xl">Połączenia</h1>
      <p className="mt-2 mb-8 max-w-2xl text-sm text-ink/55">
        Co jest podłączone i co jeszcze zostało, sprawdzane na żywo. Przy każdej usłudze masz kroki „gdzie kliknąć” w kolejności. Klucze wpisujesz tylko w pliku <code>.env.local</code> (i na Vercelu), nigdy tutaj. Najszybciej: w terminalu <code>npm run setup</code>, kreator sprawdzi każdy klucz i sam odczyta Twój numer z Telegrama.
      </p>
      <Board />
    </div>
  );
}
