/**
 * v431 G3.1 — Job-Ledger als Provenienz-Quelle (Observe-Phase).
 *
 * D2 (G3.0b): `composer_pipeline_jobs` ist ab G3.2 die ALLEINIGE Quelle der
 * Run-Provenienz eines Callbacks. G3.1 baut dafür ausschließlich die Daten auf:
 *
 *   • `acquireLedgerJob()` legt die Job-Zeile VOR dem Provider-Call an und
 *     friert `plate_generation` aus dem Szenen-Snapshot ein.
 *   • Die zurückgegebene `id` wird als `pipeline_job_id` in den Callback-Kanal
 *     transportiert (Sync.so-URL, Remotion-customData, Replicate-Webhook-URL,
 *     Mux-Request-Body).
 *   • `observeCallbackProvenance()` liest die Bindung im Callback, loggt sie
 *     strukturiert — und mutiert NICHTS an Produktions-/Orchestrierungsdaten.
 *
 * v431 G3.1d — präzisierter Observe-Vertrag:
 *   Observe ist read-only gegenüber allen Produktions- und Orchestrierungsdaten
 *   (Scene, Ledger, State, Output, Mirrors, Credits). Die EINZIGE erlaubte
 *   Schreiboperation ist ein append-only Diagnose-Insert in
 *   `composer_callback_observations` via RPC `composer_record_callback_observation`.
 *   Dieser Insert ist strikt best effort: Verdikt, Rückgabewert, HTTP-Status und
 *   State-/Ledger-Pfad dürfen NIE von seinem Erfolg abhängen. Kein Retry im
 *   Callback-Pfad, keine Exception nach außen.
 *
 * Fail-open ist in G3.1 Pflicht: jede Störung dieses Moduls darf einen echten
 * Render niemals blockieren. Fail-closed kommt erst in G3.2, nachdem das
 * Drain-Gate (0 Callbacks ohne Ledger-Bindung über das Drain-Fenster) grün ist.

 */

import { V427_RUN_CONTRACT_VERSION } from "./v427-flags.ts";
import type { PipelineStage } from "./composer-pipeline-jobs.ts";

export const V431_OBSERVE_TAG = "[v431] g31_observe";

export interface AcquireLedgerJobParams {
  sceneId: string;
  /** Kanonischer Scene-Run. Fehlt er, wird nichts geschrieben. */
  runId: string | null | undefined;
  stage: PipelineStage;
  /** Aus dem Szenen-Snapshot; wird beim Insert eingefroren (D2). */
  plateGeneration?: number | null;
  provider?: string | null;
  segmentId?: string | null;
  speakerId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface LedgerJobHandle {
  id: string;
  attemptNo: number;
  runId: string;
  plateGeneration: number | null;
}

/**
 * G3.1b — Ergebnis der Initial-Akquise als Discriminated Union.
 *
 * `acquired`            → diese Zeile gehört dem Aufrufer, er darf dispatchen.
 * `already_in_flight`   → ein AKTIVER Attempt derselben Identität existiert
 *                         bereits (auch `dispatch_uncertain`). Kein Dispatch.
 * `predecessor_exists`  → ein TERMINALER Attempt (`succeeded`/`failed`/`stale`/
 *                         `cancelled`) existiert bereits. Initial-Akquise ist
 *                         damit ausgeschlossen; ein Redispatch ist nur über den
 *                         expliziten Retry-/Replace-Vertrag zulässig.
 * `unavailable`         → Ledger nicht verfügbar / keine belastbare Provenienz.
 *                         Fail-open: der Legacy-Pfad läuft unverändert weiter.
 */
export type LedgerAcquireResult =
  | { outcome: "acquired"; job: LedgerJobHandle }
  | { outcome: "already_in_flight"; job: LedgerJobHandle; status: string | null }
  | { outcome: "predecessor_exists"; job: LedgerJobHandle; status: string | null }
  | { outcome: "unavailable"; reason: string };


function keyOf(p: {
  sceneId: string;
  runId: string;
  stage: PipelineStage;
  segmentId?: string | null;
  attemptNo: number;
}): string {
  return [p.sceneId, p.runId, p.stage, p.segmentId ?? "-", String(p.attemptNo)].join(":");
}

/** Deterministischer Idempotenz-Schlüssel derselben Attempt-Identität. */
export const buildLedgerIdempotencyKey = keyOf;

/**
 * Initial-Akquise der Ledger-Zeile für genau diesen Dispatch.
 *
 * Diese Funktion löst NIEMALS einen laufenden Attempt ab. Existiert bereits ein
 * aktiver Attempt derselben (scene, run, stage, segment, generation), lautet das
 * Verdikt `already_in_flight` — `composer_replace_pipeline_attempt` wird dabei
 * nicht aufgerufen.
 *
 * Concurrency-Vertrag: zwei gleichzeitige Aufrufe derselben Identität ergeben
 * deterministisch genau einmal `acquired` und einmal `already_in_flight`. Das
 * garantiert das RPC `composer_acquire_pipeline_attempt` über
 * `ON CONFLICT ON CONSTRAINT composer_pipeline_jobs_identity_unique DO NOTHING`
 * plus Re-Read der Gewinnerzeile. Der Verlierer bekommt nie `unavailable`.
 */
export async function acquireLedgerJob(
  admin: any,
  params: AcquireLedgerJobParams,
): Promise<LedgerAcquireResult> {
  try {
    const runId = params.runId ? String(params.runId) : null;
    if (!runId) {
      console.warn(`${V431_OBSERVE_TAG} ledger_skip_no_run`, JSON.stringify({
        scene_id: params.sceneId,
        stage: params.stage,
      }));
      return { outcome: "unavailable", reason: "no_run" };
    }

    let plateGeneration = params.plateGeneration ?? null;
    if (plateGeneration == null) {
      const { data: scene } = await admin
        .from("composer_scenes")
        .select("plate_generation, active_run_id")
        .eq("id", params.sceneId)
        .maybeSingle();
      if (scene && String(scene.active_run_id ?? "") !== runId) {
        console.warn(`${V431_OBSERVE_TAG} ledger_skip_run_superseded`, JSON.stringify({
          scene_id: params.sceneId,
          stage: params.stage,
          dispatch_run_id: runId,
          scene_active_run_id: scene.active_run_id ?? null,
        }));
        return { outcome: "unavailable", reason: "run_superseded" };
      }
      plateGeneration = typeof scene?.plate_generation === "number" ? scene.plate_generation : null;
    }

    // `plate_generation` ist DB-seitig beim INSERT Pflicht. Ohne belastbare
    // Generation wird gar keine Ledger-Zeile erzeugt (fail-closed gegenüber dem
    // Ledger, fail-open gegenüber dem Render).
    if (plateGeneration == null) {
      console.warn(`${V431_OBSERVE_TAG} ledger_skip_no_generation`, JSON.stringify({
        scene_id: params.sceneId,
        stage: params.stage,
        run_id: runId,
      }));
      return { outcome: "unavailable", reason: "no_generation" };
    }

    // v431 RS3 §5b — Lip-Sync-Stages laufen ausschließlich über den
    // serialisierten Wrapper (Advisory → Job → Scene). Dort greift das
    // Reset-Epoch (`rs3_reset_id`) und der On-Demand-Rearm. Alle anderen
    // Stages benutzen unverändert das eingefrorene G3.1b-Acquire.
    const useRs3Serialized = params.stage === "sync_segment" || params.stage === "audio_mux";
    const { data, error } = useRs3Serialized
      ? await admin.rpc("composer_acquire_lipsync_attempt_serialized", {
        _scene_id: params.sceneId,
        _run_id: runId,
        _stage: params.stage,
        _plate_generation: plateGeneration,
        _segment_id: params.segmentId ?? null,
        _provider: params.provider ?? null,
        _metadata: { ...(params.metadata ?? {}), ledger_source: "v431_g31" },
      })
      : await admin.rpc("composer_acquire_pipeline_attempt", {
        p_scene_id: params.sceneId,
        p_run_id: runId,
        p_stage: params.stage,
        p_plate_generation: plateGeneration,
        p_run_contract_version: V427_RUN_CONTRACT_VERSION,
        p_segment_id: params.segmentId ?? null,
        p_speaker_id: params.speakerId ?? null,
        p_provider: params.provider ?? null,
        p_metadata: { ...(params.metadata ?? {}), ledger_source: "v431_g31" },
      });

    const row = Array.isArray(data) ? data[0] : data;
    if (row?.rs3_outcome) {
      console.log(`${V431_OBSERVE_TAG} rs3_acquire`, JSON.stringify({
        scene_id: params.sceneId,
        stage: params.stage,
        rs3_outcome: row.rs3_outcome,
        outcome: row.outcome ?? null,
        pipeline_job_id: row.job_id ?? null,
      }));
    }
    if (error || !row?.job_id) {
      console.warn(`${V431_OBSERVE_TAG} ledger_acquire_failed`, JSON.stringify({
        scene_id: params.sceneId,
        stage: params.stage,
        rs3_outcome: row?.rs3_outcome ?? null,
        error: error?.message ?? "no_row",
      }));
      return {
        outcome: "unavailable",
        reason: typeof row?.rs3_outcome === "string" && row.rs3_outcome !== "passthrough"
          ? String(row.rs3_outcome)
          : "acquire_failed",
      };
    }


    const job: LedgerJobHandle = {
      id: String(row.job_id),
      attemptNo: Number(row.attempt_no ?? 1),
      runId,
      plateGeneration,
    };

    const outcome = String(row.outcome ?? "");
    if (outcome === "already_in_flight" || outcome === "predecessor_exists") {
      console.warn(`${V431_OBSERVE_TAG} ledger_${outcome}`, JSON.stringify({
        scene_id: params.sceneId,
        stage: params.stage,
        run_id: runId,
        segment_id: params.segmentId ?? null,
        pipeline_job_id: job.id,
        attempt_no: job.attemptNo,
        existing_status: row.status ?? null,
      }));
      return {
        outcome: outcome as "already_in_flight" | "predecessor_exists",
        job,
        status: row.status ? String(row.status) : null,
      };
    }


    return { outcome: "acquired", job };
  } catch (e) {
    console.warn(`${V431_OBSERVE_TAG} ledger_acquire_threw`, JSON.stringify({
      scene_id: params.sceneId,
      stage: params.stage,
      error: e instanceof Error ? e.message : String(e),
    }));
    return { outcome: "unavailable", reason: "threw" };
  }
}


/**
 * Verknüpft die externe Provider-Job-ID mit der Ledger-Zeile.
 * Der DB-Trigger macht `external_job_id` nach dem ersten Setzen unveränderlich.
 */
export async function bindLedgerExternalJob(
  admin: any,
  jobId: string | null | undefined,
  externalJobId: string | null | undefined,
): Promise<void> {
  if (!jobId) return;
  try {
    const patch: Record<string, unknown> = { status: "dispatched" };
    if (externalJobId) patch.external_job_id = String(externalJobId);
    await admin
      .from("composer_pipeline_jobs")
      .update(patch)
      .eq("id", jobId)
      .in("status", ["pending", "dispatching"]);
  } catch (e) {
    console.warn(`${V431_OBSERVE_TAG} ledger_bind_failed`, JSON.stringify({
      pipeline_job_id: jobId,
      error: e instanceof Error ? e.message : String(e),
    }));
  }
}

/**
 * v431 G3.1f — Atomare Attempt-Bindung Plate (base_video).
 *
 * Bindet in EINER Transaktion: Ledger-`external_job_id`,
 * `composer_scenes.replicate_prediction_id` und den Transport-Pointer
 * `composer_scenes.plate_pipeline_job_id`. Kein halbgebundener Zustand.
 * Fail-open nur dort, wo es gar keine Ledger-Zeile gibt (Legacy-Pfad):
 * dann wird ausschließlich die Provider-ID geschrieben, ohne Pointer.
 */
export async function bindPlateAttempt(
  admin: any,
  params: {
    pipelineJobId: string | null | undefined;
    sceneId: string;
    externalJobId: string;
    runId: string | null;
    plateGeneration: number;
  },
): Promise<boolean> {
  if (!params.pipelineJobId) {
    // Kein Ledger-Attempt (fail-open Observe-Rest): Legacy-Write ohne Pointer.
    await admin
      .from("composer_scenes")
      .update({ replicate_prediction_id: params.externalJobId })
      .eq("id", params.sceneId);
    return false;
  }
  const { error } = await admin.rpc("composer_bind_plate_attempt", {
    _pipeline_job_id: params.pipelineJobId,
    _external_job_id: params.externalJobId,
    _scene_id: params.sceneId,
    _run_id: params.runId,
    _plate_generation: params.plateGeneration,
  });
  if (error) {
    console.error(`${V431_OBSERVE_TAG} plate_bind_failed`, JSON.stringify({
      scene_id: params.sceneId,
      pipeline_job_id: params.pipelineJobId,
      external_job_id: params.externalJobId,
      error: error.message,
    }));
    throw new Error(`plate_bind_failed: ${error.message}`);
  }
  return true;
}

/**
 * v431 G3.1f — Atomare Attempt-Bindung Sync-Pass (sync_segment).
 * Schreibt Ledger-Bindung + `passes[i].job_id` + `passes[i].pipeline_job_id`
 * in einer Transaktion. Der Pass-Index wird gegen die Ledger-Identität geprüft.
 */
export async function bindSyncPassAttempt(
  admin: any,
  params: {
    pipelineJobId: string | null | undefined;
    sceneId: string;
    passIdx: number;
    externalJobId: string;
  },
): Promise<boolean> {
  if (!params.pipelineJobId) return false;
  const { error } = await admin.rpc("composer_bind_sync_pass_attempt", {
    _pipeline_job_id: params.pipelineJobId,
    _external_job_id: params.externalJobId,
    _scene_id: params.sceneId,
    _pass_idx: params.passIdx,
  });
  if (error) {
    console.error(`${V431_OBSERVE_TAG} sync_pass_bind_failed`, JSON.stringify({
      scene_id: params.sceneId,
      pass_idx: params.passIdx,
      pipeline_job_id: params.pipelineJobId,
      error: error.message,
    }));
    throw new Error(`sync_pass_bind_failed: ${error.message}`);
  }
  return true;
}

/**
 * v431 G3.1f — Vertragsfehler-Telemetrie für Re-Injection ohne Transport-Pointer.
 * Der Forwarder MUSS danach abbrechen: kein ungebundener Callback.
 */
export function logMissingReinjectPointer(fields: {
  function: string;
  sceneId: string | null;
  stage: string;
  externalJobId: string | null;
  runId?: string | null;
  generation?: number | null;
  passIdx?: number | null;
}): void {
  console.error(`${V431_OBSERVE_TAG} reinject_missing_pipeline_job_id`, JSON.stringify({
    function: fields.function,
    scene_id: fields.sceneId,
    stage: fields.stage,
    external_job_id: fields.externalJobId,
    run_id: fields.runId ?? null,
    generation: fields.generation ?? null,
    pass_idx: fields.passIdx ?? null,
  }));
}

/**
 * G3.1b — Dispatch-Failure-Semantik (Ledger-only).
 *
 * `rejected`  → der Provider hat den Auftrag nachweislich NICHT angenommen
 *               (4xx, Validierungsfehler, Abbruch vor dem Absenden) ⇒ `failed`.
 * `uncertain` → Ausgang unklar (Timeout, abgebrochener Fetch, 5xx, unbekannte
 *               Antwort, Function-Kill) ⇒ `dispatch_uncertain`, recoverable.
 *
 * Wirkt nur aus `pending`/`dispatching`; niemals über `dispatched`/`succeeded`
 * hinweg. Fasst ausschließlich `composer_pipeline_jobs` an — kein State-,
 * Output-, Mirror- oder Credit-Effekt.
 */
export async function settleLedgerDispatchFailure(
  admin: any,
  jobId: string | null | undefined,
  opts: { errorCode: string; outcome: "rejected" | "uncertain" },
): Promise<void> {
  if (!jobId) return;
  try {
    await admin
      .from("composer_pipeline_jobs")
      .update({
        status: opts.outcome === "rejected" ? "failed" : "dispatch_uncertain",
        error_code: opts.errorCode.slice(0, 120),
        completed_at: opts.outcome === "rejected" ? new Date().toISOString() : null,
      })
      .eq("id", jobId)
      .in("status", ["pending", "dispatching"]);
  } catch (e) {
    console.warn(`${V431_OBSERVE_TAG} ledger_settle_failed`, JSON.stringify({
      pipeline_job_id: jobId,
      outcome: opts.outcome,
      error: e instanceof Error ? e.message : String(e),
    }));
  }
}

/**
 * Konservative Klassifikation eines Dispatch-Fehlers.
 *
 * Nur eine nach Providervertrag beweisbare Nicht-Annahme darf `rejected`
 * werden. Alles andere bleibt `uncertain` — der Provider könnte den Auftrag
 * angenommen haben und später doch noch callbacken (D3/G3.1b).
 *
 * Ausdrücklich `uncertain`: 408 (Timeout), 409 (Konflikt beweist keine
 * Nicht-Annahme), 429 (Rate-Limit), alle 5xx, Netzwerkabbrüche, unbekannte
 * Antworten.
 */
export function classifyDispatchFailure(err: unknown): "rejected" | "uncertain" {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  // Zuerst die Codes, die niemals kippen dürfen.
  if (/\b(408|409|429|5\d{2})\b/.test(msg)) return "uncertain";
  if (/\b(400|401|403|404|422)\b/.test(msg)) return "rejected";
  if (/missing_run_stamp|invalid_input|validation_failed|invalid_request|unsupported|unauthorized|forbidden|aborted_before_dispatch/.test(msg)) {
    return "rejected";
  }
  return "uncertain";
}


/**
 * Synchron fertige Dispatches (z. B. ai-image, das sofort ein Ergebnis liefert)
 * haben keine externe Job-ID und dürfen nicht als offener Versand zurückbleiben.
 */
export async function completeLedgerJobImmediate(
  admin: any,
  jobId: string | null | undefined,
): Promise<void> {
  if (!jobId) return;
  try {
    await admin
      .from("composer_pipeline_jobs")
      .update({ status: "succeeded", completed_at: new Date().toISOString() })
      .eq("id", jobId)
      .in("status", ["pending", "dispatching"]);
  } catch (e) {
    console.warn(`${V431_OBSERVE_TAG} ledger_complete_failed`, JSON.stringify({
      pipeline_job_id: jobId,
      error: e instanceof Error ? e.message : String(e),
    }));
  }
}

export interface ReplaceLedgerAttemptParams {
  /** Pflicht: der abzulösende Attempt. Kein impliziter Retry. */
  previousJobId: string;
  /** Pflicht: dokumentierter Grund der Retry-Entscheidung. */
  retryReason: string;
  sceneId: string;
  runId: string;
  stage: PipelineStage;
  plateGeneration: number;
  provider?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * G3.1b — einziger erlaubter Retry-Einstieg.
 *
 * Ablösen des alten Attempts und Anlegen des neuen laufen atomar in EINER
 * Transaktion (`composer_replace_pipeline_attempt`): Row-Lock auf den
 * Vorgänger, Identitäts- und Ablösefähigkeitsprüfung, `stale` + INSERT
 * `attempt_no + 1` — oder gar nichts. Ein konkurrierender Ablöseversuch
 * verliert deterministisch und bekommt `null`; der Verlierer darf dann NICHT
 * dispatchen. Die neue `pipeline_job_id` steht erst nach dem Commit bereit.
 *
 * `previousJobId` und `retryReason` sind Pflicht — eine Initial-Akquise darf
 * hier niemals landen.
 */
export async function replaceLedgerAttempt(
  admin: any,
  params: ReplaceLedgerAttemptParams,
): Promise<LedgerJobHandle | null> {
  try {
    if (!params.previousJobId || !params.retryReason) {
      console.warn(`${V431_OBSERVE_TAG} ledger_replace_contract_violation`, JSON.stringify({
        scene_id: params.sceneId,
        stage: params.stage,
        has_previous_job_id: Boolean(params.previousJobId),
        has_retry_reason: Boolean(params.retryReason),
      }));
      return null;
    }
    const { data, error } = await admin.rpc("composer_replace_pipeline_attempt", {
      p_previous_job_id: params.previousJobId,
      p_expected_scene_id: params.sceneId,
      p_expected_run_id: params.runId,
      p_expected_stage: params.stage,
      p_expected_plate_generation: params.plateGeneration,
      p_provider: params.provider ?? null,
      p_metadata: {
        ...(params.metadata ?? {}),
        retry_reason: params.retryReason,
        retry_of_job_id: params.previousJobId,
      },
    });
    const row = Array.isArray(data) ? data[0] : data;

    if (error || !row?.job_id) {
      console.warn(`${V431_OBSERVE_TAG} ledger_replace_lost`, JSON.stringify({
        previous_job_id: params.previousJobId,
        scene_id: params.sceneId,
        stage: params.stage,
        error: error?.message ?? "no_row",
      }));
      return null;
    }
    return {
      id: String(row.job_id),
      attemptNo: Number(row.attempt_no ?? 0),
      runId: params.runId,
      plateGeneration: params.plateGeneration,
    };
  } catch (e) {
    console.warn(`${V431_OBSERVE_TAG} ledger_replace_threw`, JSON.stringify({
      previous_job_id: params.previousJobId,
      error: e instanceof Error ? e.message : String(e),
    }));
    return null;
  }
}

/**
 * G3.1b-Endvertrag — geschlossene Menge retryfähiger Failure-Gründe.
 *
 * Ein bereits `failed` gelaufener Attempt darf NUR mit einem dieser Gründe
 * erneut versucht werden. Es gibt kein generisches `retry=true`: ein Caller mit
 * unbekanntem Grund bekommt `failure_not_retryable` und dispatcht nicht.
 */
export const RETRYABLE_FAILURE_REASONS = [
  "provider_transient_error",
  "provider_timeout",
  "provider_rate_limited",
  "dispatch_uncertain_recovery",
  "watchdog_stalled",
  "poller_timeout",
  "mux_redispatch",
  // v431 G3.2.2 §5a — Spiegel der DB-Allowlist `composer_retryable_failure_reasons()`.
  "sync_noop_retryable",
] as const;


export type RetryableFailureReason = (typeof RETRYABLE_FAILURE_REASONS)[number];

export function isRetryableFailureReason(reason: string | null | undefined): boolean {
  return !!reason && (RETRYABLE_FAILURE_REASONS as readonly string[]).includes(reason);
}

export interface LedgerRetryContext {
  previousJobId: string;
  retryReason: string;
}

/**
 * Liest den expliziten Retry-Kontext (`retry_of_pipeline_job_id` +
 * `retry_reason`) aus Request-Body oder URL. Fehlt er, ist der Aufruf per
 * Definition ein Initial-Dispatch.
 */
export function readRetryContext(
  ...sources: Array<URL | Record<string, unknown> | null | undefined>
): LedgerRetryContext | null {
  for (const src of sources) {
    if (!src) continue;
    const get = (k: string): unknown =>
      src instanceof URL ? src.searchParams.get(k) : (src as Record<string, unknown>)[k];
    const prev = get("retry_of_pipeline_job_id");
    const reason = get("retry_reason");
    if (typeof prev === "string" && prev.length > 0) {
      return {
        previousJobId: prev,
        retryReason: typeof reason === "string" && reason.length > 0 ? reason : "unspecified",
      };
    }
  }
  return null;
}

/**
 * Verdikt der Dispatch-Entscheidung.
 *
 * `dispatch`    → der Aufrufer besitzt die Ledger-Zeile und darf senden.
 * `skip`        → es darf NICHT gesendet werden (bereits fertig, abgelöst,
 *                 in-flight, nicht retryfähig oder Race verloren).
 * `unavailable` → Ledger nicht verfügbar; Legacy-Pfad läuft fail-open weiter.
 */
export type LedgerDispatchDecision =
  | { outcome: "dispatch"; job: LedgerJobHandle; kind: "initial" | "retry" }
  | { outcome: "skip"; reason: string; job?: LedgerJobHandle }
  | { outcome: "unavailable"; reason: string };

/**
 * G3.1b — einziger Einstiegspunkt für Dispatcher, die sowohl Initial- als auch
 * Retry-Aufrufe bedienen (compose-dialog-segments, Mux, Watchdog-Ziele).
 *
 * Ohne Retry-Kontext: reine Initial-Akquise (Attempt 1, nie höher).
 * Mit Retry-Kontext: Predecessor-Verdikte
 *   succeeded → `already_completed`   (kein neuer Attempt)
 *   stale     → `retry_superseded`    (kein neuer Zweig, `replaced_by` folgen)
 *   failed    → nur bei retryfähigem Grund → atomarer Replace
 *   aktiv     → atomarer Replace
 * Ein verlorenes Replace-Race ergibt `skip`, niemals einen zweiten Dispatch.
 */
export async function resolveLedgerDispatch(
  admin: any,
  params: AcquireLedgerJobParams,
  retry: LedgerRetryContext | null,
): Promise<LedgerDispatchDecision> {
  if (!retry) {
    const acquisition = await acquireLedgerJob(admin, params);
    if (acquisition.outcome === "acquired") {
      return { outcome: "dispatch", job: acquisition.job, kind: "initial" };
    }
    if (acquisition.outcome === "already_in_flight") {
      return { outcome: "skip", reason: "already_in_flight", job: acquisition.job };
    }
    if (acquisition.outcome === "predecessor_exists") {
      // Terminaler Vorgänger ohne Retry-Kontext: das ist per Definition kein
      // Initial-Dispatch. Es entsteht KEIN Attempt N+1 über Acquire.
      console.warn(`${V431_OBSERVE_TAG} ledger_predecessor_requires_retry_context`, JSON.stringify({
        scene_id: params.sceneId,
        stage: params.stage,
        previous_job_id: acquisition.job.id,
        previous_status: acquisition.status,
      }));
      return { outcome: "skip", reason: "predecessor_requires_retry_context", job: acquisition.job };
    }
    return { outcome: "unavailable", reason: acquisition.reason };
  }


  let prev: any = null;
  try {
    const { data } = await admin
      .from("composer_pipeline_jobs")
      .select("id, scene_id, run_id, stage, plate_generation, attempt_no, status, replaced_by, error_code")
      .eq("id", retry.previousJobId)
      .maybeSingle();
    prev = data ?? null;
  } catch {
    prev = null;
  }

  if (!prev) {
    console.warn(`${V431_OBSERVE_TAG} ledger_retry_previous_not_found`, JSON.stringify({
      scene_id: params.sceneId,
      stage: params.stage,
      previous_job_id: retry.previousJobId,
    }));
    return { outcome: "skip", reason: "previous_job_not_found" };
  }

  const status = String(prev.status ?? "");
  if (status === "succeeded") {
    return { outcome: "skip", reason: "already_completed" };
  }
  if (status === "stale" || prev.replaced_by) {
    return { outcome: "skip", reason: "retry_superseded" };
  }
  if (status === "cancelled" || status === "canceled") {
    return { outcome: "skip", reason: "previous_cancelled" };
  }
  // Autorisierung liegt in der DB: `composer_replace_pipeline_attempt` prüft den
  // GESPEICHERTEN `error_code` des unter Lock gelesenen Vorgängers gegen die
  // geschlossene Allowlist. Diese Client-Vorprüfung spart nur den RPC-Roundtrip
  // und darf nichts autorisieren, was die DB ablehnen würde.
  if (status === "failed" && !isRetryableFailureReason(prev.error_code)) {
    console.warn(`${V431_OBSERVE_TAG} ledger_retry_reason_rejected`, JSON.stringify({
      scene_id: params.sceneId,
      stage: params.stage,
      previous_job_id: retry.previousJobId,
      stored_error_code: prev.error_code ?? null,
      caller_retry_reason: retry.retryReason,
    }));
    return { outcome: "skip", reason: "failure_not_retryable" };
  }


  const plateGeneration =
    typeof prev.plate_generation === "number" ? prev.plate_generation : params.plateGeneration ?? null;
  const runId = params.runId ? String(params.runId) : String(prev.run_id ?? "");
  if (plateGeneration == null || !runId) {
    return { outcome: "unavailable", reason: "no_retry_provenance" };
  }

  const replaced = await replaceLedgerAttempt(admin, {
    previousJobId: retry.previousJobId,
    retryReason: retry.retryReason,
    sceneId: params.sceneId,
    runId,
    stage: params.stage,
    plateGeneration,
    provider: params.provider ?? null,
    metadata: params.metadata,
  });

  if (!replaced) return { outcome: "skip", reason: "replace_lost" };
  return { outcome: "dispatch", job: replaced, kind: "retry" };
}

/**
 * v431 G3.2.2 §5a Schritt 5 — Adoption eines bereits in der Apply-Transaktion
 * erzeugten Replacement-Attempts.
 *
 * Der Dispatcher darf in diesem Fall KEINEN eigenen Attempt erzeugen (weder
 * Acquire noch Replace). Er übernimmt ausschließlich die übergebene Zeile,
 * nachdem Identität (Scene/Stage/Run/Generation) und Ungebundenheit
 * (`external_job_id IS NULL`, Status `pending`/`dispatching`) bestätigt sind.
 */
export async function adoptPreAcquiredLedgerJob(
  admin: any,
  jobId: string,
  expect: {
    sceneId: string;
    stage: PipelineStage;
    runId: string | null | undefined;
    plateGeneration?: number | null;
  },
): Promise<LedgerDispatchDecision> {
  let row: any = null;
  try {
    const { data } = await admin
      .from("composer_pipeline_jobs")
      .select("id, scene_id, run_id, stage, plate_generation, attempt_no, status, external_job_id, replaced_by")
      .eq("id", jobId)
      .maybeSingle();
    row = data ?? null;
  } catch {
    row = null;
  }
  if (!row) return { outcome: "skip", reason: "preacquired_job_not_found" };

  if (String(row.scene_id) !== expect.sceneId || String(row.stage) !== expect.stage) {
    return { outcome: "skip", reason: "preacquired_identity_mismatch" };
  }
  if (expect.runId && String(row.run_id) !== String(expect.runId)) {
    return { outcome: "skip", reason: "preacquired_stale_run" };
  }
  if (
    expect.plateGeneration != null &&
    typeof row.plate_generation === "number" &&
    row.plate_generation !== expect.plateGeneration
  ) {
    return { outcome: "skip", reason: "preacquired_stale_generation" };
  }
  if (row.external_job_id || row.replaced_by) {
    return { outcome: "skip", reason: "preacquired_already_bound" };
  }
  if (!["pending", "dispatching"].includes(String(row.status ?? ""))) {
    return { outcome: "skip", reason: "preacquired_not_dispatchable" };
  }

  return {
    outcome: "dispatch",
    kind: "retry",
    job: {
      id: String(row.id),
      attemptNo: Number(row.attempt_no ?? 1),
      runId: String(row.run_id),
      plateGeneration: typeof row.plate_generation === "number" ? row.plate_generation : null,
    },
  };
}




/** Extrahiert `pipeline_job_id` aus URL-Query, Body oder Provider-Metadaten. */
export function readPipelineJobId(
  ...sources: Array<URL | Record<string, unknown> | null | undefined>
): string | null {
  for (const src of sources) {
    if (!src) continue;
    const raw = src instanceof URL
      ? src.searchParams.get("pipeline_job_id")
      : (src as Record<string, unknown>)["pipeline_job_id"] ??
        (src as Record<string, unknown>)["pipelineJobId"];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
}

export type ObserveVerdict =
  | "bound"
  /** Job über `pipeline_job_id` eindeutig gefunden, `external_job_id` noch NULL. */
  | "binding_pending"
  | "missing_binding"
  | "job_not_found"
  | "wrong_job"
  | "stale_run"
  | "stale_generation"
  | "observe_error";

export interface ObserveInput {
  pipelineJobId: string | null;
  sceneId: string;
  stage: PipelineStage;
  externalJobId?: string | null;
  /** Callback-seitig gemeldeter Run — bestätigend, nie bestimmend. */
  reportedRunId?: string | null;
  handler: string;
}

export interface ObserveResult {
  verdict: ObserveVerdict;
  jobId: string | null;
  ledgerRunId: string | null;
  ledgerPlateGeneration: number | null;
}

/**
 * v431 G3.1d: append-only Diagnose-Insert (best effort, fail-open).
 *
 * Der einzige erlaubte Schreibpfad von Observe. Mutiert KEINE Produktionsdaten,
 * kennt keinen Retry und wirft nie nach außen. Ein Fehler wird ausschließlich
 * geloggt und darf Verdikt, HTTP-Status oder State-/Ledger-Pfad nicht ändern.
 */
async function recordObservationBestEffort(
  admin: any,
  row: {
    handler: string;
    verdict: string;
    stage: string | null;
    pipelineJobId: string | null;
    sceneId: string | null;
    runId: string | null;
    plateGeneration: number | null;
    externalJobId: string | null;
    details: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const { error } = await admin.rpc("composer_record_callback_observation", {
      p_handler: row.handler,
      p_verdict: row.verdict,
      p_stage: row.stage,
      p_pipeline_job_id: row.pipelineJobId,
      p_scene_id: row.sceneId,
      p_run_id: row.runId,
      p_plate_generation: row.plateGeneration,
      p_external_job_id: row.externalJobId,
      p_details: row.details ?? {},
    });
    if (error) {
      console.warn(`${V431_OBSERVE_TAG} telemetry_insert_failed`, error.message ?? String(error));
    }
  } catch (e) {
    console.warn(
      `${V431_OBSERVE_TAG} telemetry_insert_failed`,
      e instanceof Error ? e.message : String(e),
    );
  }
}

/**
 * G3.1 Observe: liest die Ledger-Bindung eines Callbacks und loggt sie.
 *
 * Mutiert keine Produktions-/Orchestrierungsdaten — weder Szene noch Job.
 * Einzige Ausnahme (G3.1d): ein append-only Diagnose-Insert, dessen Fehler
 * ignoriert wird. Das Ergebnis darf in G3.1 von keinem Handler als
 * Entscheidungsgrundlage benutzt werden; es speist ausschließlich das
 * Drain-Gate-Kriterium (0 × `missing_binding` über das Drain-Fenster).
 */
export async function observeCallbackProvenance(
  admin: any,
  input: ObserveInput,
): Promise<ObserveResult> {
  const base: ObserveResult = {
    verdict: "missing_binding",
    jobId: input.pipelineJobId,
    ledgerRunId: null,
    ledgerPlateGeneration: null,
  };

  // Verdikt bestimmen → Handler-Verhalten unverändert → Telemetrie best effort.
  const emit = async (r: ObserveResult, extra?: Record<string, unknown>) => {
    console.log(`${V431_OBSERVE_TAG}`, JSON.stringify({
      handler: input.handler,
      verdict: r.verdict,
      scene_id: input.sceneId,
      stage: input.stage,
      pipeline_job_id: r.jobId,
      ledger_run_id: r.ledgerRunId,
      ledger_plate_generation: r.ledgerPlateGeneration,
      reported_run_id: input.reportedRunId ?? null,
      external_job_id: input.externalJobId ?? null,
      ...(extra ?? {}),
    }));
    await recordObservationBestEffort(admin, {
      handler: input.handler,
      verdict: r.verdict,
      stage: input.stage ?? null,
      pipelineJobId: r.jobId,
      sceneId: input.sceneId ?? null,
      runId: r.ledgerRunId,
      plateGeneration: r.ledgerPlateGeneration,
      externalJobId: input.externalJobId ?? null,
      details: {
        reported_run_id: input.reportedRunId ?? null,
        ...(extra ?? {}),
      },
    });
    return r;
  };


  try {
    if (!input.pipelineJobId) return emit(base);

    const { data: job } = await admin
      .from("composer_pipeline_jobs")
      .select("id, scene_id, run_id, stage, plate_generation, external_job_id, status")
      .eq("id", input.pipelineJobId)
      .maybeSingle();

    if (!job) return emit({ ...base, verdict: "job_not_found" });

    const result: ObserveResult = {
      verdict: "bound",
      jobId: String(job.id),
      ledgerRunId: job.run_id ? String(job.run_id) : null,
      ledgerPlateGeneration:
        typeof job.plate_generation === "number" ? job.plate_generation : null,
    };

    if (String(job.scene_id) !== input.sceneId || String(job.stage) !== input.stage) {
      return emit({ ...result, verdict: "wrong_job" }, {
        ledger_scene_id: job.scene_id,
        ledger_stage: job.stage,
      });
    }
    if (input.externalJobId && !job.external_job_id) {
      // G3.1b: Callback ist schneller als `bindLedgerExternalJob()`. Der Job ist
      // über die `pipeline_job_id` eindeutig — das ist KEIN wrong_job, sondern
      // ein eigener, gezählter Zustand (Datengrundlage der G3.2-Entscheidung).
      return emit({ ...result, verdict: "binding_pending" }, {
        job_status: job.status,
      });
    }
    if (
      input.externalJobId && job.external_job_id &&
      String(job.external_job_id) !== String(input.externalJobId)
    ) {
      return emit({ ...result, verdict: "wrong_job" }, {
        ledger_external_job_id: job.external_job_id,
      });
    }

    const { data: scene } = await admin
      .from("composer_scenes")
      .select("active_run_id, plate_generation")
      .eq("id", input.sceneId)
      .maybeSingle();

    if (scene) {
      if (String(scene.active_run_id ?? "") !== String(result.ledgerRunId ?? "")) {
        return emit({ ...result, verdict: "stale_run" }, {
          scene_active_run_id: scene.active_run_id ?? null,
        });
      }
      if (
        result.ledgerPlateGeneration != null &&
        typeof scene.plate_generation === "number" &&
        scene.plate_generation !== result.ledgerPlateGeneration
      ) {
        return emit({ ...result, verdict: "stale_generation" }, {
          scene_plate_generation: scene.plate_generation,
        });
      }
    }

    return emit(result, { job_status: job.status });
  } catch (e) {
    return emit({ ...base, verdict: "observe_error" }, {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
