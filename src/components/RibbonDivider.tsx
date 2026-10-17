import React from 'react';
export function RibbonDivider({ color = '#BCA9C9', className = '' }: { color?: string; accentColor?: string; className?: string }) {
  return <div className={`ribbon-divider ${className}`} aria-hidden="true" style={{ borderTop: `1px dashed ${color}`, margin: '1.7rem 0' }} />;
}
