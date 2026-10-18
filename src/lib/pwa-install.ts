"use client";

export interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let deferred: InstallPrompt | null = null;
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
