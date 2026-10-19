// Optional local display settings; no account data or tracking.
try {
  const p = JSON.parse(localStorage.getItem('papelito-accessibility') || '{}');
  document.documentElement.dataset.largeText = String(p.large === true);
  document.documentElement.dataset.highContrast = String(p.contrast === true);
  document.documentElement.dataset.reducedMotion = String(p.motion === true);
} catch { /* The system defaults remain usable when storage is blocked. */ }
