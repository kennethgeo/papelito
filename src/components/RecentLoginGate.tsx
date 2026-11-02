'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { recentLoginAction } from '@/lib/data/session-actions';
import { callServerRead } from '@/lib/client-actions';

/**
 * Sensitive actions require a sign-in from the last 15 minutes. Check it
 * before the person fills the form; if it is older, offer to sign in again and
 * come back to the same place (`returnTo`, an internal path).
 */
export function RecentLoginGate({ purpose, returnTo, children }: { purpose: string; returnTo: string; children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'recent' | 'stale' | 'error'>('checking');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void callServerRead(() => recentLoginAction(), 'el estado de tu sesión').then((result) => {
      if (!active) return;
      setState(result.success && result.data ? (result.data.recent ? 'recent' : 'stale') : 'error');
    });
    return () => { active = false; };
  }, [attempt]);
  if (state === 'recent') return <>{children}</>;
  if (state === 'checking') return <p role="status">Revisando tu sesión…</p>;
  if (state === 'error') return (
    <p role="alert">
      No pudimos revisar tu sesión.{' '}
      <button type="button" className="paper-text-button" onClick={() => { setState('checking'); setAttempt((n) => n + 1); }}>Intentar de nuevo</button>
    </p>
  );
  return (
    <form method="post" action={`/auth/logout?next=${encodeURIComponent(returnTo)}`} className="reauth-note">
      <p><strong>Confirmá que sos vos.</strong> Para {purpose} tenés que haber ingresado en los últimos 15 minutos.</p>
      <p className="field-help">Vas a salir y volver a entrar; después te traemos de vuelta aquí.</p>
      <button type="submit" className="paper-button">Volver a ingresar</button>
    </form>
  );
}
