/**
 * v430 Schritt 6.1 — Verfügbarkeit der Szenenaktionen, PURE.
 *
 * Das Aktionsmenü entscheidet nichts selbst. Es konsumiert ausschliesslich
 * bereits kanonische Selektoren:
 *   • Haupt-/Substate  → `sceneState()` / `sceneSubstate()`
 *   • Lip-Sync         → Lip-Sync-Intent-Vertrag (`isLipSyncIntentional`)
 *   • Kontinuität      → Continuity-Helper (`isContinuityStale`,
 *                        `needsContinuityRerender`, Vorgänger-Finalität)
 *
 * Diese Datei projiziert diese Eingaben nur auf „sichtbar / deaktiviert“.
 * Keine DB, kein Netzwerk, keine neue Zustandsableitung.
 */

import type { SceneState } from './sceneState';

export interface SceneActionInput {
  /** Kanonischer Hauptzustand (`sceneState()`). */
  state: SceneState;
  /** Kanonischer Detailzustand (`sceneSubstate()`), rein diagnostisch. */
  substate?: string | null;
  /** Lip-Sync-Intent-Vertrag — NICHT aus dem Pipeline-State abgeleitet. */
  lipSyncIntentional: boolean;
  /** Engine-Override der Szene (`cinematic-sync` = Voll-Neuerstellung möglich). */
  engineOverride?: string | null;
  /** Continuity: Szene ist überhaupt an einen Vorgänger gebunden. */
  continuityConfigured: boolean;
  /** Continuity: `continuity_stale` (DB-Trigger, wertbasiert). */
  continuityStale: boolean;
  /** Continuity: Vorgänger-Output ist final (`isSceneOutputFinal`). */
  predecessorFinal: boolean;
  /** Continuity: Vorgänger hat überhaupt einen effektiven Output. */
  predecessorHasOutput: boolean;
  /** Eine Aktion läuft gerade (lokaler UI-Lock). */
  busy?: boolean;
}

export interface ActionAvailability {
  visible: boolean;
  disabled: boolean;
}

export interface SceneActionAvailability {
  lipSyncRestart: ActionAvailability;
  fullRegenerate: ActionAvailability;
  continuityUpdate: ActionAvailability;
  /** Menü überhaupt anzeigen? */
  anyVisible: boolean;
}

const LIPSYNC_BUSY_STATES: ReadonlySet<SceneState> = new Set<SceneState>([
  'lipsync_dispatched',
  'lipsync_running',
  'lipsync_muxing',
]);

const LIPSYNC_ARTIFACT_STATES: ReadonlySet<SceneState> = new Set<SceneState>([
  'audio_prep',
  'audio_ready',
  'complete',
]);

export function sceneActionAvailability(input: SceneActionInput): SceneActionAvailability {
  const busy = input.busy === true;
  const lipsyncBusy = LIPSYNC_BUSY_STATES.has(input.state);
  const hasLipsyncArtifact =
    lipsyncBusy ||
    LIPSYNC_ARTIFACT_STATES.has(input.state) ||
    Boolean(input.substate);
  const rendering = input.state === 'plate_queued' || input.state === 'plate_rendering';

  const lipSyncRestart: ActionAvailability = {
    visible: input.lipSyncIntentional || hasLipsyncArtifact,
    disabled: busy || lipsyncBusy,
  };

  const fullRegenerate: ActionAvailability = {
    visible: String(input.engineOverride ?? '') === 'cinematic-sync',
    disabled: busy || lipsyncBusy || rendering,
  };

  const continuityUpdate: ActionAvailability = {
    visible: input.continuityConfigured && input.continuityStale,
    disabled: busy || !input.predecessorFinal || !input.predecessorHasOutput,
  };

  return {
    lipSyncRestart,
    fullRegenerate,
    continuityUpdate,
    anyVisible:
      lipSyncRestart.visible || fullRegenerate.visible || continuityUpdate.visible,
  };
}
