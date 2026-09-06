/**
 * Presentation helpers for a Video Enhance run — shared by every surface so
 * the AI Video Studio panel and the Director's Cut panel say the same things
 * about the same run.
 *
 * Pure functions only: the surfaces render, this module decides the words and
 * numbers. Nothing here guesses — every fact comes from the run row the
 * engine returned (`toClientRun` on the server).
 */

import { getVideoEnhanceModel } from '@/config/videoEnhanceModels';
import type { EnhanceLang } from '@/lib/videoEnhance/engineErrors';

type Tri = Record<EnhanceLang, string>;

// ---------------------------------------------------------------------------
// Elapsed time
// ---------------------------------------------------------------------------

/** `m:ss`, or `h:mm:ss` once a run passes an hour. Never negative. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

/** Seconds since the run was created, from the server timestamp. */
export function elapsedSecondsSince(createdAt: string | null | undefined, nowMs = Date.now()): number {
  if (!createdAt) return 0;
  const started = Date.parse(createdAt);
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, (nowMs - started) / 1000);
}

// ---------------------------------------------------------------------------
// Run phase
// ---------------------------------------------------------------------------

export type RunPhase =
  | 'preparing'
  | 'submitted'
  | 'processing'
  | 'saving'
  | 'retrying'
  | 'cancelling'
  | 'done'
  | 'failed'
  | 'cancelled'
  | 'review';

const PHASE_BY_STATUS: Record<string, RunPhase> = {
  created: 'preparing',
  credits_reserved: 'preparing',
  provider_submitting: 'submitted',
  provider_submitted: 'submitted',
  provider_processing: 'processing',
  provider_output_ready: 'saving',
  asset_staging: 'saving',
  asset_persisting: 'saving',
  asset_persist_failed: 'retrying',
  local_poll_timeout: 'retrying',
  cancel_requested: 'cancelling',
  completed: 'done',
  provider_failed: 'failed',
  provider_cancelled_confirmed: 'cancelled',
  manual_review: 'review',
};

export function runPhase(status: string | null | undefined): RunPhase {
  return (status && PHASE_BY_STATUS[status]) || 'processing';
}

const PHASE_COPY: Record<RunPhase, Tri> = {
  preparing: { en: 'Preparing', de: 'Wird vorbereitet', es: 'Preparando' },
  submitted: { en: 'Sent to the engine', de: 'An die Engine übergeben', es: 'Enviado al motor' },
  processing: { en: 'Processing', de: 'Wird verarbeitet', es: 'Procesando' },
  saving: { en: 'Saving the result', de: 'Ergebnis wird gespeichert', es: 'Guardando el resultado' },
  retrying: { en: 'Retrying the save', de: 'Speichern wird wiederholt', es: 'Reintentando el guardado' },
  cancelling: { en: 'Cancelling', de: 'Wird abgebrochen', es: 'Cancelando' },
  done: { en: 'Finished', de: 'Fertig', es: 'Terminado' },
  failed: { en: 'Did not finish', de: 'Nicht abgeschlossen', es: 'No se completó' },
  cancelled: { en: 'Cancelled', de: 'Abgebrochen', es: 'Cancelado' },
  review: { en: 'Under review', de: 'In Prüfung', es: 'En revisión' },
};

export function runPhaseLabel(status: string | null | undefined, lang: EnhanceLang): string {
  const copy = PHASE_COPY[runPhase(status)];
  return copy[lang] ?? copy.en;
}

// ---------------------------------------------------------------------------
// Engines
// ---------------------------------------------------------------------------

/** Human name of an engine id; the id itself when the registry does not know it. */
export function engineDisplayName(modelId: string | null | undefined): string {
  if (!modelId) return '';
  return getVideoEnhanceModel(modelId)?.name ?? modelId;
}

export interface RunEngines {
  /** Engine that actually executes (the run's `model_id`). */
  executing: string;
  /** Engine the customer asked for, when it differs from the executing one. */
  requested: string | null;
  routed: boolean;
}

/** Executing vs. requested engine, straight from the run's execution data. */
export function runEngines(run: {
  model_id: string;
  requested_model_id?: string | null;
  delivery_strategy?: string | null;
}): RunEngines {
  const requested = run.requested_model_id ?? null;
  const routed =
    run.delivery_strategy === 'engine_routed' || (!!requested && requested !== run.model_id);
  return {
    executing: engineDisplayName(run.model_id),
    requested: routed && requested ? engineDisplayName(requested) : null,
    routed,
  };
}

// ---------------------------------------------------------------------------
// Target match
// ---------------------------------------------------------------------------

export type TargetMatch = 'matched' | 'mismatch' | 'unverified';

export interface MeasuredRun {
  projection_matched?: boolean | null;
  actual_width?: number | null;
  actual_height?: number | null;
  target_width?: number | null;
  target_height?: number | null;
}

/**
 * Whether the delivered file met the promised frame. The server's
 * `projection_matched` is authoritative; when the staged probe was
 * unavailable (null) the verdict is honestly `unverified`, never assumed.
 */
export function targetMatchOf(run: MeasuredRun): TargetMatch {
  if (run.projection_matched === true) return 'matched';
  if (run.projection_matched === false) return 'mismatch';
  return 'unverified';
}

const TARGET_MATCH_COPY: Record<TargetMatch, Tri> = {
  matched: { en: 'Target matched', de: 'Ziel erreicht', es: 'Objetivo alcanzado' },
  mismatch: {
    en: 'Provider output mismatch',
    de: 'Abweichung im Engine-Ergebnis',
    es: 'Discrepancia en la salida del motor',
  },
  unverified: {
    en: 'Output not verified',
    de: 'Ergebnis nicht verifiziert',
    es: 'Salida no verificada',
  },
};

export function targetMatchLabel(match: TargetMatch, lang: EnhanceLang): string {
  const copy = TARGET_MATCH_COPY[match];
  return copy[lang] ?? copy.en;
}

/** `2160×3840 → 2160×3840` style detail for the target-match line. */
export function targetMatchDetail(run: MeasuredRun): string | null {
  if (!run.target_width || !run.target_height) return null;
  const target = `${run.target_width}×${run.target_height}`;
  if (!run.actual_width || !run.actual_height) return target;
  return `${run.actual_width}×${run.actual_height} / ${target}`;
}

// ---------------------------------------------------------------------------
// Delivered facts
// ---------------------------------------------------------------------------

export interface DeliveredRun extends MeasuredRun {
  output_bitrate_kbps?: number | null;
  output_size_bytes?: number | null;
  output_fps?: number | null;
  output_duration_seconds?: number | null;
  output_codec?: string | null;
  output_container?: string | null;
}

const UNIT_COPY = {
  pixels: { en: 'pixels', de: 'Pixel', es: 'píxeles' },
  codec: { en: 'codec', de: 'Codec', es: 'códec' },
  container: { en: 'container', de: 'Container', es: 'contenedor' },
} satisfies Record<string, Tri>;

function fixed(value: number, digits: number, lang: EnhanceLang): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * The measured facts of the finished file, in display order. Codec and
 * container are two separate entries: `H264` is what the frames are encoded
 * with, `MP4` is the box they travel in.
 */
export function deliveredFacts(run: DeliveredRun, lang: EnhanceLang): string[] {
  const facts: string[] = [];
  if (run.actual_width && run.actual_height) {
    facts.push(`${run.actual_width}×${run.actual_height} ${UNIT_COPY.pixels[lang]}`);
  }
  if (run.output_bitrate_kbps) {
    facts.push(`${fixed(run.output_bitrate_kbps / 1000, 1, lang)} Mbit/s`);
  }
  if (run.output_size_bytes) {
    facts.push(`${fixed(run.output_size_bytes / (1024 * 1024), 1, lang)} MB`);
  }
  if (run.output_fps) facts.push(`${Math.round(run.output_fps)} FPS`);
  if (run.output_duration_seconds) facts.push(`${fixed(run.output_duration_seconds, 1, lang)} s`);
  if (run.output_codec) facts.push(`${UNIT_COPY.codec[lang]} ${run.output_codec.toUpperCase()}`);
  if (run.output_container) {
    facts.push(`${UNIT_COPY.container[lang]} ${run.output_container.toUpperCase()}`);
  }
  return facts;
}
