'use client';

import { useEffect, useRef } from 'react';

/**
 * Spanish recovery screen shared by app/error.tsx and app/global-error.tsx.
 * Inline styles: global-error renders without the app stylesheet.
 * Next 16 passes `retry` (and `reset`); vinext passes `reset` only.
 */
export function RecoverableError({ error, retry, reset }: { error: unknown; retry?: () => void; reset?: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const digest = error instanceof Error && typeof (error as { digest?: unknown }).digest === 'string'
    ? (error as Error & { digest: string }).digest
    : '';
  const supportCode = /^[0-9A-Za-z_-]{1,64}$/.test(digest) ? digest : '';
  const tryAgain = retry ?? reset;
  const button = { minHeight: 48, padding: '12px 20px', borderRadius: 9, font: '600 17px/1.2 system-ui, sans-serif', cursor: 'pointer' } as const;
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '24px 16px', background: '#F8F5FB', color: '#46245D', fontFamily: 'system-ui, sans-serif' }}>
      <section role="alert" style={{ maxWidth: 520, width: '100%', background: '#FFFEFC', border: '1.5px solid #CEBED9', boxShadow: '5px 6px 0 #EDE5F5', padding: '28px 22px', borderTop: '4px solid #F7D85B' }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6C5978' }}>papelito.</p>
        <h1 ref={heading} tabIndex={-1} style={{ fontSize: 30, lineHeight: 1.1, margin: '12px 0', outline: 'none' }}>Se nos traspapeló algo.</h1>
        <p style={{ fontSize: 17, lineHeight: 1.5, margin: '0 0 8px' }}>No pudimos mostrar esta pantalla. Tus datos guardados no se perdieron.</p>
        <p style={{ fontSize: 16, lineHeight: 1.5, margin: '0 0 20px', color: '#6C5978' }}>Si estabas guardando un cambio, revisá si quedó registrado antes de repetirlo.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {tryAgain && <button type="button" onClick={() => tryAgain()} style={{ ...button, background: '#46245D', color: '#FFFFFF', border: '1.5px solid #46245D' }}>Intentar de nuevo</button>}
          <button type="button" onClick={() => window.location.reload()} style={{ ...button, background: 'transparent', color: '#46245D', border: '1.5px solid #46245D' }}>Recargar la página</button>
          {/* A full document load: after a failure the client router may be in a broken state. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ ...button, display: 'inline-flex', alignItems: 'center', color: '#46245D', textUnderlineOffset: 4 }}>Volver al inicio</a>
        </div>
        {supportCode && <p style={{ marginTop: 20, fontSize: 14, color: '#6C5978' }}>Código para soporte: <code>{supportCode}</code>. Podés compartirlo al reportar el problema; no contiene datos tuyos.</p>}
      </section>
    </main>
  );
}
