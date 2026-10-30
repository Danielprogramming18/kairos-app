import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Pure helper to compute the next focus index inside a modal focus trap.
 * Exported for deterministic unit testing.
 */
export function computeNextFocusIndex(
  currentIndex: number,
  totalCount: number,
  isShiftTab: boolean
): number {
  if (totalCount <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= totalCount) {
    return isShiftTab ? totalCount - 1 : 0;
  }
  if (isShiftTab) {
    return currentIndex === 0 ? totalCount - 1 : currentIndex - 1;
  }
  return currentIndex === totalCount - 1 ? 0 : currentIndex + 1;
}

export function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return nodes.filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
  );
}

/**
 * Accessible modal focus-trap hook:
 * - Captures the trigger element (`document.activeElement`) before opening
 * - Focuses `initialFocusSelector` (or first focusable control) inside the modal
 * - Traps `Tab` and `Shift+Tab` inside the modal container
 * - Closes on `Escape`
 * - Restores focus to the original trigger element when closed
 */
export function useModalFocusTrap<T extends HTMLElement = HTMLDivElement>(
  isOpen: boolean,
  onClose: () => void,
  initialFocusSelector?: string
) {
  const containerRef = useRef<T | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      previousFocusRef.current = document.activeElement;
    }

    const focusInitialElement = () => {
      const container = containerRef.current;
      if (!container) return;

      if (initialFocusSelector) {
        const preferred = container.querySelector<HTMLElement>(initialFocusSelector);
        if (preferred && !preferred.hasAttribute('disabled')) {
          preferred.focus();
          return;
        }
      }

      const focusables = getFocusableElements(container);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        container.focus();
      }
    };

    const rafId = window.requestAnimationFrame(focusInitialElement);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key !== 'Tab') return;

      const container = containerRef.current;
      const focusables = getFocusableElements(container);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const activeEl = document.activeElement as HTMLElement | null;
      const currentIndex = activeEl ? focusables.indexOf(activeEl) : -1;
      const nextIndex = computeNextFocusIndex(currentIndex, focusables.length, e.shiftKey);

      if (nextIndex >= 0 && focusables[nextIndex]) {
        e.preventDefault();
        focusables[nextIndex].focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', handleKeyDown, true);

      const prev = previousFocusRef.current;
      if (prev && typeof document !== 'undefined' && document.contains(prev)) {
        try {
          prev.focus();
        } catch {
          // Ignore focus restoration errors on detached nodes
        }
      }
    };
  }, [isOpen, initialFocusSelector]);

  return containerRef;
}
