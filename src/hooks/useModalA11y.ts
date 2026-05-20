import { useEffect, RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]),'
  + ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Wires the common modal accessibility behaviour onto a panel:
 *
 *  - Esc closes
 *  - Tab / Shift-Tab cycle inside the panel (focus trap)
 *  - On open, focus moves to the first focusable element inside
 *  - On close, focus is restored to whatever was focused before the modal opened
 *
 * Pair with `role="dialog" aria-modal="true" aria-labelledby="…"` on the
 * outer container so screen readers announce it correctly.
 */
export function useModalA11y(
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Defer the initial focus until after the modal is in the DOM.
    const id = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
      // Only restore if the previous element is still in the DOM and focusable.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus?.();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
