import { useCallback, useEffect, useState } from "react";
import { migrateLegacyDraftKey, scopedDraftKey } from "@/lib/local-draft-scope";

/**
 * Motion Studio "Sound Stage" preferences.
 * Persisted in localStorage so a Solo-Creator gets the same set on every visit.
 * Audio mode: off → no cues, ambient → set ambient + event cues, full → ambient + cues + scene mood underscore.
 */

export type EditorMode = "quick" | "direct" | "studio";
export type StageAudioMode = "off" | "ambient" | "full";

export interface StudioPreferences {
  editorMode: EditorMode;
  audioMode: StageAudioMode;
  cinemascope: boolean;
  /** v416 — true once the user picked a mode themselves. Blocks auto-suggest. */
  editorModeManual: boolean;
}

const STORAGE_BASE = "motion-studio:prefs:v1";
/**
 * Scoped per account: the mode decides which briefing panels are visible, so
 * an unscoped key made a second account in the same browser inherit (or lose)
 * half the briefing page.
 */
const storageKey = () => scopedDraftKey(STORAGE_BASE);

const DEFAULTS: StudioPreferences = {
  // v423 — "direct" shows the complete briefing. Quick hides tone, language,
  // video mode, visual style and the director's note, which read as a broken
  // page on a fresh account.
  editorMode: "direct",
  audioMode: "ambient",
  cinemascope: false,
  editorModeManual: false,
};

function readFromStorage(): StudioPreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    migrateLegacyDraftKey(STORAGE_BASE);
    const raw = window.localStorage.getItem(storageKey());
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<StudioPreferences>;
    const manual = Boolean(parsed.editorModeManual);
    const storedMode =
      parsed.editorMode === "direct" || parsed.editorMode === "studio" || parsed.editorMode === "quick"
        ? parsed.editorMode
        : DEFAULTS.editorMode;
    return {
      // Only honour "quick" when the user picked it themselves — legacy
      // records carry the old implicit quick default.
      editorMode: storedMode === "quick" && !manual ? DEFAULTS.editorMode : storedMode,
      audioMode:
        parsed.audioMode === "off" || parsed.audioMode === "full" ? parsed.audioMode : "ambient",
      cinemascope: Boolean(parsed.cinemascope),
      editorModeManual: manual,
    };
  } catch {
    return DEFAULTS;
  }
}

function writeToStorage(prefs: StudioPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(prefs));
  } catch {
    /* no-op */
  }
}


const STORAGE_EVENT = "motion-studio:prefs-changed";

export function useStudioPreferences() {
  const [prefs, setPrefs] = useState<StudioPreferences>(() => readFromStorage());

  useEffect(() => {
    const handler = () => setPrefs(readFromStorage());
    window.addEventListener(STORAGE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(STORAGE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const update = useCallback((patch: Partial<StudioPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      writeToStorage(next);
      window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
      return next;
    });
  }, []);

  const setEditorMode = useCallback(
    (mode: EditorMode) => update({ editorMode: mode, editorModeManual: true }),
    [update],
  );
  /**
   * v416 — one-shot suggestion after a briefing analysis. Never overrides a
   * mode the user picked themselves, and never escalates to "studio".
   */
  const suggestEditorMode = useCallback(
    (mode: Exclude<EditorMode, 'studio'>) => {
      const current = readFromStorage();
      if (current.editorModeManual) return;
      if (current.editorMode === 'studio') return;
      if (current.editorMode === mode) return;
      update({ editorMode: mode });
    },
    [update],
  );
  const setAudioMode = useCallback((mode: StageAudioMode) => update({ audioMode: mode }), [update]);
  const toggleCinemascope = useCallback(
    () => update({ cinemascope: !readFromStorage().cinemascope }),
    [update],
  );
  const setCinemascope = useCallback((v: boolean) => update({ cinemascope: v }), [update]);

  return {
    prefs,
    setEditorMode,
    suggestEditorMode,
    setAudioMode,
    toggleCinemascope,
    setCinemascope,
  };
}
