/**
 * v381 — Generation-Provenance-Wächter.
 *
 * Die Klasse „alter Feed steckt noch in der Pipeline" wurde bisher nur
 * *verhindert* (v373 Generations-Vertrag, v377 Single-Run, v379 Webhook-
 * Locking, v380 vollständiger Reset). Verhindern ist nicht dasselbe wie
 * messen: wenn irgendein Pfad doch ein Artefakt einer Vorgeneration
 * hereinreicht, soll das nicht still weiterverarbeitet, sondern hart
 * abgebrochen und mit einem einheitlichen Log-Marker sichtbar werden.
 *
 * Aufrufpunkte (jeder Punkt, an dem ein Asset IN die Pipeline geht):
 *   - `plate_load`     — compose-dialog-segments, bevor die Plate benutzt wird
 *   - `preclip_cut`    — _shared/pass-face-preclip, vor dem Lambda-Schnitt
 *   - `sync_dispatch`  — compose-dialog-segments, vor dem Provider-Dispatch
 *   - `mux`            — sync-so-webhook, vor dem Audio-Mux-Claim
 *
 * Jeder Aufruf loggt `v381_generation_provenance`. Bei Abweichung liefert er
 * `ok:false` mit einem sprechenden Code — der Aufrufer MUSS abbrechen.
 */

export type ProvenanceStage =
  | "plate_load"
  | "preclip_cut"
  | "sync_dispatch"
  | "mux";

export interface ProvenanceCheckInput {
  supabase: any;
  sceneId: string;
  stage: ProvenanceStage;
  /**
   * Generation, unter der der aufrufende Code sein Material eingesammelt hat.
   * Fehlt sie, wird nur der Ist-Zustand geloggt und die interne Konsistenz
   * (`plate_ready_generation === plate_generation`) geprüft.
   */
  expectedGeneration?: number | null;
  /** Run-ID, unter der der Aufrufer gestartet ist. */
  expectedRunId?: string | null;
  /** Freitext für das Log, z. B. `pass=2` oder die Quell-URL. */
  note?: string;
}

export interface ProvenanceCheckResult {
  ok: boolean;
  code?:
    | "provenance_no_scene"
    | "provenance_no_active_run"
    | "provenance_generation_drift"
    | "provenance_run_drift"
    | "provenance_plate_from_older_generation";
  detail?: string;
  generation: number | null;
  readyGeneration: number | null;
  runId: string | null;
}

export async function assertGenerationProvenance(
  input: ProvenanceCheckInput,
): Promise<ProvenanceCheckResult> {
  const { supabase, sceneId, stage, expectedGeneration, expectedRunId, note } =
    input;

  const { data: row } = await supabase
    .from("composer_scenes")
    .select("plate_generation, plate_ready_generation, active_run_id")
    .eq("id", sceneId)
    .maybeSingle();

  const generation =
    row?.plate_generation == null ? null : Number(row.plate_generation);
  const readyGeneration =
    row?.plate_ready_generation == null
      ? null
      : Number(row.plate_ready_generation);
  const runId = row?.active_run_id == null ? null : String(row.active_run_id);

  const base = { generation, readyGeneration, runId };

  const emit = (result: ProvenanceCheckResult) => {
    const line =
      `[provenance] v381_generation_provenance stage=${stage} scene=${sceneId} ` +
      `verdict=${result.ok ? "ok" : result.code} ` +
      `gen=${generation ?? "none"} ready_gen=${readyGeneration ?? "none"} run=${runId ?? "none"} ` +
      `expected_gen=${expectedGeneration ?? "-"} expected_run=${expectedRunId ?? "-"}` +
      (note ? ` ${note}` : "");
    if (result.ok) console.log(line);
    else console.error(line);
    return result;
  };

  if (!row) {
    return emit({ ...base, ok: false, code: "provenance_no_scene" });
  }

  if (!runId) {
    return emit({ ...base, ok: false, code: "provenance_no_active_run" });
  }

  if (
    expectedGeneration != null &&
    Number(expectedGeneration) !== Number(generation)
  ) {
    return emit({
      ...base,
      ok: false,
      code: "provenance_generation_drift",
      detail: `expected ${expectedGeneration}, scene is at ${generation}`,
    });
  }

  if (expectedRunId != null && String(expectedRunId) !== runId) {
    return emit({
      ...base,
      ok: false,
      code: "provenance_run_drift",
      detail: `expected ${expectedRunId}, scene is at ${runId}`,
    });
  }

  // Die Plate selbst muss aus dem aktuellen Lauf stammen. `plate_ready_generation`
  // wird vom DB-Trigger `stamp_plate_generation` gesetzt, sobald eine neue
  // `clip_url` geschrieben wird. Für `plate_load` / `preclip_cut` / `sync_dispatch`
  // ist eine ältere Ready-Generation ein harter Abbruchgrund.
  if (stage !== "mux" && readyGeneration !== generation) {
    return emit({
      ...base,
      ok: false,
      code: "provenance_plate_from_older_generation",
      detail: `plate ready_gen=${readyGeneration}, current gen=${generation}`,
    });
  }

  return emit({ ...base, ok: true });
}

/** Menschlich lesbare Meldung für die UI. */
export function provenanceMessage(code: string | undefined): string {
  switch (code) {
    case "provenance_no_scene":
      return "Die Szene existiert nicht mehr.";
    case "provenance_no_active_run":
      return "Für diese Szene läuft kein aktiver Durchlauf. Bitte den Clip neu generieren.";
    case "provenance_generation_drift":
    case "provenance_run_drift":
      return "Die Szene wurde zwischenzeitlich neu gestartet. Dieser Durchlauf wurde abgebrochen, damit kein altes Material verarbeitet wird.";
    case "provenance_plate_from_older_generation":
      return "Die vorliegende Video-Plate stammt aus einem früheren Durchlauf. Lip-Sync startet automatisch, sobald die neue Plate fertig ist.";
    default:
      return "Der Durchlauf wurde aus Konsistenzgründen abgebrochen.";
  }
}
