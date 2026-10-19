'use client';
/* eslint-disable @next/next/no-img-element -- Private images must bypass the public image optimizer. */
import { useId, useState } from 'react';
import { uploadWishPhotoAction, removeWishPhotoAction } from '@/lib/data/photo-actions';
import { callServerAction } from '@/lib/client-actions';
export function WishPhoto({ wishId, hasPhoto = false, editable = false, demo = false }: { wishId: string; hasPhoto?: boolean; editable?: boolean; demo?: boolean }) {
  const id = useId(); const [override, setOverride] = useState<boolean | undefined>();
  const [image, setImage] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [version, setVersion] = useState(0), [removing, setRemoving] = useState(false);
  const visible = override ?? hasPhoto;
  async function upload(file?: File) {
    if (!file || busy) return; setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('Elegí una foto JPG, PNG o WebP de hasta 10 MB.'); return; }
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const canvas = document.createElement('canvas'); const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('No pudimos preparar la imagen.');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('No pudimos preparar la foto.')), 'image/jpeg', 0.7));
      if (demo) { setImage(canvas.toDataURL('image/jpeg', 0.7)); }
      else { const form = new FormData(); form.set('wishId', wishId); form.set('photo', blob, 'foto.jpg'); const result = await callServerAction(() => uploadWishPhotoAction(form)); if (!result.success) throw new Error(result.error); }
      setOverride(true); setVersion(Date.now());
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos guardar la foto.'); }
    finally { setBusy(false); }
  }
  return <div className="wish-photo">
    {visible && <figure><img src={demo ? image : `/api/wishes/${wishId}/image?v=${version}`} alt="Referencia visual del regalo" loading="lazy" /></figure>}
    {editable && <><label className="photo-upload" htmlFor={id}>{busy ? 'Preparando foto…' : visible ? 'Cambiar foto del regalo' : 'Agregar foto del regalo'}<input id={id} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} /></label><p className="field-help">Una foto comprimida por deseo. Hasta 20 por cuenta durante el piloto. {demo ? 'En demo se muestra solo en esta pantalla.' : 'Se eliminan sus metadatos y se guarda de forma privada.'}</p>
      {visible && (!removing ? <button className="paper-text-button" onClick={() => setRemoving(true)}>Quitar foto</button> : <div className="confirmation-note"><p>¿Querés quitar esta foto del deseo?</p><button className="paper-outline-button" disabled={busy} onClick={async () => { setBusy(true); const result = demo ? { success: true } : await callServerAction(() => removeWishPhotoAction(wishId)); if (result.success) { setOverride(false); setRemoving(false); } else setError('No pudimos quitar la foto.'); setBusy(false); }}>Sí, quitar foto</button><button className="paper-text-button" onClick={() => setRemoving(false)}>Conservar foto</button></div>)}
    </>}{error && <p role="alert" className="workshop-error">{error}</p>}
  </div>;
}
