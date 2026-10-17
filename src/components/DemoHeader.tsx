'use client';
import React from 'react';
import { RibbonLogo } from './RibbonLogo';
import { useDemoData } from '@/context/DemoDataContext';

export function DemoHeader({ onLogoClick }: { onLogoClick?: () => void }) {
  const { userProfile, navigateTo } = useDemoData();
  return <header className="paper-header">
    <div className="paper-demo-notice" role="status">Estás en la demo. Los nombres y regalos son de ejemplo.</div>
    <div className="paper-header-inner">
      <button className="paper-brand-button" onClick={onLogoClick || (() => navigateTo('intercambios_lista'))} aria-label="Papelito: ir a mis intercambios"><RibbonLogo size="sm" /></button>
      <button className="paper-account-button" onClick={() => navigateTo('cuenta_perfil')} aria-label={`Perfil de ${userProfile.alias}`}><span className="paper-avatar">{userProfile.alias.charAt(0)}</span><span>{userProfile.alias}</span></button>
    </div>
  </header>;
}
