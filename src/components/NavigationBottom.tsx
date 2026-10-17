'use client';
import React from 'react';
import type { ActiveTab } from '@/types';

export function NavigationBottom({ activeTab, onTabChange }: { activeTab: ActiveTab; onTabChange: (tab: ActiveTab) => void }) {
  return <nav className="paper-navigation" aria-label="Navegación principal">
    <button onClick={() => onTabChange('intercambios')} aria-current={activeTab === 'intercambios' ? 'page' : undefined}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v14H3zM3 7l9 7 9-7M7 7V3h10v4" /></svg><span>Intercambios</span></button>
    <button onClick={() => onTabChange('deseos')} aria-current={activeTab === 'deseos' ? 'page' : undefined}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h5" /></svg><span>Mis deseos</span></button>
    <button onClick={() => onTabChange('cuenta')} aria-current={activeTab === 'cuenta' ? 'page' : undefined}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></svg><span>Mi cuenta</span></button>
  </nav>;
}
