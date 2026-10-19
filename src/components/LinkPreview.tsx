'use client';
/* eslint-disable @next/next/no-img-element -- Preview images are normalized private data URLs. */
import { useState } from 'react';
import { linkPreviewAction } from '@/lib/data/photo-actions';
import { callServerAction } from '@/lib/client-actions';
export function LinkPreview({ url, onTitle, demo = false }: { url: string; onTitle: (value: string) => void; demo?: boolean }) {
  const [preview, setPreview] = useState<{ title: string; site: string; imageData: string } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!/^https:\/\//i.test(url)) return null;
  return <div className="link-preview"><button type="button" className="paper-text-button" disabled={busy} onClick={async () => { setError(''); setPreview(null); if (demo) { setError('La consulta de tiendas requiere tu cuenta. En la demo podés completar los detalles manualmente.'); return; } setBusy(true); const r = await callServerAction(() => linkPreviewAction(url)); if (r.success && r.data) setPreview(r.data); else setError(r.error || 'No pudimos consultar la tienda.'); setBusy(false); }}>{busy ? 'Consultando referencia…' : 'Preparar vista previa del enlace'}</button>
    {preview && <div className="reference-paper">{preview.imageData && <img src={preview.imageData} alt="Referencia del producto en la tienda" />}<p>{preview.site}</p><strong>{preview.title || 'Referencia sin título'}</strong>{preview.title && <button type="button" className="paper-outline-button" onClick={() => onTitle(preview.title)}>Usar este título</button>}<small>Referencia orientativa. No comprobamos precio ni disponibilidad.</small></div>}
    {error && <p role="status" className="field-help">{error}</p>}
  </div>;
}
