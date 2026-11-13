import React, { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { RibbonLogo } from "@/components/RibbonLogo";
import { PersonalPapelitoReveal } from "@/components/PersonalPapelitoReveal";
import { isDatabaseConfigured } from "@/lib/db/client";
import { previewPersonalLink, type PersonalLinkPreview } from "@/lib/repositories/personal-links";
import { logError } from "@/lib/observability/log";
import { formatEventDate, formatMoney } from "@/lib/event-dates";

// A neutral title: messaging apps show it in link previews.
export const metadata: Metadata = {
  title: "Tu papelito",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Facts({ preview }: { preview: Extract<PersonalLinkPreview, { eventDate: string }> }) {
  return (
    <dl className="event-facts">
      <div><dt>Entrega</dt><dd>{formatEventDate(preview.eventDate)}</dd></div>
      <div><dt>Por regalo</dt><dd>{formatMoney(preview.budgetAmount, preview.currency)}</dd></div>
    </dl>
  );
}

async function PersonalContent({ tokenPromise }: { tokenPromise: Promise<{ token: string }> }) {
  // The link state (draw, approval, revocation) is evaluated per request.
  await connection();
  const { token } = await tokenPromise;
  let preview: PersonalLinkPreview = { state: "invalid" };
  if (isDatabaseConfigured()) {
    try {
      preview = await previewPersonalLink(token);
    } catch (error) {
      unstable_rethrow(error);
      // An outage is not an invalid link: say so and offer to try again.
      logError("personal_link.preview_failed", error);
      return (
        <div className="join-body" role="alert">
          <h1>No pudimos revisar este enlace.</h1>
          <p>Puede ser la conexión o un problema pasajero. Tu papelito sigue guardado.</p>
          {/* A full navigation renders the page again on the server. */}
          <a className="paper-button" href={`/papelito/${encodeURIComponent(token)}`}>Intentar de nuevo</a>
        </div>
      );
    }
  }

  if (preview.state === "invalid") {
    return (
      <div className="join-body">
        <h1>Enlace no disponible</h1>
        <p>Este enlace ya no funciona. Pedile a la persona que te inscribió que te envíe uno nuevo.</p>
      </div>
    );
  }
  if (preview.state === "closed") {
    return (
      <div className="join-body">
        <p className="workshop-step">{preview.exchangeName}</p>
        <h1>Este intercambio ya terminó.</h1>
        <p>Gracias por participar, {preview.alias}.</p>
      </div>
    );
  }
  if (preview.state === "waiting") {
    return (
      <div className="join-body">
        <p className="workshop-step">{preview.exchangeName}</p>
        <h1>Hola, {preview.alias}.</h1>
        <p>
          {preview.reason === "approval"
            ? "Todavía falta que quien organiza confirme tu lugar."
            : "Todavía no se hizo el sorteo."}{" "}
          Cuando esté listo, abrí este mismo enlace para ver a quién le regalás.
        </p>
        <Facts preview={preview} />
        <p className="field-help">Guardá este mensaje: el enlace es solo tuyo y sirve en cualquier teléfono.</p>
      </div>
    );
  }
  return (
    <div className="join-body">
      <p className="workshop-step">{preview.exchangeName}</p>
      <h1>Hola, {preview.alias}.</h1>
      <p>Tu papelito está listo. Solo vos vas a ver a quién le regalás.</p>
      <Facts preview={preview} />
      <PersonalPapelitoReveal token={token} />
    </div>
  );
}

export default function PersonalPapelitoPage(props: { params: Promise<{ token: string }> }) {
  return (
    <main className="join-page">
      <article className="join-invitation personal-papelito">
        <RibbonLogo size="sm" />
        <Suspense fallback={<p className="paper-loading" role="status">Abriendo tu papelito…</p>}>
          <PersonalContent tokenPromise={props.params} />
        </Suspense>
        <p className="join-footer"><Link href="/privacidad">Privacidad</Link></p>
      </article>
    </main>
  );
}
