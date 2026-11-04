import React, { Suspense } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { RibbonLogo } from "@/components/RibbonLogo";
import { PaperIllustration } from "@/components/PaperIllustration";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getSessionState } from "@/lib/auth/server";
import { isNeonAuthConfigured } from "@/lib/auth/config";
import { getInvitationPreview } from "@/lib/repositories/exchanges";
import { logError } from "@/lib/observability/log";
import { SessionUnavailable } from "@/components/SessionUnavailable";
import {
  getLatestConsentStatus,
  getOrCreateProfile,
} from "@/lib/repositories/profiles";
import { GoogleJoinButton } from "@/components/GoogleJoinButton";
import { JoinExchangeClientAction } from "@/components/JoinExchangeClientAction";
import { formatEventDate, formatMoney } from "@/lib/event-dates";

interface PreviewState {
  valid: boolean;
  exchangeId?: string;
  name?: string;
  description?: string;
  eventDate?: string;
  budgetAmount?: number;
  currency?: string;
  requiresApproval?: boolean;
  organizerAlias?: string;
  theme?: string;
  reason?: string;
}

async function UnirseContent({
  tokenPromise,
}: {
  tokenPromise: Promise<{ token: string }>;
}) {
  // Invitation expiry and membership must be evaluated for the incoming request.
  await connection();
  const { token } = await tokenPromise;
  const retryHref = `/unirse/${encodeURIComponent(token)}`;

  let preview: PreviewState = {
    valid: false,
    reason: "Las invitaciones no están disponibles en este entorno.",
  };

  if (isDatabaseConfigured()) {
    try {
      const result = await getInvitationPreview(token.trim());
      preview = result.valid
        ? {
            valid: true,
            exchangeId: result.exchangeId,
            name: result.name,
            description: result.description || "",
            eventDate: result.eventDate,
            budgetAmount: Number(result.budgetAmount),
            currency: result.currency || "CRC",
            requiresApproval: result.requiresApproval || false,
            organizerAlias: result.organizerAlias || "Organizador",
            theme: result.theme,
          }
        : { valid: false, reason: result.reason };
    } catch (err) {
      unstable_rethrow(err);
      // An outage is not an invalid invitation: never show driver messages.
      logError("join.preview_failed", err);
      return <SessionUnavailable context="invitación" retryHref={retryHref} />;
    }
  }

  const session = isNeonAuthConfigured() ? await getSessionState() : { status: "anonymous" as const };
  if (session.status === "unavailable") return <SessionUnavailable retryHref={retryHref} />;
  const currentUser = session.status === "authenticated" ? session.user : null;
  let initialHasConsented = false;
  let visibleName = currentUser?.name || "";

  if (currentUser && isDatabaseConfigured()) {
    try {
      const profile = await getOrCreateProfile(
        currentUser.id,
        currentUser.email,
        currentUser.name,
        currentUser.avatarColor || "#46245D",
      );
      visibleName = profile.alias;
      const consentStatus = await getLatestConsentStatus(currentUser.id);
      initialHasConsented = consentStatus.hasCurrentConsent;
    } catch (err) {
      unstable_rethrow(err);
      logError("join.account_state_failed", err);
      return <SessionUnavailable retryHref={retryHref} />;
    }
  }

  const theme = (["navidad", "amistad", "cumpleanos", "general"] as const).find((t) => t === preview.theme) ?? "general";
  return (
    <article className={`join-invitation occasion-${theme}`}>
      <RibbonLogo size="sm" />
      {!preview.valid ? (
        <div className="join-body">
          <p className="workshop-step">Invitación</p>
          <h1>Invitación no disponible</h1>
          <p>{preview.reason}</p>
          <p className="field-help">
            Pedile a quien organiza una invitación nueva. Si ya formás parte
            del intercambio, lo encontrás en tus intercambios.
          </p>
          <Link className="paper-button" href="/">Ir a mis intercambios</Link>
        </div>
      ) : (
        <div className="join-body">
          <p className="workshop-step">Te invitaron a un intercambio</p>
          <h1>{preview.name}</h1>
          <p className="occasion-label">Organiza {preview.organizerAlias}</p>
          <dl className="event-facts">
            <div>
              <dt>Entrega</dt>
              <dd>{formatEventDate(preview.eventDate || "")}</dd>
            </div>
            <div>
              <dt>Por regalo</dt>
              <dd>{formatMoney(preview.budgetAmount || 0, preview.currency || "CRC")}</dd>
            </div>
          </dl>
          {preview.description && <p className="handwritten-message">{preview.description}</p>}
          <div className="join-art" aria-hidden="true"><PaperIllustration theme={theme} /></div>
          <ol className="join-steps" aria-label="Cómo unirte">
            <li className={currentUser ? "done" : undefined}>Entrá con tu cuenta.</li>
            <li className={initialHasConsented ? "done" : undefined}>Confirmá los documentos de Papelito (una sola vez).</li>
            <li>{preview.requiresApproval ? "Pedí tu lugar: quien organiza lo confirma." : "Unite al intercambio."}</li>
          </ol>
          <p className="join-privacy">
            El grupo ve tu nombre visible. Tus ideas de regalo solo las ve la
            persona a la que le toque regalarte.
          </p>
          {currentUser ? (
            <JoinExchangeClientAction
              token={token}
              userEmail={currentUser.email || currentUser.name || "tu cuenta"}
              visibleName={visibleName}
              requiresApproval={!!preview.requiresApproval}
              initialHasConsented={initialHasConsented}
            />
          ) : (
            <GoogleJoinButton nextUrl={`/unirse/${token}`} />
          )}
          <p className="join-footer"><Link href="/">Volver al inicio</Link></p>
        </div>
      )}
    </article>
  );
}

export default function UnirsePage(props: {
  params: Promise<{ token: string }>;
}) {
  return (
    <main className="join-page">
      <Suspense fallback={<p className="paper-loading" role="status">Abriendo la invitación…</p>}>
        <UnirseContent tokenPromise={props.params} />
      </Suspense>
    </main>
  );
}
