'use client';

import { useEffect, useId, useRef } from 'react';
import { InstallGuide } from './InstallGuide';
import { RibbonLogo } from './RibbonLogo';
import { DEMO_INSTALL_WELCOME_KEY, INSTALL_WELCOME_KEY, isRunningInstalled, rememberInstallWelcome } from '@/lib/pwa-install';

/** One invitation per browser; no account identifiers or server writes. */
export function InstallWelcome({ eligible, demo = false }: { eligible: boolean; demo?: boolean }) {
  const storageKey = demo ? DEMO_INSTALL_WELCOME_KEY : INSTALL_WELCOME_KEY;
  const dialog = useRef<HTMLDialogElement>(null);
  const attempted = useRef(false);
  const titleId = useId(), descriptionId = useId();
  useEffect(() => {
    if (!eligible) { dialog.current?.close(); return; }
    const node = dialog.current;
    let active = true;
    const media = window.matchMedia('(display-mode: standalone)');
    const minimal = window.matchMedia('(display-mode: minimal-ui)');
    const installed = () => {
      rememberInstallWelcome();
      rememberInstallWelcome(storageKey);
      node?.close();
    };
    const modeChanged = () => { if (isRunningInstalled()) installed(); };
    queueMicrotask(() => {
      if (!active || attempted.current) return;
      attempted.current = true;
      if (isRunningInstalled()) { installed(); return; }
      try { if (localStorage.getItem(storageKey) === 'yes') return; } catch { /* Still offer once in this visit. */ }
      if (!node?.isConnected || node.open) return;
      node.showModal();
      rememberInstallWelcome(storageKey);
    });
    window.addEventListener('appinstalled', installed);
    media.addEventListener('change', modeChanged);
    minimal.addEventListener('change', modeChanged);
    return () => {
      active = false;
      window.removeEventListener('appinstalled', installed);
      media.removeEventListener('change', modeChanged);
      minimal.removeEventListener('change', modeChanged);
      node?.close();
    };
  }, [eligible, storageKey]);
  return <dialog ref={dialog} className="install-welcome" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); dialog.current?.close(); }}>
    <RibbonLogo size="sm" />
    <div className="install-welcome-icon" aria-hidden="true">
      <svg viewBox="0 0 64 76" width="64" height="76" fill="none"><rect x="12" y="3" width="40" height="69" rx="8" fill="#fffefc" stroke="currentColor" strokeWidth="2"/><path d="M25 9h14M29 65h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M22 25h20v25H22z" fill="#f7db59" stroke="currentColor" strokeWidth="1.5"/><path d="m27 37 4 4 7-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </div>
    <h2 id={titleId}>Tu papelito, a un toque.</h2>
    <p id={descriptionId}>Instalá Papelito para abrir tu intercambio desde la pantalla de inicio, sin buscar el enlace.</p>
    <InstallGuide compact />
    <button className="paper-text-button install-welcome-later" onClick={() => dialog.current?.close()}>Ahora no</button>
    <p className="field-help">Podés instalarla después desde Mi cuenta. Las notificaciones se activan aparte, cuando vos lo decidás.</p>
  </dialog>;
}
