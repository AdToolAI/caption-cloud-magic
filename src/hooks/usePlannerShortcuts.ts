import { useEffect } from "react";

interface ShortcutHandlers {
  onApprove?: () => void;
  onSetDraft?: () => void;
  onDelete?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onNudgeLeft?: () => void;
  onNudgeRight?: () => void;
  onNudgeUp?: () => void;
  onNudgeDown?: () => void;
  onNudgeTimeLeft?: () => void;
  onNudgeTimeRight?: () => void;
}

export function usePlannerShortcuts(handlers: ShortcutHandlers, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const { key, shiftKey, ctrlKey, metaKey } = e;
      const cmdKey = ctrlKey || metaKey;

      // A - Approve
      if (key === "a" && !cmdKey && !shiftKey) {
        e.preventDefault();
        handlers.onApprove?.();
      }

      // D - Set to Draft
      if (key === "d" && !cmdKey && !shiftKey) {
        e.preventDefault();
        handlers.onSetDraft?.();
      }

      // Delete - Delete selected
      if (key === "Delete" || key === "Backspace") {
        if (!cmdKey) {
          e.preventDefault();
          handlers.onDelete?.();
        }
      }

      // Cmd/Ctrl + C - Copy
      if (key === "c" && cmdKey) {
        e.preventDefault();
        handlers.onCopy?.();
      }

      // Cmd/Ctrl + V - Paste
      if (key === "v" && cmdKey) {
        e.preventDefault();
        handlers.onPaste?.();
      }

      // Arrow keys - Nudge
      if (key === "ArrowLeft") {
        e.preventDefault();
        if (shiftKey) {
          handlers.onNudgeTimeLeft?.(); // -15 min
        } else {
          handlers.onNudgeLeft?.(); // -1 day
        }
      }

      if (key === "ArrowRight") {
        e.preventDefault();
        if (shiftKey) {
          handlers.onNudgeTimeRight?.(); // +15 min
        } else {
          handlers.onNudgeRight?.(); // +1 day
        }
      }

      if (key === "ArrowUp") {
        e.preventDefault();
        handlers.onNudgeUp?.(); // -1 hour
      }

      if (key === "ArrowDown") {
        e.preventDefault();
        handlers.onNudgeDown?.(); // +1 hour
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handlers]);
}
