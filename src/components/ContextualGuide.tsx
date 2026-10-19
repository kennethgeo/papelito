'use client';
import { useEffect, useState } from 'react';
const STEPS = [
  ['Reuní a tu gente.', 'Creá un intercambio con fecha y presupuesto. Después compartí el enlace o QR para que cada persona se inscriba.'],
  ['Dejá unas ideas para regalar.', 'En Mis deseos guardás tus ideas y elegís en cuáles grupos compartirlas. Tus gustos y tallas son opcionales.'],
  ['Un nombre para cada persona.', 'Quien organiza aprueba participantes y realiza el sorteo. Entrá al grupo para abrir tu papelito y consultar a quién le regalás.'],
  ['Volvé cuando lo necesités.', 'Tu asignación queda guardada. En Mi cuenta podés instalar la app, activar recordatorios y consultar ayuda.'],
];
export function ContextualGuide() {
  const [open, setOpen] = useState(false), [step, setStep] = useState(0);
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) { try { setOpen(localStorage.getItem('papelito-guide-seen') !== 'yes'); } catch {} } });
    const show = () => { setStep(0); setOpen(true); }; window.addEventListener('papelito-show-guide', show);
    return () => { active = false; window.removeEventListener('papelito-show-guide', show); };
  }, []);
  function close() { setOpen(false); try { localStorage.setItem('papelito-guide-seen', 'yes'); } catch {} }
  if (!open) return null;
  return <aside className="contextual-guide" aria-label="Guía de Papelito"><p className="field-help">Una pequeña guía · {step + 1} de {STEPS.length}</p><h2>{STEPS[step][0]}</h2><p>{STEPS[step][1]}</p><div className="workshop-actions"><button className="paper-button" onClick={() => step + 1 === STEPS.length ? close() : setStep(step + 1)}>{step + 1 === STEPS.length ? '¡Listo!' : 'Siguiente'}</button><button className="paper-text-button" onClick={close}>Omitir guía</button></div></aside>;
}
