"use client";

import { useEffect, useRef } from "react";

/**
 * After an in-app view change, moves focus to the view's main heading (so
 * screen readers announce the new screen and keyboard users start there) and
 * names the document after it. The first render keeps the browser's focus.
 */
export function useViewFocus(view: string, title: string) {
  const first = useRef(true);
  useEffect(() => {
    document.title = `${title} · Papelito`;
    if (first.current) {
      first.current = false;
      return;
    }
    const frame = requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>("#app-content h1");
      if (!heading) return;
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [view, title]);
}
