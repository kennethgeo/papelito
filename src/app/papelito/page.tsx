import type { Metadata } from "next";
import Link from "next/link";
import { RibbonLogo } from "@/components/RibbonLogo";
import { PersonalPapelito } from "@/components/PersonalPapelito";

// A neutral title: messaging apps show it in link previews. The page itself
// carries no personal data: the link's secret is in the URL fragment, which
// browsers do not send to servers, and the page reads it in the browser.
export const metadata: Metadata = {
  title: "Tu papelito",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PersonalPapelitoPage() {
  return (
    <main className="join-page">
      <article className="join-invitation personal-papelito">
        <RibbonLogo size="sm" />
        <PersonalPapelito />
        <noscript>
          <div className="join-body">
            <h1>Tu papelito</h1>
            <p>Para abrir tu papelito hace falta activar JavaScript en el navegador, o abrir el enlace en otro navegador del teléfono.</p>
          </div>
        </noscript>
        <p className="join-footer"><Link href="/privacidad">Privacidad</Link></p>
      </article>
    </main>
  );
}
