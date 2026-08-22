import { resolveSceneOutput } from "./resolve-scene-output.ts";
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
 * v438 — CURRENT-GENERATION PLATE AUTHORITY.
 * Spiegel von `src/lib/composer/sceneState.ts` und
 * `public.composer_state_from_legacy()`.
 */
export function isCurrentGenerationPlateReady(row: any): boolean {
  if (!row) return false;
  const clipUrl = row.clip_url ?? row.clipUrl ?? null;
  if (typeof clipUrl !== "string" || clipUrl.length === 0) return false;

  const gen = row.plate_generation ?? row.plateGeneration ?? null;
  if (gen == null) return true;

  const readyGenProvided =
    row.plate_ready_generation !== undefined || row.plateReadyGeneration !== undefined;
  if (!readyGenProvided) return true;

  const readyGen = row.plate_ready_generation ?? row.plateReadyGeneration ?? null;
  if (readyGen == null) return false;
  return Number(readyGen) === Number(gen);
}

/**
 * Legacy-Ableitung — identisch zu `public.composer_state_from_legacy()`.
 * Nur nötig für Zeilen, die (noch) kein `pipeline_state` mitliefern.
 */
export function deriveStateFromLegacy(row: any): SceneState {
  const clipStatus = row?.clip_status ?? row?.clipStatus ?? null;
  const stage = row?.twoshot_stage ?? row?.twoshotStage ?? null;
  const ls = row?.lip_sync_status ?? row?.lipSyncStatus ?? null;
  const runId = row?.active_run_id ?? row?.activeRunId ?? null;
  const plateReady = isCurrentGenerationPlateReady(row);

  if (clipStatus === "canceled" || ls === "canceled") return "canceled";
  if (clipStatus === "failed" || stage === "failed" || stage === "audio_mux_failed" || ls === "failed") {
    return "failed";
  }
  if (plateReady) {
    if (ls === "done" || ls === "applied" || stage === "done" || stage === "complete" || stage === "applied") {
      return "complete";
    }
    if (ls === "stitching") return "lipsync_muxing";
    if (ls === "audio_muxing" || stage === "audio_muxing") return "lipsync_running";
    if (ls === "running" || stage === "lipsync") return "lipsync_running";
    if (stage === "master_clip") return "audio_ready";
    if (stage === "audio") return "audio_prep";
    if (clipStatus === "ready" || clipStatus === "completed") return "plate_ready";
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

/** v430 Step 5C — diagnostischer/UI-relevanter Unterzustand. */
export type SceneSubstate = string | null;

/** Identisch zu `public.composer_substate_from_legacy()` — nur für Altzeilen. */
export function deriveSubstateFromLegacy(row: any): SceneSubstate {
  const clipStatus = row?.clip_status ?? row?.clipStatus ?? null;
  const stage = row?.twoshot_stage ?? row?.twoshotStage ?? null;
  const ls = row?.lip_sync_status ?? row?.lipSyncStatus ?? null;
  const plateReady = isCurrentGenerationPlateReady(row);

  if (clipStatus === "awaiting_manual_face_map") return "awaiting_manual_face_map";
  if (clipStatus === "awaiting_confirmation" && stage === "preview") return "awaiting_confirmation";

  if (clipStatus === "canceled" || ls === "canceled") return null;
  const isFailed =
    clipStatus === "failed" || stage === "failed" || stage === "audio_mux_failed" || ls === "failed";
  if (isFailed) {
    if (!plateReady) return "plate_failed";
    if (stage === "audio_mux_failed") return "audio_mux_failed";
    if (stage === "failed" && ls === "failed") return "lipsync_failed";
    return null;
  }

  if (typeof stage === "string" && stage.startsWith("syncso_pass_")) return stage;
  if (typeof stage === "string" && stage.startsWith("syncso_fanout_")) return stage;
  if (typeof stage === "string" && stage.startsWith("syncso_retry_")) return stage;
  if (stage === "circuit_open") return "circuit_open";
  if (stage === "deferred") return "deferred";
  if (stage === "needs_clip_rerender") return "needs_clip_rerender";
  if (stage === "anchor") return "anchor";
  if (stage === "anchor_soft_pass") return "anchor_soft_pass";
  if (stage === "preview") return "preview";
  return null;
}

/** Unterzustand einer Szenenzeile lesen — `pipeline_substate` gewinnt immer. */
export function sceneSubstate(row: any): SceneSubstate {
  const sub = row?.pipeline_substate ?? row?.pipelineSubstate ?? null;
  if (sub === null || sub === undefined) return deriveSubstateFromLegacy(row);
  return typeof sub === "string" && sub.length > 0 ? sub : null;
}

export const isTerminalState = (s: SceneState) => TERMINAL.has(s);
export const isRealizedState = (s: SceneState) => REALIZED.has(s);
export const isInFlightState = (s: SceneState) => IN_FLIGHT.has(s);
export const stateProgress = (s: SceneState) => PROGRESS[s] ?? 0;

/**
 * v430 Schritt 5D — 1:1-Parität zum alten `clip_status === 'ready'`.
 *
 * Die Bridge erzeugt `clip_status = 'ready'` für genau diese Zustände:
 *   plate_ready, audio_prep, audio_ready, lipsync_dispatched,
 *   lipsync_running, lipsync_muxing, complete
 *
 * Sonderfall: bei `failed` bleibt der alte `clip_status` stehen — eine
 * gescheiterte Szene mit gültigem Output trug daher weiterhin `ready`.
 * Deshalb wertet das Prädikat Zustand UND Output-Existenz aus.
 *
 * Ready/Failed sind exklusiv zu klassifizieren:
 *   ready  = legacyClipReadyEquivalent(...)
 *   failed = !ready && sceneState(row) === 'failed'
 */
export function legacyClipReadyEquivalent(input: {
  state: SceneState;
  hasEffectiveOutput: boolean;
}): boolean {
  if (REALIZED.has(input.state)) return true;
  if (input.state === "failed" && input.hasEffectiveOutput) return true;
  return false;
}

/** Bequemer Row-Wrapper: leitet Zustand und Output-Existenz selbst ab. */
export function legacyClipReadyEquivalentRow(row: any): boolean {
  const out = resolveSceneOutput(row);
  return legacyClipReadyEquivalent({
    state: sceneState(row),
    hasEffectiveOutput: typeof out.effectiveUrl === "string" && out.effectiveUrl.length > 0,
  });
}

/** Exklusive Failed-Klasse (Legacy-Parität). */
export function legacyClipFailedEquivalentRow(row: any): boolean {
  if (legacyClipReadyEquivalentRow(row)) return false;
  return sceneState(row) === "failed";
}

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

/**
 * START-Vertrag: darf fuer diese Szene ueberhaupt ein Lip-Sync-Lauf beginnen?
 */
export const canDispatchLipsync = (row: any): boolean => {
  const s = sceneState(row);
  return isRealizedScene(row) && (s === "audio_ready" || s === "lipsync_dispatched");
};

/**
 * v394 — FORTSETZUNGS-Vertrag: darf ein *weiterer* Pass eines bereits
 * laufenden Lip-Syncs dispatcht werden?
 *
 * Der Szenenzustand beschreibt die Phase, der Pass-Slot die Arbeitseinheit.
 * Sobald Pass 1 die Szene auf `lipsync_running` hebt, ist der Start-Vertrag
 * naturgemaess nicht mehr erfuellt — die Fan-out-Geschwister, der
 * Webhook-Advance und der Watchdog sind aber legitime Fortsetzungen.
 * `failed`, `canceled`, `complete` und `lipsync_muxing` bleiben ausgeschlossen.
 */
export const canContinueLipsync = (row: any): boolean => {
  const s = sceneState(row);
  return isRealizedScene(row) && (s === "lipsync_dispatched" || s === "lipsync_running");
};

export interface TransitionResult {
  applied: boolean;
  state: SceneState | null;
  reason: string | null;
}

export interface TransitionV2Result extends TransitionResult {
  substate: SceneSubstate;
  path: SceneState[] | null;
}

/**
 * G0 — Legacy-RPC an die 7-Argument-Fassade `composer_scene_transition/7`.
 * Die Fassade ist ein duenner Wrapper um den neuen atomaren Core; sie
 * behaelt die alte Signatur bei, damit bestehende Caller nicht brechen.
 * Der v391-Client-Loop ist ueberfluessig geworden, weil der Core Pfade
 * atomar materialisiert.
 */
async function rpcTransition(
  supabase: any,
  sceneId: string,
  to: SceneState,
  opts: {
    from?: SceneState[];
    detail?: string | null;
    runId?: string | null;
    generation?: number | null;
    substate?: SceneSubstate;
  },
): Promise<TransitionResult> {
  const { data, error } = await supabase.rpc("composer_scene_transition", {
    _scene_id: sceneId,
    _to: to,
    _from: opts.from && opts.from.length > 0 ? opts.from : null,
    _detail: opts.detail ?? null,
    _run_id: opts.runId ?? null,
    _generation: opts.generation ?? null,
    _substate: opts.substate ?? null,
  });

  if (error) {
    console.error(
      `[v384_transition_error] scene=${sceneId} to=${to} err=${error.message ?? String(error)}`,
    );
    return { applied: false, state: null, reason: "rpc_error" };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    applied: !!row?.applied,
    state: isSceneState(row?.state) ? row.state : null,
    reason: row?.reason ?? null,
  };
}

/**
 * G0 — Moderne RPC an `composer_scene_transition_v2`.
 * Pflicht-Guard-Modus (`run_bound` | `runless`) verhindert, dass ein
 * verspaeteter Callback oder ein paralleler Cancel einen falschen Lauf
 * quittiert.
 */
async function rpcTransitionV2(
  supabase: any,
  sceneId: string,
  to: SceneState,
  opts: {
    guardMode: "run_bound" | "runless";
    runId?: string | null;
    generation?: number | null;
    runlessReason?: string | null;
    writeId?: string | null;
    from?: SceneState[];
    detail?: string | null;
    substate?: SceneSubstate;
    errorText?: string | null;
    clearDetail?: boolean;
    clearSubstate?: boolean;
    clearError?: boolean;
  },
): Promise<TransitionV2Result> {
  const { data, error } = await supabase.rpc("composer_scene_transition_v2", {
    _scene_id: sceneId,
    _to: to,
    _guard_mode: opts.guardMode,
    _run_id: opts.runId ?? null,
    _generation: opts.generation ?? null,
    _runless_reason: opts.runlessReason ?? null,
    _write_id: opts.writeId ?? null,
    _from: opts.from && opts.from.length > 0 ? opts.from : null,
    _detail: opts.detail ?? null,
    _substate: opts.substate ?? null,
    _error_text: opts.errorText ?? null,
    _clear_detail: opts.clearDetail ?? false,
    _clear_substate: opts.clearSubstate ?? false,
    _clear_error: opts.clearError ?? false,
  });

  if (error) {
    console.error(
      `[g0_transition_v2_error] scene=${sceneId} to=${to} err=${error.message ?? String(error)}`,
    );
    return { applied: false, state: null, reason: "rpc_error", substate: null, path: null };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const path = Array.isArray(row?.path)
    ? row.path.filter((x: unknown) => isSceneState(x))
    : null;
  return {
    applied: !!row?.applied,
    state: isSceneState(row?.state) ? row.state : null,
    reason: row?.reason ?? null,
    substate: row?.substate ?? null,
    path,
  };
}

/**
 * Atomarer Zustandswechsel über die Legacy-Fassade.
 *
 * @param from   erlaubte Ausgangszustände (leer = beliebig, aber immer noch
 *               durch die Übergangstabelle begrenzt)
 * @param runId  bindet den Wechsel an einen Lauf — passt er nicht, greift er nicht
 * @param substate  optionaler diagnostischer/UI-relevanter Unterzustand
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
    substate?: SceneSubstate;
  } = {},
): Promise<TransitionResult> {
  const result = await rpcTransition(supabase, sceneId, to, opts);

  if (!result.applied) {
    console.warn(
      `[v391_transition_rejected] scene=${sceneId} to=${to} state=${result.state} reason=${result.reason ?? "-"}`,
    );
  } else {
    console.log(
      `[v384_transition] scene=${sceneId} to=${to} applied=true state=${result.state} reason=${result.reason ?? "-"}`,
    );
  }
  return result;
}

/**
 * G0 — Atomarer Zustandswechsel mit Pflicht-Guard.
 *
 * @param guardMode   'run_bound' erfordert runId + generation und prueft
 *                    gegen die gesperrte Zeile. 'runless' erfordert einen
 *                    in composer_runless_transition_rules erlaubten Grund.
 */
export async function transitionSceneV2(
  supabase: any,
  sceneId: string,
  to: SceneState,
  opts: {
    guardMode: "run_bound" | "runless";
    runId?: string | null;
    generation?: number | null;
    runlessReason?: string | null;
    writeId?: string | null;
    from?: SceneState[];
    detail?: string | null;
    substate?: SceneSubstate;
    errorText?: string | null;
    clearDetail?: boolean;
    clearSubstate?: boolean;
    clearError?: boolean;
  },
): Promise<TransitionV2Result> {
  const result = await rpcTransitionV2(supabase, sceneId, to, opts);

  if (!result.applied) {
    console.warn(
      `[g0_transition_v2_rejected] scene=${sceneId} to=${to} state=${result.state} reason=${result.reason ?? "-"}`,
    );
  } else {
    console.log(
      `[g0_transition_v2] scene=${sceneId} to=${to} applied=true state=${result.state} reason=${result.reason ?? "-"} path=${result.path?.join("→") ?? "-"}`,
    );
  }
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
