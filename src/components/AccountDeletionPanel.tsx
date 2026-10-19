'use client';

import { useRef, useState } from 'react';
import { useOptionalRealData } from '@/context/RealDataContext';
import type { AccountDeletionImpact } from '@/lib/repositories/profiles';
import { LEGAL_CONSTANTS } from '@/lib/legal/constants';
import { clearOfflineCopy } from '../../public/offline-vault.js';

export function AccountDeletionPanel() {
  const real = useOptionalRealData();
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<AccountDeletionImpact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [received, setReceived] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [organizerConfirmed, setOrganizerConfirmed] = useState(false);
  const [notes, setNotes] = useState('');
  const inFlight = useRef(false);
  const pending = received || ['received', 'processing'].includes(impact?.activeDeleteRequest?.status ?? '');

  async function showImpact() {
    if (!real || inFlight.current) return;
    inFlight.current = true;
    setOpen(true);
    setBusy(true);
    setError('');
    try {
      const result = await real.getAccountDeletionImpact();
      setImpact(result);
      if (!result) setError('No pudimos revisar tus intercambios. Volvé a intentar.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!real || !impact || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await real.requestAccountDeletion({
        confirmPhrase: phrase,
        confirmIrreversible: confirmed,
        confirmOrganizerImpact: organizerConfirmed,
        notes,
      });
      if (result.success) {
        setReceived(true);
        await clearOfflineCopy().catch(() => setError('La solicitud está registrada. No pudimos borrar la copia local; podés quitarla desde «Copia sin conexión».'));
      }
      else setError(result.error || 'No se pudo registrar la solicitud.');
    } catch {
      setError('Se perdió la conexión. Revisá el estado antes de volver a enviar.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!real) return <p className="account-deletion-demo">La eliminación de cuenta está disponible al ingresar con una cuenta real.</p>;

  return (
    <section className="account-deletion-panel">
      {!open && <button className="management-button danger" onClick={showImpact}>Solicitar eliminación de cuenta</button>}
      {open && <div className="management-note">
        <h3>Antes de despedirnos</h3>
        {busy && <p role="status">{impact ? 'Registrando tu solicitud…' : 'Revisando tus intercambios…'}</p>}
        {pending ? <p role="status"><strong>Solicitud registrada.</strong> La cuenta aún no se ha eliminado. La solicitud se tramita administrativamente; podés consultar su estado en <a href={`mailto:${LEGAL_CONSTANTS.CONTACT_EMAIL}`}>{LEGAL_CONSTANTS.CONTACT_EMAIL}</a>.</p> : impact && <form onSubmit={submit}>
          <p>Al procesarla se borrarán tu acceso, perfil, deseos y datos personales de la base activa. Exportá primero los datos que quieras conservar.</p>
          {impact.soloOrganizedExchanges.length > 0 && <p>Tus intercambios sin otros participantes se eliminarán junto con la cuenta.</p>}
          {impact.participatingDrawnExchanges.length > 0 && <p><strong>Hay sorteos en curso:</strong> {impact.participatingDrawnExchanges.map(e => e.name).join(', ')}. Al eliminar tu cuenta, sus asignaciones quedarán invalidadas y el organizador deberá repetir el sorteo con las personas restantes.</p>}
          {impact.activeOrganizedWithOthers.length > 0 && <div>
            <p><strong>Estos cambios se aplicarán al enviar la solicitud:</strong></p>
            <ul>{impact.activeOrganizedWithOthers.map(e => <li key={e.id}>{e.name}: {e.otherApprovedMembers.length ? `la organización pasará a ${e.otherApprovedMembers[0].alias}` : 'se cancelará porque solo hay solicitudes pendientes'}.</li>)}</ul>
            <label className="management-check"><input type="checkbox" required checked={organizerConfirmed} onChange={e => setOrganizerConfirmed(e.target.checked)} disabled={busy} /><span>Autorizo esos cambios. También puedo cancelar esta solicitud y transferir la organización personalmente desde cada intercambio.</span></label>
          </div>}
          <label className="management-field">Notas opcionales<textarea maxLength={500} rows={2} value={notes} onChange={e => setNotes(e.target.value)} disabled={busy} /></label>
          <label className="management-check"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} /><span>Entiendo que la eliminación, cuando se procese, será irreversible en la base activa.</span></label>
          <label className="management-field">Escribí ELIMINAR MI CUENTA para confirmar<input autoComplete="off" required value={phrase} onChange={e => setPhrase(e.target.value)} disabled={busy} /></label>
          <p>Para proteger tu cuenta, tenés que haber iniciado sesión en los últimos 15 minutos.</p>
          <div className="management-actions"><button type="submit" className="management-button danger" disabled={busy || !confirmed || phrase.trim().toUpperCase() !== 'ELIMINAR MI CUENTA'} aria-busy={busy}>Confirmar y enviar solicitud</button><button type="button" className="management-button" onClick={() => setOpen(false)} disabled={busy}>Volver</button></div>
        </form>}
        {error && <p role="alert" className="management-error">{error}</p>}
        {!impact && !busy && <button className="management-button" onClick={showImpact}>Volver a revisar</button>}
      </div>}
    </section>
  );
}
