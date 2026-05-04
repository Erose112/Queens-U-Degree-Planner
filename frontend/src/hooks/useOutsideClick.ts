import { useEffect, RefObject } from "react";

/**
 * Hook to detect clicks outside a referenced element and trigger a callback.
 * Useful for closing dropdowns, modals, and other overlays on outside interaction.
 *
 * @param ref - React ref to the container element to monitor
 * @param onClickOutside - Callback function when click is detected outside
 * @param enabled - Optional flag to enable/disable detection (defaults to true)
 */
export function useOutsideClick(
  ref: RefObject<HTMLDivElement | null>,
  onClickOutside: () => void,
  enabled: boolean = true
): void {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClickOutside();
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onClickOutside, enabled]);
}
