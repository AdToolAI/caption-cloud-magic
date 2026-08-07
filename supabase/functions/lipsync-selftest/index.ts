/**
 * lipsync-selftest — kreditfreier Gesundheitscheck der eingefrorenen
 * Lip-Sync-Kette (v400).
 *
 * Ruft KEINEN Provider auf und verbraucht KEINE Credits. Der Check prüft, ob
 * die Voraussetzungen für einen sauberen Lauf noch gegeben sind:
 *
 *   1. Contract   — der eingefrorene Vertrag ist ladbar und steht auf v400.
 *   2. Secrets    — alle für die Kette nötigen Keys sind gesetzt.
 *   3. Zustand    — keine Szene hängt jenseits des Watchdog-Limits fest.
 *   4. Slots      — keine verwaisten Inflight-Leases beim Provider.
 *   5. Golden Run — der Referenzlauf ist in der Datenbank noch auffindbar
 *                   und hat weiterhin die erwartete Payload-Form.
 *
 * Antwort: { ok, version, checks: [{ id, ok, detail }] }
 * HTTP 200 wenn alles grün, sonst 503 — damit ein Deploy-Gate darauf prüfen kann.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import {
  LIPSYNC_CONTRACT_VERSION,
  PRECLIP,
  PROVIDER,
  WATCHDOG_MS,
} from "../_shared/lipsync-frozen-contract.ts";

const GOLDEN_SCENE_ID = "c934a823-47de-49b7-a62e-a116b49ca3b2";

type Check = { id: string; ok: boolean; detail: string };

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const checks: Check[] = [];
  const push = (id: string, ok: boolean, detail: string) =>
    checks.push({ id, ok, detail });

  // 1. Contract ---------------------------------------------------------
  push(
    "contract_version",
    LIPSYNC_CONTRACT_VERSION === "v400",
    `version=${LIPSYNC_CONTRACT_VERSION}`,
  );
  push(
    "contract_values",
    PRECLIP.targetFaceShare === 0.42 &&
      PRECLIP.minCropSizePx === 128 &&
      PRECLIP.outputSizePx === 720 &&
      PROVIDER.model === "sync-3" &&
      PROVIDER.asdAutoDetect === false,
    `faceShare=${PRECLIP.targetFaceShare} minCrop=${PRECLIP.minCropSizePx} out=${PRECLIP.outputSizePx} model=${PROVIDER.model}`,
  );

  // 2. Secrets ----------------------------------------------------------
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "ELEVENLABS_API_KEY",
  ];
  const missing = required.filter((k) => !Deno.env.get(k));
  // Sync.so wird historisch unter drei Namen gelesen — einer davon genügt.
  const syncKey =
    Deno.env.get("SYNC_SO_API_KEY") ??
    Deno.env.get("SYNCSO_API_KEY") ??
    Deno.env.get("SYNC_API_KEY");
  if (!syncKey) missing.push("SYNC_SO_API_KEY|SYNCSO_API_KEY|SYNC_API_KEY");
  push(
    "secrets_present",
    missing.length === 0,
    missing.length === 0 ? "alle Keys gesetzt" : `fehlt: ${missing.join(", ")}`,
  );

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return json(
      { ok: false, version: LIPSYNC_CONTRACT_VERSION, checks },
      503,
    );
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // 3. Hängende Szenen ---------------------------------------------------
  try {
    const cutoff = new Date(Date.now() - WATCHDOG_MS.staleHard).toISOString();
    const { count, error } = await supabase
      .from("composer_scenes")
      .select("id", { count: "exact", head: true })
      .in("clip_status", ["generating", "lipsync", "composing", "queued"])
      .lt("updated_at", cutoff);
    if (error) throw error;
    push(
      "no_stuck_scenes",
      (count ?? 0) === 0,
      `${count ?? 0} Szenen älter als ${WATCHDOG_MS.staleHard / 60000} min`,
    );
  } catch (e) {
    push("no_stuck_scenes", false, `Abfrage fehlgeschlagen: ${String(e)}`);
  }

  // 4. Verwaiste Provider-Slots -----------------------------------------
  try {
    const cutoff = new Date(Date.now() - WATCHDOG_MS.staleProvider).toISOString();
    const { count, error } = await supabase
      .from("dialog_dispatch_locks")
      .select("scene_id", { count: "exact", head: true })
      .lt("acquired_at", cutoff);
    if (error) throw error;
    push(
      "no_orphan_locks",
      (count ?? 0) === 0,
      `${count ?? 0} Dispatch-Locks älter als ${WATCHDOG_MS.staleProvider / 60000} min`,
    );
  } catch (e) {
    push("no_orphan_locks", false, `Abfrage fehlgeschlagen: ${String(e)}`);
  }

  // 5. Golden Run --------------------------------------------------------
  try {
    const { data, error } = await supabase
      .from("composer_scenes")
      .select("id, pipeline_state, dialog_shots")
      .eq("id", GOLDEN_SCENE_ID)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      push("golden_run_present", false, "Referenzszene nicht mehr vorhanden");
    } else {
      const shots = (data.dialog_shots ?? {}) as Record<string, unknown>;
      const passes = Array.isArray(shots.passes) ? shots.passes : [];
      const probe = (passes[0] as Record<string, any> | undefined)?._v105_probe ?? {};
      const shapeOk =
        probe.preclip_used === true &&
        probe.asd_auto_detect === false &&
        probe.payload_model === PROVIDER.model &&
        probe.sync_mode === PROVIDER.syncMode;
      push(
        "golden_run_present",
        data.pipeline_state === "complete" && passes.length === 4,
        `state=${data.pipeline_state} passes=${passes.length}`,
      );
      push(
        "golden_run_payload_shape",
        shapeOk,
        `preclip_used=${probe.preclip_used} auto_detect=${probe.asd_auto_detect} model=${probe.payload_model} sync_mode=${probe.sync_mode}`,
      );
    }
  } catch (e) {
    push("golden_run_present", false, `Abfrage fehlgeschlagen: ${String(e)}`);
  }

  const ok = checks.every((c) => c.ok);
  console.log(
    `[lipsync-selftest] ok=${ok} ${checks.map((c) => `${c.id}=${c.ok ? "ok" : "FAIL"}`).join(" ")}`,
  );
  return json({ ok, version: LIPSYNC_CONTRACT_VERSION, checks }, ok ? 200 : 503);
});
