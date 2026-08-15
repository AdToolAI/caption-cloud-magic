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
 *     strukturiert — und schreibt NICHTS. Kein Handler-Verhalten ändert sich.
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

function keyOf(p: {
  sceneId: string;
  runId: string;
  stage: PipelineStage;
  segmentId?: string | null;
  attemptNo: number;
}): string {
  return [p.sceneId, p.runId, p.stage, p.segmentId ?? "-", String(p.attemptNo)].join(":");
}

/**
 * Legt (oder findet) die Ledger-Zeile für genau diesen Dispatch an.
 *
 * D9: Ein Auto-Retry derselben Stage im selben Run erhöht `attempt_no`,
 * niemals Run-ID oder Generation.
 *
 * Gibt `null` zurück, wenn keine belastbare Run-Identität existiert. In G3.1
 * ist das kein Fehler — der Legacy-Pfad läuft unverändert weiter und die
 * Observe-Telemetrie zählt die Lücke.
 */
export async function acquireLedgerJob(
  admin: any,
  params: AcquireLedgerJobParams,
): Promise<LedgerJobHandle | null> {
  try {
    const runId = params.runId ? String(params.runId) : null;
    if (!runId) {
      console.warn(`${V431_OBSERVE_TAG} ledger_skip_no_run`, JSON.stringify({
        scene_id: params.sceneId,
        stage: params.stage,
      }));
      return null;
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
        return null;
      }
      plateGeneration = typeof scene?.plate_generation === "number" ? scene.plate_generation : null;
    }

    // G3.1b: `plate_generation` ist DB-seitig beim INSERT Pflicht. Ohne
    // belastbare Generation wird gar keine Ledger-Zeile erzeugt (fail-closed
    // gegenüber dem Ledger, fail-open gegenüber dem Render) — die Lücke zählt
    // als Telemetrie in den Drain-Bericht.
    if (plateGeneration == null) {
      console.warn(`${V431_OBSERVE_TAG} ledger_skip_no_generation`, JSON.stringify({
        scene_id: params.sceneId,
        stage: params.stage,
        run_id: runId,
      }));
      return null;
    }

    // attempt_no = bestehende Versuche derselben (scene, run, stage, segment) + 1
    let countQuery = admin
      .from("composer_pipeline_jobs")
      .select("id", { count: "exact", head: true })
      .eq("scene_id", params.sceneId)
      .eq("run_id", runId)
      .eq("stage", params.stage);
    countQuery = params.segmentId
      ? countQuery.eq("segment_id", params.segmentId)
      : countQuery.is("segment_id", null);
    const { count } = await countQuery;
    const attemptNo = (typeof count === "number" ? count : 0) + 1;

    const idempotency_key = keyOf({
      sceneId: params.sceneId,
      runId,
      stage: params.stage,
      segmentId: params.segmentId ?? null,
      attemptNo,
    });

    const { data, error } = await admin
      .from("composer_pipeline_jobs")
      .upsert(
        {
          scene_id: params.sceneId,
          run_id: runId,
          run_contract_version: V427_RUN_CONTRACT_VERSION,
          stage: params.stage,
          segment_id: params.segmentId ?? null,
          speaker_id: params.speakerId ?? null,
          attempt_no: attemptNo,
          plate_generation: plateGeneration,
          provider: params.provider ?? null,
          idempotency_key,
          status: "dispatching",
          started_at: new Date().toISOString(),
          metadata: { ...(params.metadata ?? {}), ledger_source: "v431_g31" },
        },
        { onConflict: "idempotency_key", ignoreDuplicates: false },
      )
      .select("id, attempt_no, run_id, plate_generation")
      .maybeSingle();

    if (error || !data) {
      console.warn(`${V431_OBSERVE_TAG} ledger_insert_failed`, JSON.stringify({
        scene_id: params.sceneId,
        stage: params.stage,
        error: error?.message ?? "no_row",
      }));
      return null;
    }

    return {
      id: String(data.id),
      attemptNo: Number(data.attempt_no ?? attemptNo),
      runId,
      plateGeneration: typeof data.plate_generation === "number" ? data.plate_generation : null,
    };
  } catch (e) {
    console.warn(`${V431_OBSERVE_TAG} ledger_acquire_threw`, JSON.stringify({
      scene_id: params.sceneId,
      stage: params.stage,
      error: e instanceof Error ? e.message : String(e),
    }));
    return null;
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
 * G3.1 Observe: liest die Ledger-Bindung eines Callbacks und loggt sie.
 *
 * Schreibt NICHTS — weder Szene noch Job. Das Ergebnis darf in G3.1 von keinem
 * Handler als Entscheidungsgrundlage benutzt werden; es speist ausschließlich
 * das Drain-Gate-Kriterium (0 × `missing_binding` über das Drain-Fenster).
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

  const emit = (r: ObserveResult, extra?: Record<string, unknown>) => {
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
