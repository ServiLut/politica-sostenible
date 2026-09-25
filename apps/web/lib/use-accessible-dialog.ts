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
let dashboardScrollLock: { element: HTMLElement; overflow: string } | null = null;

export function dialogTabDestination(
  count: number,
  activeIndex: number,
  shiftKey: boolean,
): number | null {
  if (count === 0) return -1;
  if (shiftKey && activeIndex <= 0) return count - 1;
  if (!shiftKey && (activeIndex < 0 || activeIndex === count - 1)) return 0;
  return null;
}

export function moveDialogTabFocus(
  elements: ReadonlyArray<Pick<HTMLElement, "focus">>,
  container: Pick<HTMLElement, "focus">,
  activeIndex: number,
  event: Pick<KeyboardEvent, "shiftKey" | "preventDefault">,
): void {
  const destination = dialogTabDestination(elements.length, activeIndex, event.shiftKey);
  if (destination === null) return;
  event.preventDefault();
  // Keyboard traversal must reveal an off-screen control within the dialog.
  // Initial focus and returning to the opener retain their separate scroll policy.
  (destination === -1 ? container : elements[destination]).focus();
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
      (element.offsetParent !== null || element.getClientRects().length > 0),
  );
}

interface AccessibleDialogOptions {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  restoreFocusRef?: RefObject<boolean>;
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
  restoreFocusRef,
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
      const dashboard = document.getElementById("dashboard-content");
      if (dashboard) {
        dashboardScrollLock = { element: dashboard, overflow: dashboard.style.overflow };
        dashboard.style.overflow = "hidden";
      }
    }
    scrollLocks += 1;

    function focusInside() {
      const container = containerRef.current;
      if (!container || DIALOG_STACK.at(-1)?.token !== token) return;
      const initial = initialFocusRef?.current;
      const target =
        initial && container.contains(initial) && !initial.hasAttribute("disabled")
          ? initial
          : focusableElements(container).at(0) ?? container;
      target.focus({ preventScroll: true });
    }
    const focusFrame = window.requestAnimationFrame(focusInside);

    function containFocus(event: FocusEvent) {
      if (DIALOG_STACK.at(-1)?.token !== token) return;
      const container = containerRef.current;
      if (container && event.target instanceof Node && !container.contains(event.target)) focusInside();
    }

    function preventBackgroundScroll(event: Event) {
      if (DIALOG_STACK.at(-1)?.token !== token) return;
      const container = containerRef.current;
      if (container && event.target instanceof Node && !container.contains(event.target)) event.preventDefault();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (DIALOG_STACK.at(-1)?.token !== token) return;
      const container = containerRef.current;
      if (!container) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (closeOnEscapeRef.current) closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusableElements(container);
      const active = document.activeElement;
      const activeIndex = elements.indexOf(active as HTMLElement);
      moveDialogTabFocus(elements, container, activeIndex, event);
    }

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", containFocus, true);
    document.addEventListener("wheel", preventBackgroundScroll, { passive: false, capture: true });
    document.addEventListener("touchmove", preventBackgroundScroll, { passive: false, capture: true });
    // This is a boolean policy, not a DOM ref: navigation may change it just
    // before closing, so intentionally read the latest value during cleanup.
    const shouldRestoreFocus = () => restoreFocusRef?.current !== false;
    const currentReturnFocus = () => returnFocusRef?.current;
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", containFocus, true);
      document.removeEventListener("wheel", preventBackgroundScroll, true);
      document.removeEventListener("touchmove", preventBackgroundScroll, true);
      const index = DIALOG_STACK.findLastIndex((entry) => entry.token === token);
      if (index >= 0) DIALOG_STACK.splice(index, 1);
      scrollLocks = Math.max(0, scrollLocks - 1);
      if (scrollLocks === 0) {
        document.body.style.overflow = previousBodyOverflow;
        if (dashboardScrollLock) dashboardScrollLock.element.style.overflow = dashboardScrollLock.overflow;
        dashboardScrollLock = null;
      }
      window.requestAnimationFrame(() => {
        const remainingDialog = DIALOG_STACK.at(-1)?.containerRef.current;
        if (
          shouldRestoreFocus() &&
          previousFocus?.isConnected &&
          previousFocus.getClientRects().length > 0 &&
          (!remainingDialog || remainingDialog.contains(previousFocus)) &&
          !previousFocus.hasAttribute("disabled") &&
          previousFocus.getAttribute("aria-hidden") !== "true"
        ) {
          previousFocus.focus({ preventScroll: true });
        } else {
          const fallback = currentReturnFocus();
          if (
            shouldRestoreFocus() && fallback?.isConnected &&
            fallback.getClientRects().length > 0 &&
            (!remainingDialog || remainingDialog.contains(fallback)) &&
            !fallback.matches(":disabled") &&
            !fallback.closest('[hidden], [inert], [aria-hidden="true"]')
          ) fallback.focus({ preventScroll: true });
        }
      });
    };
  }, [containerRef, initialFocusRef, open, restoreFocusRef, returnFocusRef]);
}
