import { tx } from "@/lib/i18nText";
/**
 * startSceneGeneration — Adapter auf den Baseline-Pfad vom 27.07.2026.
 *
 * Der v377 "Single-Run-Vertrag" (`composer-start-scene-generation`) ist der
 * einzige erlaubte Startpunkt. Reset + Run-Akquise + Dispatch passieren
 * serverseitig fail-closed, damit niemals zwei Generationen kollabieren.
 *
 * Diese Datei bleibt bestehen, damit die bestehenden UI-Komponenten (ClipsTab,
 * SceneCard, SceneDialogStudio, AnchorPreviewGate, FaceMapReviewDialog,
 * SceneClipProgress) unverändert weiterlaufen — sie ist jetzt ein dünner
 * Adapter ohne eigene Run-Semantik.
 */
import { supabase } from '@/integrations/supabase/client';

export interface SceneRunInfo {
  generation: number;
  run_id: string;
}

export interface StartSceneGenerationResult {
  runs: Record<string, SceneRunInfo>;
  /** Raw `compose-video-clips` response body. */
  compose: any;
}

export class SceneGenerationStartError extends Error {
  readonly code: string;
  /** V459 — nur bei `INSUFFICIENT_CREDITS` gesetzt. */
  readonly requiredEuros?: number;
  readonly availableEuros?: number;
  constructor(
    code: string,
    message: string,
    extra?: { requiredEuros?: number; availableEuros?: number },
  ) {
    super(message);
    this.name = 'SceneGenerationStartError';
    this.code = code;
    this.requiredEuros = extra?.requiredEuros;
    this.availableEuros = extra?.availableEuros;
  }
}

/** V459 — Backend liefert Zahlen + Code, die UI lokalisiert. */
function insufficientCreditsMessage(required: number, available: number): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(n);
  return tx({
    de: `Guthaben reicht nicht: ${fmt(required)} nötig, ${fmt(available)} verfügbar.`,
    en: `Not enough credit: ${fmt(required)} required, ${fmt(available)} available.`,
    es: `Saldo insuficiente: se necesitan ${fmt(required)}, disponibles ${fmt(available)}.`,
  });
}

function requireIds(sceneIds: string[]): string[] {
  const ids = sceneIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length === 0) {
    throw new SceneGenerationStartError(
      'no_persisted_scene',
      tx({ de: 'Die Szene wurde noch nicht gespeichert.', en: 'The scene has not been saved yet.', es: 'La escena aún no ha sido guardada.' }),
    );
  }
  return ids;
}

export async function startSceneGeneration(params: {
  sceneIds: string[];
  /** Body forwarded verbatim to `compose-video-clips`. */
  compose: Record<string, unknown>;
  reason?: string;
  useExistingRun?: boolean;
}): Promise<StartSceneGenerationResult> {
  requireIds(params.sceneIds);

  const { data, error } = await supabase.functions.invoke('composer-start-scene-generation', {
    body: {
      scene_ids: params.sceneIds,
      compose: params.compose,
      reason: params.reason ?? 'user_regenerate',
      use_existing_run: params.useExistingRun === true,
    },
  });

  if (error) {
    throw new SceneGenerationStartError(
      'dispatch_failed',
      error.message || tx({ de: 'Der Render konnte nicht gestartet werden.', en: 'The render could not be started.', es: 'No se pudo iniciar el renderizado.' }),
    );
  }

  if (data?.ok === false) {
    throw new SceneGenerationStartError(
      String(data.error ?? 'start_failed'),
      String(data.message ?? data.error ?? tx({ de: tx({ de: "Der Render konnte nicht gestartet werden.", en: "The render could not be started.", es: "No se pudo iniciar el renderizado." }), en: 'The render could not be started.', es: 'No se pudo iniciar el renderizado.' })),
    );
  }

  return { runs: data?.runs ?? {}, compose: data?.compose ?? data };
}

/**
 * Erste Etappe des Split-Starts: atomarer Run-Wechsel + vollständiger Purge,
 * bevor neue Anchor-Artefakte erzeugt werden.
 */
export async function prepareSceneRuns(params: {
  sceneIds: string[];
  reason?: string;
}): Promise<Record<string, SceneRunInfo>> {
  const sceneIds = requireIds(params.sceneIds);
  const { data, error } = await supabase.functions.invoke('composer-start-scene-generation', {
    body: {
      scene_ids: sceneIds,
      prepare_only: true,
      reason: params.reason ?? 'user_regenerate',
    },
  });
  if (error || data?.ok === false) {
    throw new SceneGenerationStartError(
      String(data?.error ?? 'prepare_failed'),
      error?.message || String(data?.message ?? data?.error ?? tx({ de: tx({ de: "Der vorherige Lauf konnte nicht sicher beendet werden.", en: "The previous run could not be safely finished.", es: "No se pudo finalizar de forma segura la ejecución anterior." }), en: 'The previous run could not be safely terminated.', es: 'No se pudo finalizar de forma segura la ejecución anterior.' })),
    );
  }
  return data?.runs ?? {};
}
