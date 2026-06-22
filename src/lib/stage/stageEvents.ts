/**
 * Sound Stage Event Bus — lightweight window-CustomEvent layer that lets
 * any Composer surface trigger cinematic cues (Action / Cut / Take Failed)
 * without coupling to the audio hook directly.
 *
 * Listeners are wired by useStageAudio() inside MotionStudioStage.
 */

export type StageEventType = "action" | "cut" | "take-failed" | "welcome";

const EVENT_NAME = "motion-studio:stage-event";

export interface StageEventDetail {
  type: StageEventType;
  meta?: Record<string, unknown>;
}

export function emitStageEvent(type: StageEventType, meta?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<StageEventDetail>(EVENT_NAME, {
        detail: { type, meta },
      }),
    );
  } catch {
    /* no-op */
  }
}

export function onStageEvent(handler: (detail: StageEventDetail) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => {
    const ce = e as CustomEvent<StageEventDetail>;
    if (ce.detail) handler(ce.detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
