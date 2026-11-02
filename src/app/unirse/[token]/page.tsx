import React, { Suspense } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { RibbonLogo } from "@/components/RibbonLogo";
import { RibbonDivider } from "@/components/RibbonDivider";
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

  if (currentUser && isDatabaseConfigured()) {
    try {
      await getOrCreateProfile(
        currentUser.id,
        currentUser.email,
        currentUser.name,
        currentUser.avatarColor || "#46245D",
      );
      const consentStatus = await getLatestConsentStatus(currentUser.id);
      initialHasConsented = consentStatus.hasCurrentConsent;
    } catch (err) {
      unstable_rethrow(err);
      logError("join.account_state_failed", err);
      return <SessionUnavailable retryHref={retryHref} />;
    }
  }

  return (
    <div
      style={{
        maxWidth: "480px",
        width: "100%",
        backgroundColor: "#FFFFFF",
        borderRadius: "24px",
        border: "1px solid var(--border-subtle)",
        padding: "2rem 1.5rem",
        boxShadow: "0 8px 30px rgba(70, 36, 93, 0.08)",
        textAlign: "center",
      }}
    >
      <RibbonLogo size="md" />

      {!preview.valid ? (
        <div style={{ marginTop: "1.5rem" }}>
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1.4rem",
              fontWeight: 800,
              color: "var(--color-tinta)",
              margin: "0 0 0.5rem 0",
            }}
          >
            Invitación no disponible
          </h1>
          <p
            style={{
              fontSize: "0.9rem",
              color: "var(--text-secondary)",
              marginBottom: "1.5rem",
              lineHeight: 1.5,
            }}
          >
            {preview.reason}
          </p>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            <p className="field-help">
              Pedile a quien organiza una invitación nueva. Si ya formás parte
              del intercambio, podés encontrarlo desde tu cuenta en el inicio.
            </p>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "var(--color-tinta)",
                color: "#FFFFFF",
                padding: "0.75rem 1.25rem",
                borderRadius: "12px",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              ← Volver al inicio
            </Link>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: "1.25rem" }}>
          <span
            style={{
              display: "inline-block",
              backgroundColor: "var(--color-celeste)",
              color: "var(--color-tinta)",
              fontSize: "0.72rem",
              fontWeight: 800,
              textTransform: "none",
              letterSpacing: "0.06em",
              padding: "0.25rem 0.65rem",
              borderRadius: "999px",
              marginBottom: "0.75rem",
            }}
          >
            Invitación a intercambio
          </span>

          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1.55rem",
              fontWeight: 800,
              color: "var(--color-tinta)",
              margin: "0 0 0.4rem 0",
              lineHeight: 1.2,
            }}
          >
            {preview.name}
          </h1>

          <p
            style={{
              fontSize: "0.88rem",
              color: "var(--text-secondary)",
              margin: "0 0 1rem 0",
            }}
          >
            Organizado por <strong>{preview.organizerAlias}</strong>
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.65rem",
              backgroundColor: "var(--surface-subtle)",
              borderRadius: "14px",
              padding: "0.85rem",
              marginBottom: "1.25rem",
              textAlign: "left",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "0.7rem",
                  color: "var(--text-secondary)",
                  textTransform: "none",
                }}
              >
                Entrega
              </span>
              <strong
                style={{
                  display: "block",
                  fontSize: "0.92rem",
                  color: "var(--color-tinta)",
                }}
              >
                {formatEventDate(preview.eventDate || "")}
              </strong>
            </div>
            <div>
              <span
                style={{
                  fontSize: "0.7rem",
                  color: "var(--text-secondary)",
                  textTransform: "none",
                }}
              >
                Presupuesto
              </span>
              <strong
                style={{
                  display: "block",
                  fontSize: "0.92rem",
                  color: "var(--color-tinta)",
                }}
              >
                {formatMoney(
                  preview.budgetAmount || 0,
                  preview.currency || "CRC",
                )}
              </strong>
            </div>
          </div>

          <RibbonDivider />

          <div style={{ marginBottom: "1.5rem", textAlign: "left" }}>
            <p
              style={{
                fontSize: "0.78rem",
                color: "var(--text-secondary)",
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              🔒 <strong>Privacidad protegida:</strong> Al unirte, los demás
              participantes solo verán tu nombre o alias visible. Tus ideas de
              regalo solo serán compartidas con la persona a la que le
              corresponda regalarte una vez realizado el sorteo.
            </p>
          </div>

          {currentUser ? (
            <JoinExchangeClientAction
              token={token}
              userEmail={currentUser.email || currentUser.name || "tu cuenta"}
              initialHasConsented={initialHasConsented}
            />
          ) : (
            <GoogleJoinButton nextUrl={`/unirse/${token}`} />
          )}

          <div style={{ marginTop: "1rem" }}>
            <Link
              href="/"
              style={{
                fontSize: "0.82rem",
                color: "var(--text-secondary)",
                textDecoration: "none",
              }}
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UnirsePage(props: {
  params: Promise<{ token: string }>;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--bg-app)",
        padding: "2rem 1rem 4rem 1rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Suspense
        fallback={
          <div style={{ textAlign: "center", padding: "2rem" }}>
            Cargando invitación...
          </div>
        }
      >
        <UnirseContent tokenPromise={props.params} />
      </Suspense>
    </div>
  );
}
