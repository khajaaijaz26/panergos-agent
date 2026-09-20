import { useCallback, useEffect, useRef } from "react";

/**
 * Hook that adds standard modal behaviors when `open` is true:
 * - Escape key calls `onClose`
 * - Body scroll is locked
 * - Focus stays inside the modal and returns to the opener on close
 */
export function useModalBehavior({
  initialFocus,
  open,
  onClose,
}: {
  initialFocus?: string;
  open: boolean;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const setContainerRef = useCallback((node: HTMLElement | null) => {
    containerRef.current = node;
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const prevActive = document.activeElement as HTMLElement | null;

    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const ownedRoots = () => {
      const id = containerRef.current?.id;
      return id
        ? Array.from(document.querySelectorAll<HTMLElement>(`[data-modal-owner="${id}"]`))
        : [];
    };
    const focusable = () =>
      [containerRef.current, ...ownedRoots()]
        .flatMap((root) => Array.from(root?.querySelectorAll<HTMLElement>(selector) ?? []))
        .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
    const owns = (node: Element | null) =>
      Boolean(
        node &&
          (containerRef.current?.contains(node) || ownedRoots().some((root) => root.contains(node))),
      );
    const shouldDeferToActiveModal = () => {
      const active = document.activeElement;
      if (owns(active)) return false;
      return Array.from(
        document.querySelectorAll<HTMLElement>(
          '[aria-modal="true"], [role="dialog"], [role="alertdialog"]',
        ),
      ).some(
        (modal) =>
          modal !== containerRef.current &&
          !modal.hidden &&
          modal.getAttribute("aria-hidden") !== "true" &&
          Boolean(active && modal.contains(active)),
      );
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (shouldDeferToActiveModal()) return;
      if (e.key === "Escape") {
        if (containerRef.current?.querySelector('[data-modal-child-open="true"]')) return;
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        containerRef.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !owns(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !owns(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (
      (initialFocus
        ? containerRef.current?.querySelector<HTMLElement>(initialFocus)
        : null) ??
      focusable()[0] ??
      containerRef.current
    )?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [initialFocus, open]);

  return setContainerRef;
}
