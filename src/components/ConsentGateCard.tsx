'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { LEGAL_CONSTANTS } from '@/lib/legal/constants';

export interface ConsentGateResult {
  ok: boolean;
  error?: string;
}

interface ConsentGateCardProps {
  onConfirm: (termsAccepted: boolean, privacyAccepted: boolean) => Promise<boolean | ConsentGateResult>;
  onSecondaryAction?: () => void;
  secondaryLabel?: string;
  title?: string;
  description?: string;
  submitLabel?: string;
  externalError?: string | null;
  compact?: boolean;
}

export const ConsentGateCard: React.FC<ConsentGateCardProps> = ({
  onConfirm,
  onSecondaryAction,
  secondaryLabel = 'Mi cuenta y privacidad',
  title = 'Un detalle antes de empezar.',
  description = 'Confirmá los términos y el uso de tus datos una sola vez. Guardamos tu aceptación en tu cuenta; solo la pediremos de nuevo si cambia la versión o la revocás. Podés abrir Mi cuenta para gestionar tus datos o salir.',
  submitLabel = 'Confirmar y continuar',
  externalError = null,
  compact = false,
}) => {
  const [termsBox, setTermsBox] = useState(false);
  const [privacyBox, setPrivacyBox] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!termsBox || !privacyBox) {
      setLocalError('Debes marcar ambas casillas para confirmar tu consentimiento informado.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await onConfirm(true, true);
      if (typeof result === 'boolean') {
        if (!result) {
          setLocalError('No se pudo registrar el consentimiento. Inténtalo nuevamente.');
        }
      } else if (!result.ok) {
        setLocalError(result.error || 'No se pudo registrar el consentimiento. Inténtalo nuevamente.');
      }
    } catch {
      setLocalError('Ocurrió un error al registrar tu consentimiento. Inténtalo nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = localError || externalError;

  return (
    <div
      className={compact ? 'paper-consent-gate paper-consent-gate-compact' : 'paper-consent-gate'}
      style={{
        maxWidth: compact ? '100%' : '520px',
        margin: compact ? '0 0 1.25rem 0' : '2.5rem auto',
        padding: compact ? '1.25rem 1.1rem' : '1.75rem 1.5rem',
        backgroundColor: '#FFFEFC',
        borderRadius: '20px',
        border: '2px solid var(--border-subtle)',
        boxShadow: compact ? 'none' : '0 8px 30px rgba(70, 36, 93, 0.08)',
        textAlign: 'left',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: compact ? '1.1rem' : '1.35rem',
          fontWeight: 800,
          color: 'var(--color-tinta)',
          margin: '0 0 0.5rem 0',
          lineHeight: 1.25,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontSize: '0.86rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
          margin: '0 0 1rem 0',
        }}
      >
        {description}
      </p>

      <form onSubmit={handleSubmit}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
            padding: '0.85rem',
            backgroundColor: 'var(--surface-subtle)',
            borderRadius: '14px',
            marginBottom: '1rem',
            fontSize: '0.84rem',
            color: 'var(--color-tinta)',
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.55rem',
              cursor: 'pointer',
              lineHeight: 1.45,
            }}
          >
            <input
              type="checkbox"
              checked={termsBox}
              onChange={(e) => {
                setTermsBox(e.target.checked);
                if (localError) setLocalError(null);
              }}
              style={{ marginTop: '0.2rem', width: '18px', height: '18px', accentColor: 'var(--color-tinta)', flexShrink: 0 }}
            />
            <span>
              Acepto los{' '}
              <Link href="/terminos" target="_blank" style={{ fontWeight: 700, color: 'var(--color-tinta)' }}>
                Términos y Condiciones
              </Link>{' '}
              (versión {LEGAL_CONSTANTS.VERSION}).
            </span>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.55rem',
              cursor: 'pointer',
              lineHeight: 1.45,
            }}
          >
            <input
              type="checkbox"
              checked={privacyBox}
              onChange={(e) => {
                setPrivacyBox(e.target.checked);
                if (localError) setLocalError(null);
              }}
              style={{ marginTop: '0.2rem', width: '18px', height: '18px', accentColor: 'var(--color-tinta)', flexShrink: 0 }}
            />
            <span>
              He leído el{' '}
              <Link href="/consentimiento" target="_blank" style={{ fontWeight: 700, color: 'var(--color-tinta)' }}>
                Consentimiento Informado
              </Link>{' '}
              y autorizo el tratamiento de mis datos personales para los sorteos y listas de deseos (Ley N.º 8968).
            </span>
          </label>
        </div>

        {displayError && (
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
            {displayError}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          <button
            type="submit"
            disabled={submitting}
            style={{
              flex: 1,
              minHeight: '46px',
              backgroundColor: 'var(--color-frambuesa)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '14px',
              fontSize: '0.94rem',
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
              cursor: submitting ? 'wait' : 'pointer',
              padding: '0.65rem 1rem',
            }}
          >
            {submitting ? 'Registrando...' : submitLabel}
          </button>

          {onSecondaryAction && (
            <button
              type="button"
              onClick={onSecondaryAction}
              style={{
                minHeight: '46px',
                padding: '0 1rem',
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--color-tinta)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '14px',
                fontSize: '0.88rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
