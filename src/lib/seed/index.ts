import type { Database } from "../types";
import { L } from "./helpers";
import { projectsA } from "./projects-a";
import { projectsB } from "./projects-b";
import { projectsC } from "./projects-c";

export function seedDatabase(): Database {
  return {
    projects: [...projectsA, ...projectsB, ...projectsC],
    messages: [],
    settings: {
      email: "claudiotaras3@gmail.com",
      phone: "+48 665 626 101",
      phones: [
        { label: "PL", number: "+48 665 626 101" },
        { label: "IT", number: "+39 345 451 0973" },
      ],
      location: "Sardinia · Europe — remote worldwide",
      available: true,
      socials: [
        { label: "Instagram", url: "https://instagram.com/tarassso03" },
        { label: "WhatsApp", url: "https://wa.me/48665626101" },
      ],
      bio: L(
        "I’m Claudio Taras, 23. I’ve been building for the web for seven years — sites, online stores, web apps and the marketing that makes them work. I design, code and launch end-to-end, so nothing gets lost between the idea and the result.",
        "Jestem Claudio Taras, mam 23 lata. Od siedmiu lat tworzę w sieci — strony, sklepy, aplikacje webowe i marketing, który sprawia, że działają. Projektuję, koduję i wdrażam od A do Z, więc nic nie ginie między pomysłem a efektem.",
        "Sono Claudio Taras, ho 23 anni. Da sette anni costruisco per il web — siti, negozi online, web app e il marketing che li fa funzionare. Progetto, sviluppo e lancio dall’inizio alla fine, così niente si perde tra l’idea e il risultato.",
        "Soy Claudio Taras, tengo 23 años. Llevo siete años construyendo para la web — sitios, tiendas online, aplicaciones y el marketing que las hace funcionar. Diseño, programo y lanzo de principio a fin, para que nada se pierda entre la idea y el resultado.",
        "Ich bin Claudio Taras, 23. Seit sieben Jahren baue ich fürs Web — Websites, Online-Shops, Web-Apps und das Marketing, das sie wirken lässt. Ich gestalte, entwickle und launche alles aus einer Hand, damit zwischen Idee und Ergebnis nichts verloren geht.",
        "Je suis Claudio Taras, 23 ans. Depuis sept ans, je construis pour le web — sites, boutiques en ligne, applications et le marketing qui les fait fonctionner. Je conçois, développe et lance de bout en bout, pour que rien ne se perde entre l’idée et le résultat.",
      ),
      yearsExperience: 7,
      birthYear: 2003,
    },
  };
}
