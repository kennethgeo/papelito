'use client';
import { useEffect, useState } from 'react';

const ORGANIZER_STEPS = [
  ['Reuní a tu gente.', 'Creá un intercambio con fecha y presupuesto. Después compartí el enlace o QR para que cada persona se inscriba.'],
  ['Dejá unas ideas para regalar.', 'En Mis deseos guardás tus ideas y elegís en cuáles grupos compartirlas. Tus gustos y tallas son opcionales.'],
  ['Un nombre para cada persona.', 'Aprobás a quienes se inscriben y hacés el sorteo. Cada persona abre su propio papelito; nadie ve los demás, ni vos.'],
  ['Volvé cuando lo necesités.', 'Tu asignación queda guardada. En Mi cuenta podés instalar la app, activar recordatorios y consultar ayuda.'],
] as const;
const PARTICIPANT_STEPS = [
  ['Ya estás en el intercambio.', 'Si el grupo pide aprobación, quien organiza confirma tu lugar. Lo vas a ver en Mis intercambios.'],
  ['Dejá unas ideas para regalar.', 'En Mis deseos guardás tus ideas y elegís en cuáles grupos compartirlas. Solo las ve quien te regala.'],
  ['Abrí tu papelito.', 'Después del sorteo, entrá al grupo y tocá «Abrir mi papelito». Solo vos ves a quién le regalás.'],
  ['Volvé cuando lo necesités.', 'En Mi cuenta podés instalar la app, activar recordatorios y consultar ayuda.'],
] as const;

/**
 * Short first-time guide. It opens by itself only on the list of exchanges
 * (not on every screen) and adapts to whether the person organizes or joins.
 * «Ver guía inicial» in Mi cuenta reopens it anywhere.
 */
export function ContextualGuide({ view, role }: { view: string; role: 'organizer' | 'participant' }) {
  const [open, setOpen] = useState(false), [step, setStep] = useState(0), [manual, setManual] = useState(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) { try { setOpen(localStorage.getItem('papelito-guide-seen') !== 'yes'); } catch {} } });
    const show = () => { setStep(0); setManual(true); setOpen(true); };
    window.addEventListener('papelito-show-guide', show);
    return () => { active = false; window.removeEventListener('papelito-show-guide', show); };
  }, []);
  function close() { setOpen(false); setManual(false); try { localStorage.setItem('papelito-guide-seen', 'yes'); } catch {} }
  if (!open || (!manual && view !== 'intercambios_lista')) return null;
  const steps = role === 'participant' ? PARTICIPANT_STEPS : ORGANIZER_STEPS;
  return <aside className="contextual-guide" aria-label="Guía de Papelito"><p className="field-help">Una pequeña guía · {step + 1} de {steps.length}</p><h2>{steps[step][0]}</h2><p>{steps[step][1]}</p><div className="workshop-actions"><button className="paper-button" onClick={() => step + 1 === steps.length ? close() : setStep(step + 1)}>{step + 1 === steps.length ? '¡Listo!' : 'Siguiente'}</button><button className="paper-text-button" onClick={close}>Omitir guía</button></div></aside>;
}
