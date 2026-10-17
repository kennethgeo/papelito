'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { acceptInvitationAction, recordConsentAction } from '@/lib/data/server-actions';
import { LEGAL_CONSTANTS } from '@/lib/legal/constants';
import { ConsentGateCard } from '@/components/ConsentGateCard';

interface JoinExchangeClientActionProps {
  token: string;
  userEmail: string;
  initialHasConsented: boolean;
}

export const JoinExchangeClientAction: React.FC<JoinExchangeClientActionProps> = ({
  token,
  userEmail,
  initialHasConsented,
}) => {
  const router = useRouter();
  const [hasConsented, setHasConsented] = useState(initialHasConsented);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [consentJustSaved, setConsentJustSaved] = useState(false);

  const handleConfirmConsent = async (termsAccepted: boolean, privacyAccepted: boolean) => {
    setJoinError(null);
    const res = await recordConsentAction({
      termsAccepted,
      privacyAccepted,
      version: LEGAL_CONSTANTS.VERSION,
    });
    if (res.success) {
      setHasConsented(true);
      setConsentJustSaved(true);
      return { ok: true };
    }
    return {
      ok: false,
      error: res.error || 'No se pudo registrar el consentimiento informado.',
    };
  };

  const handleJoinExchange = async () => {
    setJoinError(null);
    setJoining(true);
    try {
      const res = await acceptInvitationAction(token);
      if (res.success && res.data?.exchangeId) {
        router.push('/');
        router.refresh();
        return;
      }
      const errorMsg = res.error || 'No se pudo completar la unión al intercambio.';
      if (errorMsg.toLowerCase().includes('consentimiento')) {
        setHasConsented(false);
      }
      setJoinError(errorMsg);
      setJoining(false);
    } catch {
      setJoinError('Error inesperado al unirte al intercambio. Inténtalo de nuevo.');
      setJoining(false);
    }
  };

  return (
    <div style={{ textAlign: 'left' }}>
      {!hasConsented ? (
        <ConsentGateCard
          compact
          title="Antes de sumarte, un detalle."
          description={`Has iniciado sesión como ${userEmail}. Antes de unirte al intercambio, confirma por única vez la versión vigente de nuestros documentos legales.`}
          submitLabel="Confirmar consentimiento"
          onConfirm={handleConfirmConsent}
          externalError={joinError}
        />
      ) : (
        <div>
          {consentJustSaved && (
            <div
              role="status"
              style={{
                backgroundColor: '#F0FDF4',
                border: '1px solid #BBF7D0',
                color: '#166534',
                padding: '0.65rem 0.85rem',
                borderRadius: '12px',
                fontSize: '0.82rem',
                fontWeight: 600,
                marginBottom: '0.85rem',
                lineHeight: 1.4,
              }}
            >
              Consentimiento registrado en tu cuenta. Ahora puedes confirmar tu ingreso al intercambio.
            </div>
          )}

          {joinError && (
            <div
              role="alert"
              style={{
                backgroundColor: '#FFF5F5',
                border: '1px solid #FEB2B2',
                color: '#9B1C1C',
                padding: '0.65rem 0.85rem',
                borderRadius: '12px',
                fontSize: '0.82rem',
                fontWeight: 600,
                marginBottom: '0.85rem',
                lineHeight: 1.4,
              }}
            >
              {joinError}
            </div>
          )}

          <button
            type="button"
            onClick={handleJoinExchange}
            disabled={joining}
            style={{
              width: '100%',
              minHeight: '48px',
              backgroundColor: 'var(--color-frambuesa)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '14px',
              fontSize: '0.98rem',
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
              cursor: joining ? 'wait' : 'pointer',
              padding: '0.75rem 1rem',
            }}
          >
            {joining ? 'Uniéndote al intercambio...' : 'Unirme al intercambio'}
          </button>
          <p style={{ margin: '0.65rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)', overflowWrap: 'anywhere', textAlign: 'center' }}>
            Vas a unirte como {userEmail}.
          </p>
        </div>
      )}
    </div>
  );
};
