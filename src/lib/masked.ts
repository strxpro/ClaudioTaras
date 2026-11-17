/**
 * Contact details shown with a blurred ending (see components/site/masked.tsx). The page only ever
 * carries the visible head, a same-shaped dummy tail for the blur, and the full value encoded
 * (base64, reversed) — so scrapers reading the HTML don't get a clean number or address.
 */
export type MaskedContact = {
  kind: "tel" | "mail";
  /** e.g. "PL" / "IT" for phones */
  label?: string;
  head: string;
  /** same length/shape as the hidden part, never the real characters */
  dummy: string;
  code: string;
};

const encode = (v: string) => Buffer.from(v, "utf8").toString("base64").split("").reverse().join("");
const dummyOf = (t: string) => t.replace(/\d/g, "8").replace(/[a-z]/gi, "x");

export function maskPhone(number: string, label?: string): MaskedContact {
  const v = number.trim();
  // keep the country code and the first group, hide the rest
  const m = v.match(/^(\+?\d{1,3}\s?\d{2,3})(.*)$/);
  const head = m ? m[1] : v.slice(0, Math.ceil(v.length / 2));
  const tail = v.slice(head.length);
  return { kind: "tel", label, head, dummy: dummyOf(tail), code: encode(v) };
}

export function maskEmail(email: string): MaskedContact {
  const v = email.trim();
  const at = v.indexOf("@");
  const keep = at > 0 ? Math.max(3, Math.ceil(at * 0.55)) : Math.ceil(v.length / 2);
  return { kind: "mail", head: v.slice(0, keep), dummy: dummyOf(v.slice(keep)), code: encode(v) };
}
