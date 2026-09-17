"use client";

import { type RefObject, useEffect, useRef } from "react";

interface DialogStackEntry {
  token: symbol;
  containerRef: RefObject<HTMLElement | null>;
}

const DIALOG_STACK: DialogStackEntry[] = [];
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");
let scrollLocks = 0;
let previousBodyOverflow = "";

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      element.getAttribute("aria-hidden") !== "true" &&
      (element.offsetParent !== null || element.getClientRects().length > 0),
  );
}

interface AccessibleDialogOptions {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  closeOnEscape?: boolean;
}

/**
 * Gives an already-rendered modal the keyboard behavior required by ARIA:
 * stack-aware focus containment, initial focus, Escape and trigger restore.
 */
export function useAccessibleDialog({
  open,
  containerRef,
  initialFocusRef,
  returnFocusRef,
  onClose,
  closeOnEscape = true,
}: AccessibleDialogOptions): void {
  const closeRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);

  useEffect(() => {
    closeRef.current = onClose;
    closeOnEscapeRef.current = closeOnEscape;
  }, [closeOnEscape, onClose]);

  useEffect(() => {
    if (!open) return;
    const token = Symbol("accessible-dialog");
    const activeElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousFocus =
      activeElement && activeElement !== document.body
        ? activeElement
        : (returnFocusRef?.current ?? activeElement);
    DIALOG_STACK.push({ token, containerRef });
    if (scrollLocks === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    scrollLocks += 1;

    const focusFrame = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container || DIALOG_STACK.at(-1)?.token !== token) return;
      const target =
        initialFocusRef?.current ?? focusableElements(container).at(0) ?? container;
      target.focus({ preventScroll: true });
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (DIALOG_STACK.at(-1)?.token !== token) return;
      const container = containerRef.current;
      if (!container) return;
      if (event.key === "Escape") {
        if (!closeOnEscapeRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusableElements(container);
      if (elements.length === 0) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement;
      const activeIndex = elements.indexOf(active as HTMLElement);
      if (event.shiftKey && activeIndex <= 0) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (activeIndex < 0 || activeIndex === elements.length - 1)
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown, true);
      const index = DIALOG_STACK.findLastIndex((entry) => entry.token === token);
      if (index >= 0) DIALOG_STACK.splice(index, 1);
      scrollLocks = Math.max(0, scrollLocks - 1);
      if (scrollLocks === 0) document.body.style.overflow = previousBodyOverflow;
      window.requestAnimationFrame(() => {
        const remainingDialog = DIALOG_STACK.at(-1)?.containerRef.current;
        if (
          previousFocus?.isConnected &&
          (!remainingDialog || remainingDialog.contains(previousFocus)) &&
          !previousFocus.hasAttribute("disabled") &&
          previousFocus.getAttribute("aria-hidden") !== "true"
        ) {
          previousFocus.focus({ preventScroll: true });
        }
      });
    };
  }, [containerRef, initialFocusRef, open, returnFocusRef]);
}
