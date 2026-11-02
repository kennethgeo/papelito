"use client";

import { useEffect } from "react";

const EDITABLE = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"]), textarea, select, [contenteditable="true"]';

/**
 * Marks <html data-keyboard="open"> only while an on-screen keyboard is
 * actually covering the page: an editable control has focus AND the visual
 * viewport shrank noticeably. Focusing a field on a desktop (no shrink) or
 * tapping a button never hides the bottom navigation.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => {
      const active = document.activeElement;
      const editing = !!active && active instanceof HTMLElement && active.matches(EDITABLE);
      const covered = window.innerHeight - viewport.height > 150;
      if (editing && covered) root.dataset.keyboard = "open";
      else delete root.dataset.keyboard;
    };
    viewport.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      delete root.dataset.keyboard;
    };
  }, []);
}
