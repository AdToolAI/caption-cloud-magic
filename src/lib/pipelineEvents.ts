/**
 * pipelineEvents — winziger Event-Bus für die globale Pipeline-Progress-Bar
 * im Video-Composer. Erlaubt jeder Action (z. B. "Alle Clips generieren",
 * "Clip generieren mit Voiceover", Master-Render), unmittelbar nach dem Klick
 * dem Progress-Hook Bescheid zu geben — noch BEVOR die erste Server-Antwort
 * eintrifft. So sieht der Nutzer ab dem ersten Frame Bewegung statt eines
 * stummen Spinners.
 *
 * Bewusst Frontend-only: keine Server-State-Änderung, keine DB.
 */
export type PipelinePhaseId =
  | 'clips'
  | 'voiceover'
  | 'lipsync'
  | 'music'
  | 'export';

export type PipelineEvent =
  | { type: 'clips:start' }
  | { type: 'clips:end' }
  | { type: 'voiceover:start' }
  | { type: 'voiceover:end' }
  | { type: 'lipsync:start' }
  | { type: 'lipsync:end' }
  | { type: 'music:start' }
  | { type: 'music:end' }
  | { type: 'export:start' }
  | { type: 'export:end' };

const EVENT_NAME = 'composer:pipeline-event';

export function emitPipelineEvent(event: PipelineEvent) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: event }));
}

export function subscribePipelineEvents(handler: (e: PipelineEvent) => void) {
  if (typeof window === 'undefined') return () => {};
  const listener = (ev: Event) => {
    const detail = (ev as CustomEvent<PipelineEvent>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
