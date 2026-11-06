"use client";

export interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let deferred: InstallPrompt | null = null;
export const INSTALL_WELCOME_KEY = 'papelito-install-welcome-v1';
export const DEMO_INSTALL_WELCOME_KEY = 'papelito-demo-install-welcome-v1';
export function isRunningInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    !!(navigator as Navigator & { standalone?: boolean }).standalone;
}
export function rememberInstallWelcome(key = INSTALL_WELCOME_KEY) {
  try { localStorage.setItem(key, 'yes'); } catch { /* Storage is optional. */ }
}
const subscribers = new Set<() => void>();
export const getInstallPrompt = () => deferred;
export const noInstallPrompt = () => null;
export function subscribeInstallPrompt(listener: () => void) {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}
export function setInstallPrompt(event: InstallPrompt | null) {
  deferred = event;
  for (const notify of subscribers) notify();
}
