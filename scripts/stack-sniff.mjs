// Detects libraries used by live sites by scanning their JS bundles for signatures.
import fs from "node:fs";
const sites = JSON.parse(fs.readFileSync(".capture/recon.json", "utf8"));
const extra = JSON.parse(fs.readFileSync(".capture/recon2.json", "utf8"));
const sig = {
  "Next.js": /__NEXT_DATA__|next\/dist|_next\/static/,
  React: /react\.production|__reactFiber|createElement\(/,
  GSAP: /gsap|GreenSock|ScrollTrigger/,
  Lenis: /lenis/i,
  "Three.js": /THREE\.|WebGLRenderer|three\.module/,
  "Framer Motion": /framer-motion|motion\.div|useAnimationControls/,
  Supabase: /supabase/,
  Stripe: /stripe/i,
  "next-intl": /next-intl/,
  Leaflet: /leaflet/i,
  "Matter.js": /matter-js|Matter\.Engine/,
  Swiper: /swiper/i,
  Vue: /__vue__|createApp\(/,
  Firebase: /firebase/i,
  "Google Maps": /maps\.googleapis/,
  EmailJS: /emailjs/i,
  Tailwind: /tw-|--tw-/,
};
const all = { ...sites, ...extra };
for (const [url, info] of Object.entries(all)) {
  if (info.error) continue;
  let blob = "";
  for (const src of info.scripts) {
    try {
      blob += await (await fetch(src)).text();
    } catch {}
  }
  try {
    blob += await (await fetch(info.finalUrl)).text();
  } catch {}
  const hits = Object.entries(sig).filter(([, re]) => re.test(blob)).map(([k]) => k);
  console.log(url, "→", hits.join(", "));
}
