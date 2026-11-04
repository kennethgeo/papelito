'use client';

import { useEffect, useRef, useState } from 'react';
import { RecentLoginGate } from '@/components/RecentLoginGate';
import { consumeOpenSection } from '@/lib/view-history';
import { useOptionalRealData } from '@/context/RealDataContext';
import type { Exchange } from '@/types';

export function ExchangeLifecycleControls({ exchange }: { exchange: Exchange }) {
  const real = useOptionalRealData();
  const [operation, setOperation] = useState<'finalizado' | 'cancelado' | 'transfer' | 'delete' | null>(null);
  const [target, setTarget] = useState('');
  const [typedName, setTypedName] = useState('');
  const [confirmIrreversible, setConfirmIrreversible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const [panelOpen, setPanelOpen] = useState(false);
  // Back from «Volver a ingresar»: reopen the deletion form.
  useEffect(() => { if (consumeOpenSection('eliminar')) queueMicrotask(() => { setPanelOpen(true); setOperation('delete'); }); }, []);
  if (!real) return null;
  const closed = exchange.status === 'finalizado' || exchange.status === 'cancelado';
  // Only people with their own account can organize (never a represented alias).
  const candidates = exchange.participants.filter(p => p.status === 'approved' && !p.isOrganizer && !p.represented);

  async function confirm() {
    if (!real || !operation || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = operation === 'delete'
        ? await real.deleteExchange(exchange.id, { name: typedName, status: exchange.status, memberCount: exchange.participants.length, confirmIrreversible })
        : operation === 'transfer'
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
    {exchange.isCurrentUserOrganizer && <details open={panelOpen} onToggle={(e) => setPanelOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Administrar este intercambio</summary>
      <p>Podés cerrar, transferir o eliminar definitivamente este intercambio.</p>
      <div className="management-actions">
        {!closed && <>
          {exchange.status === 'sorteado' && <button className="management-button" disabled={busy} onClick={() => { setOperation('finalizado'); setError(''); }}>Finalizar intercambio</button>}
          <button className="management-button danger" disabled={busy} onClick={() => { setOperation('cancelado'); setError(''); }}>Cancelar intercambio</button>
        </>}
        {candidates.length > 0 && <button className="management-button" disabled={busy} onClick={() => { setOperation('transfer'); setError(''); }}>Transferir organización</button>}
        <button className="management-button danger" disabled={busy} onClick={() => { setOperation('delete'); setTypedName(''); setConfirmIrreversible(false); setError(''); }}>Eliminar intercambio</button>
      </div>
      {operation && <div className="management-note">
        {operation === 'delete' ? <RecentLoginGate purpose="eliminar un intercambio" returnTo={`/?vista=intercambio&intercambio=${encodeURIComponent(exchange.id)}&abrir=eliminar`}>
          <h3>Eliminar «{exchange.name}»</h3>
          <p>Se borrarán inmediatamente este intercambio, sus {exchange.participants.length} participantes, invitaciones, sorteos, asignaciones, mensajes y selecciones de deseos. Todos perderán acceso. Esta acción no se puede deshacer. Las cuentas y listas personales de deseos se conservan.</p>
          <p>Si querés conservar el historial, usá «Finalizar» o «Cancelar»: esos cierres se conservan 12 meses.</p>
          <label className="management-field">Escribí exactamente «{exchange.name}» para confirmar<input value={typedName} onChange={e => setTypedName(e.target.value)} autoComplete="off" disabled={busy} /></label>
          <label className="management-check"><input type="checkbox" checked={confirmIrreversible} onChange={e => setConfirmIrreversible(e.target.checked)} disabled={busy} />Entiendo que también se borrarán los datos de este grupo para las demás personas.</label>
        </RecentLoginGate> : operation === 'transfer' ? <>
          <label className="management-field">¿Quién lo organizará ahora?<select value={target} onChange={e => setTarget(e.target.value)} disabled={busy}><option value="">Elegí un participante aprobado</option>{candidates.map(p => <option key={p.id} value={p.id}>{p.alias}</option>)}</select></label>
          <p>Esta persona podrá aprobar participantes, gestionar invitaciones y ejecutar sorteos. Vos seguirás como participante y dejarás de administrar el intercambio.</p>
        </> : <p>Vas a {operation === 'finalizado' ? 'finalizar' : 'cancelar'} «{exchange.name}». Se desactivarán las invitaciones y no se podrán hacer nuevos sorteos. Este cierre no se puede deshacer.</p>}
        <div className="management-actions"><button className="management-button danger" disabled={busy || (operation === 'transfer' && !target) || (operation === 'delete' && (typedName !== exchange.name || !confirmIrreversible))} onClick={confirm} aria-busy={busy}>{busy ? 'Guardando…' : operation === 'delete' ? 'Eliminar definitivamente' : operation === 'transfer' ? 'Confirmar transferencia' : 'Confirmar cierre'}</button><button className="management-button" onClick={() => setOperation(null)} disabled={busy}>Volver</button></div>
      </div>}
      {error && <p role="alert" className="management-error">{error}</p>}
    </details>}
  </section>;
}
