import { notFound } from "next/navigation";

/** Any unknown address under a language renders that language's 404 (inside the site layout). */
export default function Unknown() {
  notFound();
}
