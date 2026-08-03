/**
 * scene-run-begin — "Ein Neustart beginnt bei null".
 *
 * Bis hierher schrieben die Startstellen in `compose-video-clips` beim
 * Neustart einer Szene lediglich `clip_status='generating'`. Alles andere aus
 * dem Vorlauf blieb stehen:
 *
 *   - `clip_url` (das ALTE Video) → die Kachel zeigte weiter den Vorlauf,
 *     der Neustart war unsichtbar,
 *   - `dialog_shots` mit noch laufenden Sync.so-Pässen → deren späte
 *     Ergebnisse schrieben in dieselbe Zeile und belegten weiter Slots.
 *
 * `beginSceneRun()` ist die EINE Definition von "neuer Lauf":
 *   1. laufende Provider-Jobs beenden (reset-lipsync-scene: kündigt Sync.so,
 *      gibt Slots frei, erstattet Credits) — nur wenn aktive Pässe existieren,
 *   2. Lip-Sync-Zustand und Dispatch-Sperren leeren,
 *   3. sichtbares Ergebnis des Vorlaufs leeren,
 *   4. neuen Lauf stempeln (`active_run_id`, `plate_generation`) und
 *      `clip_status='generating'` setzen.
 *
 * Die Lip-Sync-Kette selbst wird NICHT verändert — hier wird nur aufgeräumt
 * und gestempelt.
 */

type SupabaseLike = {
  from: (table: string) => any;
};

const ACTIVE_PASS_STATES = [
  "queued",
  "rendering",
  "retrying",
  "pending",
  "dispatched",
  "processing",
];

export function hasActiveSyncPasses(dialogShots: unknown): boolean {
  const ds = (dialogShots ?? null) as any;
  if (!ds || typeof ds !== "object") return false;
  if (typeof ds.sync_job_id === "string" && ds.sync_job_id.length > 0) return true;
  const passes = Array.isArray(ds.passes) ? ds.passes : [];
  if (
    passes.some(
      (p: any) =>
        typeof p?.job_id === "string" &&
        p.job_id.length > 0 &&
        ACTIVE_PASS_STATES.includes(String(p?.status ?? "")),
    )
  ) {
    return true;
  }
  const shots = Array.isArray(ds.shots) ? ds.shots : [];
  return shots.some(
    (s: any) => typeof s?.sync_job_id === "string" && s.sync_job_id.length > 0,
  );
}

async function cancelInflightProviderJobs(sceneId: string): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  try {
    const res = await fetch(`${url}/functions/v1/reset-lipsync-scene`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
      body: JSON.stringify({ scene_id: sceneId, reason: "scene_run_restart" }),
    });
    console.log(
      `[beginSceneRun] cancel_inflight scene=${sceneId} status=${res.status}`,
    );
  } catch (e) {
    // Non-fatal: the hard purge below still removes the pointers, and the
    // lipsync-watchdog reclaims orphaned leases.
    console.warn(`[beginSceneRun] cancel_inflight failed scene=${sceneId}`, e);
  }
}

export interface BeginSceneRunResult {
  sceneId: string;
  runId: string;
  generation: number;
  canceledInflight: boolean;
}

/**
 * Startet für jede übergebene Szene einen frischen Lauf. Fehler pro Szene sind
 * nicht fatal (der Render darf laufen), werden aber protokolliert.
 */
export async function beginSceneRun(
  supabaseAdmin: SupabaseLike,
  sceneIds: string[],
  reason = "clip_render_start",
): Promise<BeginSceneRunResult[]> {
  const ids = (sceneIds ?? []).filter(
    (id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id),
  );
  if (ids.length === 0) return [];

  const { data: rows, error } = await supabaseAdmin
    .from("composer_scenes")
    .select("id, dialog_shots, plate_generation")
    .in("id", ids);
  if (error) {
    console.warn("[beginSceneRun] scene read failed", error);
  }

  const results: BeginSceneRunResult[] = [];

  for (const id of ids) {
    const row = (rows ?? []).find((r: any) => r.id === id) ?? null;
    const active = hasActiveSyncPasses(row?.dialog_shots);
    if (active) {
      await cancelInflightProviderJobs(id);
    }

    const runId = crypto.randomUUID();
    const generation = Number(row?.plate_generation ?? 0) + 1;
    const nowIso = new Date().toISOString();

    try {
      const { error: updErr } = await supabaseAdmin
        .from("composer_scenes")
        .update({
          // 3. sichtbares Ergebnis des Vorlaufs
          clip_url: null,
          first_frame_url: null,
          last_frame_url: null,
          clip_error: null,
          replicate_prediction_id: null,
          // 2. Lip-Sync-Zustand
          dialog_shots: null,
          lip_sync_status: null,
          lip_sync_applied_at: null,
          lip_sync_source_clip_url: null,
          twoshot_stage: null,
          // 4. Stempel + Startzustand
          active_run_id: runId,
          active_run_started_at: nowIso,
          plate_generation: generation,
          clip_status: "generating",
          updated_at: nowIso,
        })
        .eq("id", id);
      if (updErr) {
        console.warn(`[beginSceneRun] purge failed scene=${id}`, updErr);
      }
    } catch (e) {
      console.warn(`[beginSceneRun] purge crashed scene=${id}`, e);
    }

    // Dispatch-Sperren des Vorlaufs entfernen, damit der neue Lauf nicht auf
    // einer verwaisten Sperre stehen bleibt.
    try {
      await supabaseAdmin.from("dialog_dispatch_locks").delete().eq("scene_id", id);
    } catch (_) {
      /* best effort */
    }

    console.log(
      `[beginSceneRun] scene=${id} run_id=${runId} generation=${generation} reason=${reason} canceled_inflight=${active}`,
    );
    results.push({ sceneId: id, runId, generation, canceledInflight: active });
  }

  return results;
}
