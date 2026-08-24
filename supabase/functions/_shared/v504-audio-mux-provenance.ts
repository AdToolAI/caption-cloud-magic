export interface AudioMuxLedgerCandidate {
  id?: unknown;
  scene_id?: unknown;
  run_id?: unknown;
  stage?: unknown;
  plate_generation?: unknown;
  status?: unknown;
  external_job_id?: unknown;
}

export interface AudioMuxSceneProvenance {
  id: string;
  activeRunId: string | null;
  plateGeneration: number | null;
}

const REUSABLE_AUDIO_MUX_STATUSES = new Set([
  "pending",
  "dispatching",
  "dispatch_uncertain",
]);

/**
 * V504 — A render may only inherit an unbound audio_mux attempt from the
 * current scene epoch. A sync_segment pointer (or any already-bound attempt)
 * is never callback provenance for a new mux render.
 */
export function isReusableAudioMuxLedgerCandidate(
  candidate: AudioMuxLedgerCandidate | null | undefined,
  scene: AudioMuxSceneProvenance,
): candidate is AudioMuxLedgerCandidate & { id: string } {
  if (!candidate || typeof candidate.id !== "string" || candidate.id.length === 0) return false;
  if (candidate.scene_id !== scene.id || candidate.stage !== "audio_mux") return false;
  if (String(candidate.run_id ?? "") !== String(scene.activeRunId ?? "")) return false;
  if (Number(candidate.plate_generation) !== Number(scene.plateGeneration)) return false;
  if (!REUSABLE_AUDIO_MUX_STATUSES.has(String(candidate.status ?? ""))) return false;
  return candidate.external_job_id == null || candidate.external_job_id === "";
}