'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useOptionalRealData } from '@/context/RealDataContext';
import { anonymousThreadsAction, sendAnonymousMessageAction } from '@/lib/data/social-actions';
import { callServerAction } from '@/lib/client-actions';
import type { AnonymousThread } from '@/lib/repositories/social';

export function AnonymousMessages({ exchangeId, version }: { exchangeId: string; version: number }) {
  const fieldId = useId();
  const real = useOptionalRealData();
  const isReal = !!real;
  const [threads, setThreads] = useState<AnonymousThread[]>([]);
  const [direction, setDirection] = useState<'giving' | 'receiving'>('giving');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    if (!isReal) {
      try { const stored = localStorage.getItem(`papelito-demo-messages:${exchangeId}:${version}`);
        setThreads(stored ? JSON.parse(stored) : [{ id: 'demo-giving', direction: 'giving', messages: [] }, { id: 'demo-receiving', direction: 'receiving', messages: [] }]);
      } catch { setError('No pudimos cargar la conversación de demo.'); }
      return;
    }
    const res = await callServerAction(() => anonymousThreadsAction(exchangeId));
    if (request !== generation.current) return;
    if (res.success && res.data) { setThreads(res.data); setError(''); }
    else setError(res.error || 'No pudimos actualizar los mensajes.');
  }, [exchangeId, version, isReal]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void load(); }); return () => { active = false; invalidate(); }; }, [load, invalidate]);
  const thread = threads.find(t => t.direction === direction);
  async function send(e: React.FormEvent) {
    e.preventDefault(); if (!thread || busy || !drafts[thread.id]?.trim()) return;
    setBusy(true); setError(''); setStatus('');
    try {
      if (isReal) {
        const res = await callServerAction(() => sendAnonymousMessageAction(exchangeId, thread.id, drafts[thread.id]));
        if (!res.success) { setError(res.error || 'No pudimos enviar el mensaje.'); return; }
      } else {
        const next = threads.map(t => t.id === thread.id ? { ...t, messages: [...t.messages, { id: crypto.randomUUID(), body: drafts[thread.id].trim(), mine: true, createdAt: new Date().toISOString() }] } : t);
        localStorage.setItem(`papelito-demo-messages:${exchangeId}:${version}`, JSON.stringify(next));
      }
      setDrafts(current => ({ ...current, [thread.id]: '' })); await load(); setStatus(isReal ? 'Mensaje enviado.' : 'Mensaje guardado solo en esta demo.');
    } catch { setError('No se pudo enviar. Conservamos tu mensaje.'); }
    finally { setBusy(false); }
  }
  return <section className="workshop-sheet anonymous-sheet">
    <h2>Mensajitos entre papelitos.</h2>
    <p>Preguntá por una talla o una pista. Tu identidad permanece oculta cuando sos quien regala.</p>
    {!isReal && <p className="field-help">Demostración local: estos mensajes no llegan a otras personas.</p>}
    <div className="message-tabs" role="group" aria-label="Conversaciones privadas">
      <button className="paper-outline-button" aria-pressed={direction === 'giving'} onClick={() => setDirection('giving')}>A quien le regalo</button>
      <button className="paper-outline-button" aria-pressed={direction === 'receiving'} onClick={() => setDirection('receiving')}>Quien me regala</button>
    </div>
    <p className="field-help">{direction === 'receiving' ? 'Conversás con tu amigo secreto. No mostramos su nombre.' : 'La otra persona verá «Tu amigo secreto», sin tu nombre.'} No incluyás tu nombre si querés mantener la sorpresa.</p>
    <button className="paper-text-button" disabled={busy} onClick={() => { setStatus(''); void load(); }}>Actualizar mensajes</button>
    <div className="message-list" aria-label="Historial de mensajes">
      {thread?.messages.map(m => <article key={m.id} className={`message-bubble ${m.mine ? 'mine' : ''}`}>
        <strong>{m.mine ? 'Vos' : direction === 'receiving' ? 'Tu amigo secreto' : 'La persona a quien regalás'}</strong>
        <p>{m.body}</p><time dateTime={m.createdAt}>{new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(m.createdAt))}</time>
      </article>)}
      {thread?.messages.length === 0 && <p className="message-empty">Un pequeño mensaje puede dar una gran pista.</p>}
    </div>
    {thread && <form onSubmit={send}>
      <div className="workshop-field"><label htmlFor={fieldId}>Tu mensaje</label>
        <textarea id={fieldId} rows={3} maxLength={1000} value={drafts[thread.id] || ''} onChange={e => setDrafts({ ...drafts, [thread.id]: e.target.value })} disabled={busy} />
      </div>
      <button className="paper-button" disabled={busy || !drafts[thread.id]?.trim()}>{busy ? 'Enviando…' : 'Enviar mensaje'}</button>
    </form>}
    {error && <p role="alert" className="workshop-error">{error}</p>}{status && <p role="status">{status}</p>}
  </section>;
}
