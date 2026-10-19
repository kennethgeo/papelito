'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function InvitationQR({ url, name }: { url: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    if (!open || !url) return;
    QRCode.toDataURL(new URL(url, window.location.origin).href, { width: 360, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#46245D', light: '#FFFFFF' } })
      .then(value => { if (active) { setImage(value); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [url, open]);
  return <div className="invitation-qr">
    <button className="paper-outline-button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Ocultar QR' : 'Mostrar QR de invitación'}</button>
    {open && <div className="qr-paper">
      <strong>Escaneá y sumate.</strong>
      {/* QR is generated locally; the private invitation never goes to a QR service. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image && <img src={image} width={280} height={280} alt={`Código QR para unirse a ${name}`} />}
      <p>{name}</p><small>Este QR da acceso al enlace de invitación. Compartilo solo con tu grupo.</small>
      {image && <a className="paper-text-button" href={image} download="papelito-invitacion.png">Descargar QR</a>}
      {failed && <p role="alert">No pudimos crear el QR. Podés compartir el enlace.</p>}
    </div>}
  </div>;
}
