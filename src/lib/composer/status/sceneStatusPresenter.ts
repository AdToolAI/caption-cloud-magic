/**
 * v430 Schritt 6.5 — Gemeinsame Statusdarstellung (Projektion).
 *
 * VERTRAG:
 *  • Strikt pure und locale-unabhängig. Kein `tx`, kein `getLang`, kein
 *    Zugriff auf `localStorage`, keine Datums-/Zufallsquellen.
 *  • Liefert ausschließlich Translation-Keys + strukturierte Parameter.
 *    Die Übersetzung passiert genau einmal — in `SceneStatusBadge`.
 *  • Keine Runtime-Abhängigkeit zurück auf `sceneState.ts`: es werden nur
 *    Typen importiert (`import type`).
 *  • Unbekannte Substates werden NIE roh ausgespielt (nur Debug-Slots
 *    dürfen Rohwerte zeigen, siehe `rawSubstate`).
 *
 * Verwendung: UI-Komponenten nutzen `SceneStatusBadge`. Ein direkter Aufruf
 * von `sceneStatusPresentation()` ist nur für Tests oder nicht-visuelle
 * Projektionen (Telemetrie, Sortierung) erlaubt.
 */
import type { SceneState, SceneSubstate } from '@/lib/composer/sceneState';

export type SceneStatusTone = 'idle' | 'busy' | 'ready' | 'warning' | 'error';

export interface SceneStatusProjection {
  /** Translation-Key des Hauptstatus (immer gesetzt). */
  key: string;
  /** Ton für die Darstellung (Farbe/Animation entscheidet die Komponente). */
  tone: SceneStatusTone;
  /** Optionaler Detail-Key aus dem Substate (kundensicher, nie roh). */
  detailKey?: string;
  /** Parameter für Detail-Keys (z. B. Durchlaufnummer). */
  params?: Record<string, string | number>;
  /** Rohwert des Substates — ausschließlich für Debug-/Detailansichten. */
  rawSubstate?: string;
}

const STATE_KEY: Record<SceneState, string> = {
  idle: 'scene.status.idle',
  plate_queued: 'scene.status.plate_queued',
  plate_rendering: 'scene.status.plate_rendering',
  plate_ready: 'scene.status.plate_ready',
  audio_prep: 'scene.status.audio_prep',
  audio_ready: 'scene.status.audio_ready',
  lipsync_dispatched: 'scene.status.lipsync_dispatched',
  lipsync_running: 'scene.status.lipsync_running',
  lipsync_muxing: 'scene.status.lipsync_muxing',
  complete: 'scene.status.complete',
  failed: 'scene.status.failed',
  canceled: 'scene.status.canceled',
};

const STATE_TONE: Record<SceneState, SceneStatusTone> = {
  idle: 'idle',
  plate_queued: 'busy',
  plate_rendering: 'busy',
  plate_ready: 'ready',
  audio_prep: 'busy',
  audio_ready: 'busy',
  lipsync_dispatched: 'busy',
  lipsync_running: 'busy',
  lipsync_muxing: 'busy',
  complete: 'ready',
  failed: 'error',
  canceled: 'idle',
};

/** Statische Substates → kundensichere Detail-Keys. */
const SUBSTATE_DETAIL: Record<string, { detailKey: string; tone?: SceneStatusTone }> = {
  awaiting_manual_face_map: { detailKey: 'scene.status.detail.awaiting_manual_face_map', tone: 'warning' },
  awaiting_confirmation: { detailKey: 'scene.status.detail.awaiting_confirmation', tone: 'warning' },
  needs_clip_rerender: { detailKey: 'scene.status.detail.needs_clip_rerender', tone: 'warning' },
  circuit_open: { detailKey: 'scene.status.detail.circuit_open', tone: 'warning' },
  deferred: { detailKey: 'scene.status.detail.deferred', tone: 'warning' },
  anchor: { detailKey: 'scene.status.detail.anchor' },
  anchor_soft_pass: { detailKey: 'scene.status.detail.anchor' },
  preview: { detailKey: 'scene.status.detail.preview' },
  audio_mux_failed: { detailKey: 'scene.status.detail.audio_mux_failed', tone: 'error' },
  lipsync_failed: { detailKey: 'scene.status.detail.lipsync_failed', tone: 'error' },
};

/** Dynamische Substates (`syncso_pass_2`, …) → neutrale Kundentexte. */
function dynamicDetail(substate: string): { detailKey: string; params?: Record<string, string | number> } | null {
  const pass = /^syncso_pass_(\d+)$/.exec(substate);
  if (pass) return { detailKey: 'scene.status.detail.lipsync_pass', params: { n: Number(pass[1]) } };
  const retry = /^syncso_retry_(\d+)$/.exec(substate);
  if (retry) return { detailKey: 'scene.status.detail.lipsync_retry', params: { n: Number(retry[1]) } };
  const fanout = /^syncso_fanout_(\d+)$/.exec(substate);
  if (fanout) return { detailKey: 'scene.status.detail.lipsync_fanout', params: { n: Number(fanout[1]) } };
  return null;
}

export function sceneStatusPresentation(
  state: SceneState,
  substate?: SceneSubstate,
  opts?: { errorCode?: string | null },
): SceneStatusProjection {
  const key = STATE_KEY[state] ?? 'scene.status.idle';
  let tone: SceneStatusTone = STATE_TONE[state] ?? 'idle';

  const projection: SceneStatusProjection = { key, tone };

  const raw = typeof substate === 'string' && substate.length > 0 ? substate : null;
  if (raw) {
    projection.rawSubstate = raw;
    const stat = SUBSTATE_DETAIL[raw];
    if (stat) {
      projection.detailKey = stat.detailKey;
      if (stat.tone && state !== 'failed' && state !== 'canceled') tone = stat.tone;
      if (stat.tone === 'error') tone = 'error';
    } else {
      const dyn = dynamicDetail(raw);
      if (dyn) {
        projection.detailKey = dyn.detailKey;
        if (dyn.params) projection.params = dyn.params;
      }
      // Unbekannte Substates: kein Detail-Key, niemals roher Text.
    }
  }

  if (opts?.errorCode && state === 'failed') {
    projection.params = { ...(projection.params ?? {}), errorCode: opts.errorCode };
  }

  projection.tone = tone;
  return projection;
}
