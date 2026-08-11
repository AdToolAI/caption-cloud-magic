import { useCallback, useEffect, useState } from "react";

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

const STORAGE_KEY = "motion-studio:prefs:v1";

const DEFAULTS: StudioPreferences = {
  editorMode: "quick",
  audioMode: "ambient",
  cinemascope: false,
  editorModeManual: false,
};

function readFromStorage(): StudioPreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<StudioPreferences>;
    return {
      editorMode:
        parsed.editorMode === "direct" || parsed.editorMode === "studio"
          ? parsed.editorMode
          : "quick",
      audioMode:
        parsed.audioMode === "off" || parsed.audioMode === "full" ? parsed.audioMode : "ambient",
      cinemascope: Boolean(parsed.cinemascope),
      editorModeManual: Boolean(parsed.editorModeManual),
    };
  } catch {
    return DEFAULTS;
  }
}

function writeToStorage(prefs: StudioPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
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
