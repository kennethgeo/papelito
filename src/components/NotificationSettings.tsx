'use client';
import { useEffect, useState } from 'react';
import { useOptionalRealData } from '@/context/RealDataContext';
import { pushSettingsAction, subscribePushAction, unsubscribePushAction, testPushAction } from '@/lib/data/social-actions';
import { callServerAction, callServerRead } from '@/lib/client-actions';

export function NotificationSettings({ embedded = false }: { embedded?: boolean }) {
  const real = useOptionalRealData();
  const userId = real?.user?.id;
  const isReal = !!real;
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      const can = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
      setSupported(can);
      if (!can) return;
      setPermission(Notification.permission);
      if (!isReal) return;
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const sub = await registration?.pushManager.getSubscription();
        const result = await callServerRead(() => pushSettingsAction(sub?.endpoint));
        if (!active) return;
        if (result.success && result.data) { setConfigured(result.data.configured); setEnabled(!!sub && result.data.subscribed && Notification.permission === 'granted'); }
        else setError(result.error || 'No pudimos consultar tus avisos.');
      } catch { if (active) setError('No pudimos consultar este dispositivo.'); }
    }
    queueMicrotask(() => { if (active) void load(); }); return () => { active = false; };
  }, [userId, isReal]);
  async function enable() {
    if (!real) { setStatus('En la demo no se solicitan permisos ni se envían avisos. Entrá con tu cuenta para activarlos.'); return; }
    if (!configured || busy) return;
    setBusy(true); setError(''); setStatus('');
    // Must be called directly from the click, before any awaited network work (Safari requirement).
    const permissionRequest = Notification.permission === 'granted' ? Promise.resolve('granted' as const) : Notification.requestPermission();
    try {
      const result = await permissionRequest; setPermission(result);
      if (result !== 'granted') { setStatus('No activamos avisos. Podés cambiar el permiso en los ajustes del navegador.'); return; }
      const settings = await callServerRead(() => pushSettingsAction());
      if (!settings.success || !settings.data?.publicKey) throw new Error('No pudimos preparar los avisos.');
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.active) throw new Error('La app todavía se está preparando. Recargá e intentá de nuevo.');
      if (registration.waiting) throw new Error('Hay una nueva versión pendiente. Pulsá «Actualizar ahora» antes de activar los avisos.');
      const key = settings.data.publicKey.replace(/-/g, '+').replace(/_/g, '/');
      const bytes = Uint8Array.from(atob(key), c => c.charCodeAt(0));
      const sub = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      const saved = await callServerAction(() => subscribePushAction(sub.toJSON()));
      if (!saved.success) throw new Error(saved.error);
      setEnabled(true); setStatus('Notificaciones activadas en este dispositivo.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos activar las notificaciones.'); }
    finally { setBusy(false); }
  }
  async function disable() {
    if (busy) return; setBusy(true); setError(''); setStatus('');
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const sub = await registration?.pushManager.getSubscription();
      if (sub) { const result = await callServerAction(() => unsubscribePushAction(sub.endpoint)); if (!result.success) throw new Error(result.error); await sub.unsubscribe(); }
      setEnabled(false); setStatus('Notificaciones desactivadas en este dispositivo.');
    } catch { setError('No pudimos confirmar la desactivación. Intentá de nuevo.'); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setError(''); setStatus('');
    try {
      const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
      if (!sub) throw new Error('No hay una suscripción activa en este dispositivo.');
      const result = await callServerAction(() => testPushAction(sub.endpoint));
      if (result.success && result.data?.delivered) setStatus('Enviamos un aviso de prueba. Revisá tus notificaciones.');
      else setError('No se confirmó un envío. Si acabás de probar, esperá un minuto; también podés desactivar y volver a activar.');
    } catch { setError('No pudimos enviar la prueba. Revisá que los avisos estén activos.'); }
    finally { setBusy(false); }
  }
  return <section className={embedded ? 'notification-settings' : 'workshop-sheet notification-sheet'}>
    <h2>Que no se pierda un mensajito.</h2>
    <p>Recibí notificaciones cuando llegue una pregunta o una respuesta, incluso con la app cerrada. También te avisamos antes del cierre de inscripción y de la entrega.</p>
    <p className="field-help">Los avisos no muestran nombres ni mensajes privados. Se activan por dispositivo y podés apagarlos cuando querás.</p>
    <p className="field-help">Instalar Papelito no activa las notificaciones por sí solo. En iPhone o iPad, abrí la app desde su ícono para activarlas. La entrega depende de la conexión y los ajustes de tu teléfono.</p>
    <p className="field-help">Al activarlos, guardamos la suscripción de este navegador y usamos su proveedor de notificaciones para entregarlos.</p>
    {!supported ? <p>Este navegador todavía no permite estos avisos. En iPhone o iPad, instalá Papelito en la pantalla de inicio y abrilo desde su ícono.</p> : <>
      <p>{enabled ? 'Activados en este dispositivo.' : permission === 'denied' ? 'El navegador bloqueó las notificaciones. Permitilas desde los ajustes del sitio.' : 'Solo pedimos permiso cuando decidís activarlos.'}</p>
      {real && !configured && <p className="field-help">Los avisos aún no están disponibles en este entorno.</p>}
      <div className="workshop-actions">
        <button className="paper-button" disabled={busy || (!!real && (!configured || (!enabled && permission === 'denied')))} onClick={() => void (enabled ? disable() : enable())}>{busy ? 'Un momento…' : enabled ? 'Desactivar notificaciones' : 'Activar notificaciones'}</button>
        {enabled && <button className="paper-outline-button" disabled={busy} onClick={() => void test()}>Enviar aviso de prueba</button>}
      </div>
    </>}
    {status && <p role="status">{status}</p>}{error && <p role="alert" className="workshop-error">{error}</p>}
  </section>;
}
