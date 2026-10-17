'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { LEGAL_CONSTANTS } from '@/lib/legal/constants';

export function GoogleJoinButton({ nextUrl }: { nextUrl: string }) {
  const router = useRouter();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async () => {
    if (!termsAccepted || !privacyAccepted) {
      setError('Debes marcar ambas casillas de términos y consentimiento informado antes de continuar con Google.');
      return;
    }
    setError('');
    document.cookie = `papelito_pending_consent=${encodeURIComponent(`${LEGAL_CONSTANTS.VERSION}|${Date.now()}`)}; path=/; max-age=600; SameSite=Lax`;

    try {
      if (authClient) {
        const result = await authClient.signIn.social({
          provider: 'google',
          callbackURL: `${window.location.origin}${nextUrl}`,
        });
        if (result?.error) {
          router.push(`/auth/unconfigured?provider=google&next=${encodeURIComponent(nextUrl)}`);
        }
      } else {
        router.push(`/auth/unconfigured?provider=google&next=${encodeURIComponent(nextUrl)}`);
      }
    } catch {
      router.push(`/auth/unconfigured?provider=google&next=${encodeURIComponent(nextUrl)}`);
    }
  };

  return (
    <div style={{ textAlign: 'left' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          fontSize: '0.8rem',
          color: 'var(--color-tinta)',
          marginBottom: '0.85rem',
          backgroundColor: 'var(--surface-subtle)',
          padding: '0.75rem',
          borderRadius: '12px',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            style={{ marginTop: '0.2rem' }}
          />
          <span>
            Acepto los <Link href="/terminos" target="_blank">Términos y Condiciones</Link> (v{LEGAL_CONSTANTS.VERSION}).
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={privacyAccepted}
            onChange={(e) => setPrivacyAccepted(e.target.checked)}
            style={{ marginTop: '0.2rem' }}
          />
          <span>
            He leído el <Link href="/consentimiento" target="_blank">Consentimiento Informado</Link> y autorizo el uso de mis datos para este intercambio.
          </span>
        </label>
      </div>

      {error && (
        <div role="alert" style={{ color: '#C53030', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleJoin}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          width: '100%',
          minHeight: '48px',
          backgroundColor: 'var(--color-frambuesa)',
          color: '#FFFFFF',
          borderRadius: '14px',
          border: 'none',
          fontSize: '0.98rem',
          fontWeight: 700,
          fontFamily: 'var(--font-heading)',
          cursor: 'pointer',
        }}
      >
        <span>Continuar con Google para unirme</span>
      </button>
    </div>
  );
}
