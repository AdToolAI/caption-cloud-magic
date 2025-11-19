import { useEffect } from 'react';

interface KeyboardShortcuts {
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onClose?: () => void;
  onPlayPause?: () => void;
}

export const useKeyboardShortcuts = (shortcuts: KeyboardShortcuts, enabled: boolean = true) => {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Ignore if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        // Allow shortcuts even in input fields for save/close
        if (modKey && e.key === 's' && shortcuts.onSave) {
          e.preventDefault();
          shortcuts.onSave();
          return;
        }
        if (e.key === 'Escape' && shortcuts.onClose) {
          shortcuts.onClose();
          return;
        }
        return;
      }

      // Ctrl/Cmd + S: Save
      if (modKey && e.key === 's' && shortcuts.onSave) {
        e.preventDefault();
        shortcuts.onSave();
      }

      // Ctrl/Cmd + Z: Undo
      if (modKey && !e.shiftKey && e.key === 'z' && shortcuts.onUndo) {
        e.preventDefault();
        shortcuts.onUndo();
      }

      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y: Redo
      if (((modKey && e.shiftKey && e.key === 'z') || (modKey && e.key === 'y')) && shortcuts.onRedo) {
        e.preventDefault();
        shortcuts.onRedo();
      }

      // Escape: Close
      if (e.key === 'Escape' && shortcuts.onClose) {
        shortcuts.onClose();
      }

      // Space: Play/Pause
      if (e.key === ' ' && shortcuts.onPlayPause) {
        e.preventDefault();
        shortcuts.onPlayPause();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts, enabled]);
};
