'use client';

import { useRef, useState } from 'react';
import { useOptionalRealData } from '@/context/RealDataContext';
import type { Exchange } from '@/types';

export function ExchangeLifecycleControls({ exchange }: { exchange: Exchange }) {
  const real = useOptionalRealData();
  const [operation, setOperation] = useState<'finalizado' | 'cancelado' | 'transfer' | null>(null);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  if (!real) return null;
  const closed = exchange.status === 'finalizado' || exchange.status === 'cancelado';
  const candidates = exchange.participants.filter(p => p.status === 'approved' && !p.isOrganizer);

  async function confirm() {
    if (!real || !operation || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = operation === 'transfer'
        ? await real.transferExchangeOrganizer(exchange.id, target)
        : await real.updateExchangeLifecycle(exchange.id, operation);
      if (result.success) setOperation(null);
      else setError(result.error || 'No se pudo guardar el cambio.');
    } catch {
      setError('Se perdió la conexión. Revisá el intercambio antes de intentar otra vez.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!exchange.isCurrentUserOrganizer && !closed) return null;
  return <section className="exchange-management">
    {closed && <p role="status"><strong>{exchange.status === 'finalizado' ? 'Intercambio finalizado' : 'Intercambio cancelado'}.</strong> Los enlaces de invitación están desactivados. Los datos del intercambio se eliminarán 12 meses después del cierre.</p>}
    {exchange.isCurrentUserOrganizer && <details>
      <summary>Administrar este intercambio</summary>
      <p>La organización y el cierre están en tus manos.</p>
      <div className="management-actions">
        {!closed && <>
          {exchange.status === 'sorteado' && <button className="management-button" disabled={busy} onClick={() => { setOperation('finalizado'); setError(''); }}>Finalizar intercambio</button>}
          <button className="management-button danger" disabled={busy} onClick={() => { setOperation('cancelado'); setError(''); }}>Cancelar intercambio</button>
        </>}
        {candidates.length > 0 && <button className="management-button" disabled={busy} onClick={() => { setOperation('transfer'); setError(''); }}>Transferir organización</button>}
      </div>
      {operation && <div className="management-note">
        {operation === 'transfer' ? <>
          <label className="management-field">¿Quién lo organizará ahora?<select value={target} onChange={e => setTarget(e.target.value)} disabled={busy}><option value="">Elegí un participante aprobado</option>{candidates.map(p => <option key={p.id} value={p.id}>{p.alias}</option>)}</select></label>
          <p>Esta persona podrá aprobar participantes, gestionar invitaciones y ejecutar sorteos. Vos seguirás como participante y dejarás de administrar el intercambio.</p>
        </> : <p>Vas a {operation === 'finalizado' ? 'finalizar' : 'cancelar'} «{exchange.name}». Se desactivarán las invitaciones y no se podrán hacer nuevos sorteos. Este cierre no se puede deshacer.</p>}
        <div className="management-actions"><button className="management-button danger" disabled={busy || (operation === 'transfer' && !target)} onClick={confirm} aria-busy={busy}>{busy ? 'Guardando…' : operation === 'transfer' ? 'Confirmar transferencia' : 'Confirmar cierre'}</button><button className="management-button" onClick={() => setOperation(null)} disabled={busy}>Volver</button></div>
      </div>}
      {error && <p role="alert" className="management-error">{error}</p>}
    </details>}
  </section>;
}
