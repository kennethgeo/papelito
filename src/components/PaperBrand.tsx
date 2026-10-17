import React from 'react';

export function PaperBrand({ size = 'md', withText = true, className = '' }: { size?: 'sm' | 'md' | 'lg'; withText?: boolean; className?: string }) {
  return (
    <span className={`paper-brand paper-brand--${size} ${className}`} aria-label="Papelito, amigo secreto">
      <svg viewBox="0 0 52 54" fill="none" aria-hidden="true">
        <path d="m9 4 31 3-2 45-7-3-5 3-6-4-6 3-8-4z" fill="#F7D85B" stroke="#46245D" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M16 24c3-4 6-4 9 0m5 1c3-4 6-4 9 0" stroke="#46245D" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M22 35c3 3 6 3 9 0" stroke="#46245D" strokeWidth="2.5" strokeLinecap="round" />
        <path d="m39 8-2 9 9 1" fill="#D6C3EA" stroke="#46245D" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
      {withText && <span className="paper-wordmark">papelito<span className="wordmark-dot">.</span></span>}
    </span>
  );
}
