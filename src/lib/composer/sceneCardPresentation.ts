/**
 * v430 Schritt 6.4 — Presentational-Helper für die SceneCard.
 *
 * STRIKT PURE: keine React-Imports, kein Supabase, keine Writes.
 * Alle Funktionen leiten ausschliesslich Darstellungs-Entscheidungen ab und
 * lesen den Output NUR über `resolveSceneOutput()` (v430 Schritt 1) sowie den
 * Zustand über die Zustandsmaschine (`sceneState`/`sceneSubstate`, v430 5D/5E).
 *
 * Diese Datei ändert KEINE Semantik: sie bündelt die bisher doppelt in
 * `SceneCard.tsx` stehenden Ableitungen 1:1.
 */
import { resolveSceneOutput, type SceneOutputInput } from '@/lib/composer/output/resolveSceneOutput';
import type { SceneState, SceneSubstate } from '@/lib/composer/sceneState';

export interface ScenePresentationInput extends SceneOutputInput {
  aiPrompt?: string | null;
  dialogScript?: string | null;
  clipSource?: string | null;
  uploadType?: string | null;
  stockMediaThumb?: string | null;
}

/**
 * Der Output, den die Karte anzeigen darf, OHNE den reinen Upload-Fallback.
 * Entspricht der alten Lesart `scene.clipUrl` (Upload wurde dort bewusst
 * getrennt behandelt).
 */
export function sceneRenderedOutputUrl(scene: ScenePresentationInput | null | undefined): string | null {
  const out = resolveSceneOutput(scene);
  return out.source === 'upload' ? null : out.effectiveUrl;
}

/** Irgendein abspielbarer/anzeigbarer Output — inklusive Upload. */
export function sceneAnyOutputUrl(scene: ScenePresentationInput | null | undefined): string | null {
  return resolveSceneOutput(scene).effectiveUrl;
}

/**
 * Expanded-Default: eine Szene mit Inhalt startet eingeklappt.
 * Vorher: `aiPrompt || dialogScript || clipUrl || uploadUrl`.
 */
export function sceneHasAuthoredContent(scene: ScenePresentationInput | null | undefined): boolean {
  const s = scene ?? {};
  return (
    Boolean((s.aiPrompt ?? '').trim()) ||
    Boolean((s.dialogScript ?? '').trim()) ||
    Boolean(sceneAnyOutputUrl(s))
  );
}

/**
 * Director-Mode-Aktionen (Extend/Bridge) brauchen einen fertigen Render.
 * Vorher: `sceneIsReady && scene.clipUrl`.
 */
export function sceneDirectorModeReady(
  scene: ScenePresentationInput | null | undefined,
  sceneIsReady: boolean,
): boolean {
  return sceneIsReady && Boolean(sceneRenderedOutputUrl(scene));
}

export interface SceneThumbnailSource {
  kind: 'image' | 'video' | 'none';
  url: string | null;
}

/**
 * Thumbnail-Auswahl der eingeklappten Karte.
 * Vorher:
 *   (uploadType === 'image' || clipSource === 'ai-image' || 'stock-image')
 *     && (clipUrl || uploadUrl)   -> <img>
 *   clipUrl                        -> <video>
 *   uploadUrl                      -> <video>
 */
export function sceneThumbnailSource(
  scene: ScenePresentationInput | null | undefined,
): SceneThumbnailSource {
  const s = scene ?? {};
  const anyUrl = sceneAnyOutputUrl(s);
  const isImage =
    s.uploadType === 'image' ||
    s.clipSource === 'ai-image' ||
    s.clipSource === 'stock-image';

  if (isImage && anyUrl) return { kind: 'image', url: anyUrl };
  if (anyUrl) return { kind: 'video', url: anyUrl };
  return { kind: 'none', url: null };
}

/** Stock-Vorschau: Provider-Thumb schlägt den gerenderten Output. */
export function sceneStockThumbnail(
  scene: ScenePresentationInput | null | undefined,
): string | null {
  const s = scene ?? {};
  return (s.stockMediaThumb ?? null) || sceneRenderedOutputUrl(s);
}

export interface SceneLipsyncFlags {
  /** Lip-Sync läuft gerade (früher lip_sync_status = 'running'). */
  busy: boolean;
  /** Ein Lip-Sync-Artefakt existiert (früher lip_sync_status/twoshot_stage gesetzt). */
  hasArtifact: boolean;
  /** Lauf lässt sich abbrechen (früher running/stitching/pending/failed/stage aktiv). */
  cancellable: boolean;
}

/**
 * Übernimmt die bisherigen Ableitungen aus SceneCard.tsx unverändert.
 * Zustand kommt ausschliesslich aus der Zustandsmaschine.
 */
export function sceneLipsyncFlags(
  lifecycleState: SceneState,
  detailState: SceneSubstate | null | undefined,
  sceneIsFailed: boolean,
): SceneLipsyncFlags {
  const busy =
    lifecycleState === 'lipsync_dispatched' ||
    lifecycleState === 'lipsync_running' ||
    lifecycleState === 'lipsync_muxing';

  const hasArtifact =
    busy ||
    lifecycleState === 'audio_prep' ||
    lifecycleState === 'audio_ready' ||
    lifecycleState === 'complete' ||
    !!detailState;

  const cancellable =
    hasArtifact &&
    (busy ||
      sceneIsFailed ||
      lifecycleState === 'audio_prep' ||
      lifecycleState === 'audio_ready');

  return { busy, hasArtifact, cancellable };
}
