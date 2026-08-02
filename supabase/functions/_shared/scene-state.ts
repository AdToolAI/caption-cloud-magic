/**
 * v384 — Zustandsmaschine für `composer_scenes` (Server-Seite).
 *
 * EIN Zustand pro Szene: `composer_scenes.pipeline_state`.
 * `clip_status`, `twoshot_stage`, `lip_sync_status` sind ab v384 nur noch
 * Legacy-Spiegel (per DB-Trigger `trg_composer_scene_state_bridge` gepflegt)
 * und dürfen NICHT mehr Kontrollfluss steuern. `clip_error` ist reiner
 * Anzeigetext — nie wieder ein Gate.
 *
 * Übergänge laufen ausschließlich über `composer_scene_transition()` in der
 * DB: atomar, mit Prüfung von Ausgangszustand, `active_run_id` und
 * `plate_generation`. Verspätete Callbacks alter Läufe sind dadurch
 * strukturell wirkungslos.
 *
 * Das Gegenstück für das Frontend liegt in `src/lib/composer/sceneState.ts`
 * und muss semantisch identisch bleiben.
 */

export type SceneState =
  | "idle"
  | "plate_queued"
  | "plate_rendering"
  | "plate_ready"
  | "audio_prep"
  | "audio_ready"
  | "lipsync_dispatched"
  | "lipsync_running"
  | "lipsync_muxing"
  | "complete"
  | "failed"
  | "canceled";

export const SCENE_STATES: readonly SceneState[] = [
  "idle",
  "plate_queued",
  "plate_rendering",
  "plate_ready",
  "audio_prep",
  "audio_ready",
  "lipsync_dispatched",
  "lipsync_running",
  "lipsync_muxing",
  "complete",
  "failed",
  "canceled",
];

const TERMINAL: ReadonlySet<SceneState> = new Set(["failed", "canceled"]);

/** Zustände, in denen eine belastbare Master-Plate vorliegt. */
const REALIZED: ReadonlySet<SceneState> = new Set([
  "plate_ready",
  "audio_prep",
  "audio_ready",
  "lipsync_dispatched",
  "lipsync_running",
  "lipsync_muxing",
  "complete",
]);

const IN_FLIGHT: ReadonlySet<SceneState> = new Set([
  "plate_queued",
  "plate_rendering",
  "audio_prep",
  "audio_ready",
  "lipsync_dispatched",
  "lipsync_running",
  "lipsync_muxing",
]);

const PROGRESS: Record<SceneState, number> = {
  idle: 0,
  plate_queued: 5,
  plate_rendering: 25,
  plate_ready: 45,
  audio_prep: 55,
  audio_ready: 65,
  lipsync_dispatched: 72,
  lipsync_running: 85,
  lipsync_muxing: 95,
  complete: 100,
  failed: 100,
  canceled: 100,
};

export function isSceneState(v: unknown): v is SceneState {
  return typeof v === "string" && (SCENE_STATES as readonly string[]).includes(v);
}

/**
 * Legacy-Ableitung — identisch zu `public.composer_state_from_legacy()`.
 * Nur nötig für Zeilen, die (noch) kein `pipeline_state` mitliefern.
 */
export function deriveStateFromLegacy(row: any): SceneState {
  const clipStatus = row?.clip_status ?? row?.clipStatus ?? null;
  const stage = row?.twoshot_stage ?? row?.twoshotStage ?? null;
  const ls = row?.lip_sync_status ?? row?.lipSyncStatus ?? null;
  const clipUrl = row?.clip_url ?? row?.clipUrl ?? null;
  const runId = row?.active_run_id ?? row?.activeRunId ?? null;

  if (clipStatus === "canceled" || ls === "canceled") return "canceled";
  if (clipStatus === "failed" || stage === "failed" || stage === "audio_mux_failed" || ls === "failed") {
    return "failed";
  }
  if (ls === "done" || ls === "applied" || stage === "done" || stage === "complete" || stage === "applied") {
    return "complete";
  }
  if (ls === "stitching") return "lipsync_muxing";
  if (ls === "running" || stage === "lipsync") return "lipsync_running";
  if (stage === "master_clip") return "audio_ready";
  if (stage === "audio") return "audio_prep";
  if ((clipStatus === "ready" || clipStatus === "completed") && typeof clipUrl === "string" && clipUrl.length > 0) {
    return "plate_ready";
  }
  if (clipStatus === "generating" || clipStatus === "rendering" || clipStatus === "processing") {
    return "plate_rendering";
  }
  if ((clipStatus === "queued" || clipStatus === "pending") && runId) return "plate_queued";
  return "idle";
}

/** Zustand einer Szenenzeile lesen — `pipeline_state` gewinnt immer. */
export function sceneState(row: any): SceneState {
  const s = row?.pipeline_state ?? row?.pipelineState;
  return isSceneState(s) ? s : deriveStateFromLegacy(row);
}

export const isTerminalState = (s: SceneState) => TERMINAL.has(s);
export const isRealizedState = (s: SceneState) => REALIZED.has(s);
export const isInFlightState = (s: SceneState) => IN_FLIGHT.has(s);
export const stateProgress = (s: SceneState) => PROGRESS[s] ?? 0;

/**
 * v384 — Realized-Vertrag. Ersetzt den v182-Guard, der auf JEDES nicht-leere
 * `clip_error` mit "scene_not_realized" reagierte und dadurch fertige Szenen
 * wegen eines transienten Diagnosetexts terminal quittierte.
 *
 * Zusätzlich zum Zustand gilt der Generations-Vertrag (v373): die vorliegende
 * Plate muss aus dem aktuellen Lauf stammen.
 */
export function isRealizedScene(row: any): boolean {
  if (!row) return false;
  const state = sceneState(row);
  if (!isRealizedState(state)) return false;

  const clipUrl = row.clip_url ?? row.clipUrl ?? null;
  if (typeof clipUrl !== "string" || clipUrl.length === 0) return false;

  const gen = row.plate_generation ?? row.plateGeneration ?? null;
  const readyGen = row.plate_ready_generation ?? row.plateReadyGeneration ?? null;
  if (gen != null && Number(readyGen) !== Number(gen)) return false;

  return true;
}

export const canStartAudioPrep = (row: any): boolean => {
  const s = sceneState(row);
  return isRealizedScene(row) && (s === "plate_ready" || s === "audio_prep");
};

export const canDispatchLipsync = (row: any): boolean => {
  const s = sceneState(row);
  return isRealizedScene(row) && (s === "audio_ready" || s === "lipsync_dispatched");
};

export interface TransitionResult {
  applied: boolean;
  state: SceneState | null;
  reason: string | null;
}

/**
 * Atomarer Zustandswechsel über die DB-Funktion.
 *
 * @param from   erlaubte Ausgangszustände (leer = beliebig, aber immer noch
 *               durch die Übergangstabelle begrenzt)
 * @param runId  bindet den Wechsel an einen Lauf — passt er nicht, greift er nicht
 */
export async function transitionScene(
  supabase: any,
  sceneId: string,
  to: SceneState,
  opts: {
    from?: SceneState[];
    detail?: string | null;
    runId?: string | null;
    generation?: number | null;
  } = {},
): Promise<TransitionResult> {
  const { data, error } = await supabase.rpc("composer_scene_transition", {
    _scene_id: sceneId,
    _to: to,
    _from: opts.from && opts.from.length > 0 ? opts.from : null,
    _detail: opts.detail ?? null,
    _run_id: opts.runId ?? null,
    _generation: opts.generation ?? null,
  });

  if (error) {
    console.error(
      `[v384_transition_error] scene=${sceneId} to=${to} err=${error.message ?? String(error)}`,
    );
    return { applied: false, state: null, reason: "rpc_error" };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const result: TransitionResult = {
    applied: !!row?.applied,
    state: isSceneState(row?.state) ? row.state : null,
    reason: row?.reason ?? null,
  };

  console.log(
    `[v384_transition] scene=${sceneId} to=${to} applied=${result.applied} state=${result.state} reason=${result.reason ?? "-"}`,
  );
  return result;
}

/**
 * v388 — Einheitlicher Terminal-Helfer.
 *
 * Vorher standen ~40 direkte `pipeline_state: "failed"`-Schreibvorgänge in
 * den Edge-Funktionen. Jeder davon umging Zeilensperre, Übergangstabelle und
 * Protokoll — und genau darüber wurden fehlgeschlagene Szenen später wieder
 * belebt. Der Fehlertext bleibt in seinem eigenen `.update()`; der Zustand
 * wechselt danach über den Vertrag.
 *
 * Fehlgeschlagene/abgebrochene Szenen bleiben terminal: die Übergangstabelle
 * lässt aus `failed`/`canceled` nur `idle` und `plate_queued` zu, beides
 * ausschließlich über den Reset.
 */
export async function failSceneState(
  supabase: any,
  sceneIdOrIds: string | string[],
  to: "failed" | "canceled" = "failed",
  detail: string | null = null,
): Promise<void> {
  const ids = Array.isArray(sceneIdOrIds) ? sceneIdOrIds : [sceneIdOrIds];
  for (const id of ids) {
    if (!id) continue;
    await transitionScene(supabase, id, to, {
      detail: detail ?? `v388_${to}`,
    });
  }
}
