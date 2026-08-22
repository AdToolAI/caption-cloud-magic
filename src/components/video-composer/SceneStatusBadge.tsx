/**
 * v430 Schritt 6.5 — Gemeinsame Statusdarstellung (Komponente).
 *
 * Einziger Ort, an dem Szenen-Statuskeys in Kundentexte übersetzt werden.
 * Hauptstatus kommt ausschließlich aus `sceneState()`, Detailstatus aus
 * `sceneSubstate()`. Rohzustände werden nie angezeigt.
 */
import { cn } from '@/lib/utils';
import { tx } from '@/lib/i18nText';
import { sceneState, sceneSubstate } from '@/lib/composer/sceneState';
import type { SceneState, SceneSubstate } from '@/lib/composer/sceneState';
import {
  sceneStatusPresentation,
  type SceneStatusProjection,
  type SceneStatusTone,
} from '@/lib/composer/status/sceneStatusPresenter';

type TriText = { de: string; en: string; es: string };

const STATUS_TEXT: Record<string, TriText> = {
  'scene.status.idle': { de: 'Bereit', en: 'Ready', es: 'Listo' },
  'scene.status.plate_queued': { de: 'In der Warteschlange', en: 'In queue', es: 'En cola' },
  'scene.status.plate_rendering': { de: 'Clip wird generiert', en: 'Generating clip', es: 'Generando clip' },
  'scene.status.plate_ready': { de: 'Clip fertig', en: 'Clip ready', es: 'Clip listo' },
  'scene.status.audio_prep': { de: 'Voiceover wird erzeugt', en: 'Generating voiceover', es: 'Generando voz en off' },
  'scene.status.audio_ready': { de: 'Voiceover fertig', en: 'Voiceover ready', es: 'Voz en off lista' },
  'scene.status.lipsync_dispatched': { de: 'Lip-Sync wird gestartet', en: 'Starting lip-sync', es: 'Iniciando sincronización labial' },
  'scene.status.lipsync_running': { de: 'Lip-Sync läuft', en: 'Lip-sync running', es: 'Sincronización labial en curso' },
  'scene.status.lipsync_muxing': { de: 'Wird zusammengesetzt', en: 'Composing', es: 'Ensamblando' },
  'scene.status.complete': { de: 'Fertig', en: 'Ready', es: 'Listo' },
  'scene.status.failed': { de: 'Fehlgeschlagen', en: 'Failed', es: 'Fallido' },
  'scene.status.canceled': { de: 'Abgebrochen', en: 'Canceled', es: 'Cancelado' },
  'scene.status.detail.awaiting_manual_face_map': { de: 'Zuordnung prüfen', en: 'Check assignment', es: 'Comprobar asignación' },
  'scene.status.detail.awaiting_confirmation': { de: 'Warten auf Freigabe', en: 'Awaiting approval', es: 'Esperando aprobación' },
  'scene.status.detail.needs_clip_rerender': { de: 'Neu generieren nötig', en: 'Regeneration required', es: 'Se requiere regenerar' },
  'scene.status.detail.circuit_open': { de: 'Vorübergehend pausiert', en: 'Temporarily paused', es: 'Pausado temporalmente' },
  'scene.status.detail.deferred': { de: 'Wartet auf vorherige Szene', en: 'Waiting for previous scene', es: 'Esperando la escena anterior' },
  'scene.status.detail.anchor': { de: 'Referenzbild wird vorbereitet', en: 'Preparing reference image', es: 'Preparando la imagen de referencia' },
  'scene.status.detail.preview': { de: 'Vorschau', en: 'Preview', es: 'Vista previa' },
  'scene.status.detail.audio_mux_failed': { de: 'Ton konnte nicht gemischt werden', en: 'Audio could not be mixed', es: 'No se pudo mezclar el audio' },
  'scene.status.detail.plate_failed': { de: 'Clip-Erzeugung fehlgeschlagen', en: 'Clip generation failed', es: 'Falló la generación del clip' },
  'scene.status.detail.lipsync_failed': { de: 'Lip-Sync fehlgeschlagen', en: 'Lip-sync failed', es: 'Falló la sincronización labial' },
  'scene.status.detail.lipsync_pass': { de: 'Durchlauf {n}', en: 'Pass {n}', es: 'Pasada {n}' },
  'scene.status.detail.lipsync_retry': { de: 'Wiederholung {n}', en: 'Retry {n}', es: 'Reintento {n}' },
  'scene.status.detail.lipsync_fanout': { de: 'Sprecher {n}', en: 'Speaker {n}', es: 'Hablante {n}' },
};

function translate(key: string, params?: Record<string, string | number>): string {
  const entry = STATUS_TEXT[key];
  if (!entry) return '';
  let out = tx(entry);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return out;
}

const TONE_CLASS: Record<SceneStatusTone, string> = {
  idle: 'text-muted-foreground bg-muted/40 border-border/40',
  busy: 'text-accent bg-accent/15 border-accent/40 animate-pulse',
  ready: 'text-green-400 bg-green-500/15 border-green-500/40',
  warning: 'text-amber-400 bg-amber-500/15 border-amber-500/40',
  error: 'text-destructive bg-destructive/15 border-destructive/40',
};

/** Props-Vertrag: entweder `scene` ODER explizites (state, substate)-Tupel. */
type SceneStatusBadgeProps = {
  className?: string;
  /** Detailzeile mit anzeigen (Default: true). */
  showDetail?: boolean;
  /** Nur Text ohne Badge-Chrome rendern. */
  bare?: boolean;
} & (
  | { scene: any; state?: never; substate?: never }
  | { scene?: never; state: SceneState; substate?: SceneSubstate }
);

export function sceneStatusProjectionOf(props: SceneStatusBadgeProps): SceneStatusProjection {
  if (props.scene !== undefined) {
    return sceneStatusPresentation(sceneState(props.scene), sceneSubstate(props.scene));
  }
  return sceneStatusPresentation(props.state as SceneState, props.substate ?? null);
}

export default function SceneStatusBadge(props: SceneStatusBadgeProps) {
  const { className, showDetail = true, bare = false } = props;
  const projection = sceneStatusProjectionOf(props);
  const label = translate(projection.key);
  const detail = showDetail && projection.detailKey
    ? translate(projection.detailKey, projection.params)
    : '';

  const text = detail ? `${label} · ${detail}` : label;

  if (bare) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span
      className={cn(
        'text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap',
        TONE_CLASS[projection.tone],
        className,
      )}
    >
      {text}
    </span>
  );
}
