"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  acceptInvitationAction,
  recordConsentAction,
} from "@/lib/data/server-actions";
import { LEGAL_CONSTANTS } from "@/lib/legal/constants";
import { ConsentGateCard } from "@/components/ConsentGateCard";
import { callServerAction } from "@/lib/client-actions";

interface JoinExchangeClientActionProps {
  token: string;
  userEmail: string;
  /** How the group will see this person (profile alias). */
  visibleName: string;
  requiresApproval: boolean;
  initialHasConsented: boolean;
}

export const JoinExchangeClientAction: React.FC<
  JoinExchangeClientActionProps
> = ({ token, userEmail, visibleName, requiresApproval, initialHasConsented }) => {
  const router = useRouter();
  const [hasConsented, setHasConsented] = useState(initialHasConsented);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [consentJustSaved, setConsentJustSaved] = useState(false);
  const inFlight = useRef(false);

  const handleConfirmConsent = async (
    termsAccepted: boolean,
    privacyAccepted: boolean,
  ) => {
    setJoinError(null);
    const res = await callServerAction(() =>
      recordConsentAction({
        termsAccepted,
        privacyAccepted,
        version: LEGAL_CONSTANTS.VERSION,
      }),
    );
    if (res.success) {
      setHasConsented(true);
      setConsentJustSaved(true);
      return { ok: true };
    }
    return {
      ok: false,
      error: res.error || "No se pudo registrar el consentimiento informado.",
    };
  };

  const handleJoinExchange = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setJoinError(null);
    setJoining(true);
    try {
      const res = await callServerAction(() => acceptInvitationAction(token));
      if (res.success && res.data?.exchangeId) {
        router.push(`/?intercambio=${encodeURIComponent(res.data.exchangeId)}`);
        router.refresh();
        return;
      }
      const errorMsg =
        res.error || "No se pudo completar la unión al intercambio.";
      if (errorMsg.toLowerCase().includes("consentimiento")) {
        setHasConsented(false);
      }
      setJoinError(errorMsg);
      setJoining(false);
    } catch {
      setJoinError(
        "No pudimos completar tu ingreso al intercambio. Intentá de nuevo.",
      );
      setJoining(false);
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <div className="join-action">
      {!hasConsented ? (
        <ConsentGateCard
          compact
          title="Antes de sumarte, un detalle."
          description={`Entraste como ${userEmail}. Antes de unirte, confirmá por única vez la versión vigente de los documentos de Papelito.`}
          submitLabel="Confirmar consentimiento"
          onConfirm={handleConfirmConsent}
          externalError={joinError}
        />
      ) : (
        <div>
          {consentJustSaved && (
            <p className="workshop-success" role="status">
              Consentimiento registrado. Ahora podés confirmar tu ingreso.
            </p>
          )}
          {joinError && (
            <p className="workshop-error" role="alert">
              {joinError}
            </p>
          )}
          {visibleName && (
            <p className="join-visible-name">
              El grupo te va a ver como <strong>{visibleName}</strong>. Podés cambiar tu nombre visible en Mi cuenta.
            </p>
          )}
          <button
            type="button"
            className="paper-button join-button"
            onClick={handleJoinExchange}
            disabled={joining}
            aria-busy={joining}
          >
            {joining ? "Sumándote al intercambio…" : requiresApproval ? "Pedir mi lugar" : "Unirme al intercambio"}
          </button>
          <p className="field-help join-account">Vas a unirte como {userEmail}.</p>
        </div>
      )}
    </div>
  );
};
