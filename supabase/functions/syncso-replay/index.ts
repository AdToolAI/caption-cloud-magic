/**
 * syncso-replay — v129.5
 *
 * Admin-only forensic tool: re-dispatches a single Sync.so /generate call
 * based on an existing failed pass, with one of 7 documented override
 * presets. STRICTLY ISOLATED from production:
 *
 *   - never writes to composer_scenes, dialog_shots, syncso_dispatch_log
 *   - never refunds, never wakes the watchdog
 *   - webhookUrl ALWAYS points to syncso-replay-webhook, NEVER production
 *   - results land only in syncso_replay_log
 *
 * Body: { scene_id, pass_index, preset, overrides_json?, reason, confirm }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function getSyncApiKey(): string {
  return (
    Deno.env.get("SYNC_API_KEY") ??
    Deno.env.get("SYNC_SO_API_KEY") ??
    Deno.env.get("SYNCSO_API_KEY") ??
    ""
  );
}

const ALLOWED_MODELS = new Set(["sync-3", "lipsync-2-pro", "lipsync-2"]);
const ALLOWED_PRESETS = new Set([
  "exact",
  "omit_sync_mode",
  "loop",
  "bboxes",
  "auto_detect",
  "lipsync_2_pro",
  "lipsync_2",
  "custom",
]);

const MAX_REPLAYS_PER_PASS_PER_HOUR = 5;

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function probeHash(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    const buf = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

interface UrlProbeResult {
  url_present: boolean;
  valid_url: boolean;
  reachable: boolean;
  method?: string;
  http_status?: number;
  range_status?: number;
  error?: string;
}

async function probeUrl(url: string): Promise<UrlProbeResult> {
  if (!url) return { url_present: false, valid_url: false, reachable: false, error: "empty_url" };
  try {
    new URL(url);
  } catch {
    return { url_present: true, valid_url: false, reachable: false, error: "invalid_url" };
  }
  try {
    const r = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(8_000),
    });
    if (r.ok) return { url_present: true, valid_url: true, reachable: true, method: "HEAD", http_status: r.status };
    // S3 sometimes 403s on HEAD; try GET range 0-1
    const r2 = await fetch(url, {
      headers: { Range: "bytes=0-1" },
      signal: AbortSignal.timeout(8_000),
    });
    await r2.body?.cancel();
    return {
      url_present: true,
      valid_url: true,
      reachable: r2.ok || r2.status === 206,
      method: "GET_RANGE",
      http_status: r.status,
      range_status: r2.status,
      error: r2.ok || r2.status === 206 ? undefined : `head_${r.status}_range_${r2.status}`,
    };
  } catch (e) {
    return {
      url_present: true,
      valid_url: true,
      reachable: false,
      error: (e as Error)?.message ?? String(e),
    };
  }
}

function buildAsd(
  preset: string,
  v1291: any,
  videoFrameCount: number | null,
): any | undefined {
  // Default: doc-strict coordinates from v1291
  if (preset === "auto_detect") {
    return { auto_detect: true };
  }
  if (preset === "bboxes") {
    // Construct a per-frame bbox list from plate_coords (constant box).
    // Sync.so docs: bounding_boxes_url accepts a JSON of frame→[x,y,w,h].
    // We can also pass `bounding_boxes` inline for short clips.
    const coords = v1291?.transformed_coords_int ?? [360, 360];
    const half = 110; // ~same scale as the 220px crop in v129.1
    const x = Math.max(0, coords[0] - half);
    const y = Math.max(0, coords[1] - half);
    const box = [x, y, half * 2, half * 2];
    const frames = Math.max(1, videoFrameCount ?? 75);
    const bounding_boxes = [];
    for (let f = 0; f < frames; f++) {
      bounding_boxes.push({ frame_number: f, box });
    }
    return { bounding_boxes };
  }
  if (v1291) {
    return {
      frame_number: v1291.frame_number ?? 5,
      coordinates: v1291.transformed_coords_int ?? [360, 360],
      auto_detect: false,
    };
  }
  return undefined;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const token = authHeader.replace("Bearer ", "");

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    console.error("[syncso-replay] auth_failed", userErr?.message);
    return json({ error: "unauthorized", detail: userErr?.message ?? null }, 401);
  }
  const userId = userData.user.id;

  const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (roleErr) {
    console.error("[syncso-replay] has_role_error", roleErr.message);
    return json({ error: "role_check_failed", detail: roleErr.message }, 500);
  }
  if (!isAdmin) return json({ error: "forbidden_admin_only" }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const sceneId: string | undefined = body?.scene_id;
  const passIndex: number = Number.isInteger(body?.pass_index) ? body.pass_index : 0;
  const preset: string = body?.preset ?? "exact";
  const overridesJson: Record<string, unknown> = body?.overrides_json ?? {};
  const reason: string = body?.reason ?? "";
  const confirm: boolean = body?.confirm === true;
  if (!sceneId) return json({ error: "missing_scene_id" }, 400);
  if (!ALLOWED_PRESETS.has(preset)) {
    return json({ error: "invalid_preset", allowed: [...ALLOWED_PRESETS] }, 400);
  }
  if (!reason || reason.length < 5) {
    return json({ error: "reason_required_min_5_chars" }, 400);
  }
  if (!confirm) {
    return json({ error: "confirm_required", note: "set confirm: true to dispatch" }, 400);
  }

  // Load pass (read-only)
  const { data: scene, error: sceneErr } = await admin
    .from("composer_scenes")
    .select("id, dialog_shots")
    .eq("id", sceneId)
    .maybeSingle();
  if (sceneErr || !scene) return json({ error: "scene_not_found" }, 404);
  const passes = scene.dialog_shots?.passes ?? [];
  const pass = passes[passIndex];
  if (!pass) return json({ error: "pass_not_found", available: passes.length }, 404);
  const passId = `${sceneId}:${passIndex}`;

  // Original Job ID (for audit)
  const originalProviderJobId: string | null =
    pass.provider_job_id ?? pass.job_id ?? null;

  // Rate-limit: max N replays per pass per hour
  const { count: recentCount } = await admin
    .from("syncso_replay_log")
    .select("id", { count: "exact", head: true })
    .eq("pass_id", passId)
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((recentCount ?? 0) >= MAX_REPLAYS_PER_PASS_PER_HOUR) {
    return json(
      { error: "rate_limited", limit: MAX_REPLAYS_PER_PASS_PER_HOUR, window: "1h" },
      429,
    );
  }

  // Resolve original payload pieces (v129.7.1: fallback chain for current pass shape)
  const videoUrl: string =
    pass.payload_video_url
    ?? pass._v105_probe?.payload_video_url
    ?? pass.input_url
    ?? "";
  const audioUrl: string =
    pass.payload_audio_url
    ?? pass._v105_probe?.payload_audio_url
    ?? pass.audio_url
    ?? "";
  if (!videoUrl || !audioUrl) {
    return json({
      error: "missing_payload_urls",
      video_url_present: Boolean(videoUrl),
      audio_url_present: Boolean(audioUrl),
      available_pass_keys: Object.keys(pass ?? {}),
    }, 400);
  }

  // Pre-dispatch asset reachability probe (diagnostic, not a brittle hard gate for valid URLs)
  const [videoProbe, audioProbe] = await Promise.all([probeUrl(videoUrl), probeUrl(audioUrl)]);
  if (!videoProbe.valid_url || !audioProbe.valid_url) {
    console.error("[syncso-replay] invalid_asset_url", { sceneId, passIndex, video: videoProbe, audio: audioProbe });
    return json({
      error: "invalid_asset_url",
      video: videoProbe,
      audio: audioProbe,
    }, 422);
  }
  if (!videoProbe.reachable || !audioProbe.reachable) {
    console.error("[syncso-replay] asset_probe_unreachable_continuing", { sceneId, passIndex, video: videoProbe, audio: audioProbe });
  }

  // Determine model (v129.7.1: extended fallback)
  let model: string =
    pass.payload_model
    ?? pass._v106_probe?.payload_model
    ?? pass._v105_probe?.payload_model
    ?? pass._v102_probe?.payload_model
    ?? "sync-3";
  if (preset === "lipsync_2_pro") model = "lipsync-2-pro";
  if (preset === "lipsync_2") model = "lipsync-2";
  if (typeof overridesJson.model === "string") model = overridesJson.model as string;
  if (!ALLOWED_MODELS.has(model)) {
    return json(
      { error: "unsupported_model", model, allowed: [...ALLOWED_MODELS] },
      400,
    );
  }

  // Build options
  const v1291 = pass._v1291 ?? null;
  const videoFrames = Number(pass._v105_probe?.video_frames_expected ?? pass._v102_probe?.video_frames_expected ?? 75);
  const options: any = {};
  // sync_mode (v129.7.1: extended fallback)
  if (preset !== "omit_sync_mode") {
    let sm = pass.sync_mode
      ?? pass._v105_probe?.sync_mode
      ?? pass._v102_probe?.sync_mode
      ?? "cut_off";
    if (preset === "loop") sm = "loop";
    if (typeof overridesJson.sync_mode === "string") sm = overridesJson.sync_mode as string;
    options.sync_mode = sm;
  }
  // ASD
  const asd = buildAsd(preset, v1291, videoFrames);
  if (asd) options.active_speaker_detection = asd;

  // Replay webhook (NEVER production webhook)
  const replayWebhookSecret = Deno.env.get("REPLAY_WEBHOOK_SECRET") ?? "";
  const replayWebhookUrl =
    `${SUPABASE_URL}/functions/v1/syncso-replay-webhook` +
    (replayWebhookSecret ? `?token=${encodeURIComponent(replayWebhookSecret)}` : "");

  const payload: any = {
    model,
    options,
    input: [
      { type: "video", url: videoUrl },
      { type: "audio", url: audioUrl },
    ],
    webhookUrl: replayWebhookUrl,
  };

  const sentPayloadJson = JSON.parse(JSON.stringify(payload));
  // Strip secret before hashing/logging
  delete sentPayloadJson.webhookUrl;
  const sentPayloadHash = await sha256Hex(JSON.stringify(sentPayloadJson));

  const [videoSha, audioSha] = await Promise.all([
    probeHash(videoUrl),
    probeHash(audioUrl),
  ]);

  // Insert pending row FIRST so the replay-webhook can correlate by replay_provider_job_id later
  const { data: row, error: insertErr } = await admin
    .from("syncso_replay_log")
    .insert({
      pass_id: passId,
      scene_id: sceneId,
      original_provider_job_id: originalProviderJobId,
      created_by: userId,
      override_preset: preset,
      overrides_json: overridesJson,
      sent_payload_json: sentPayloadJson,
      sent_payload_hash: sentPayloadHash,
      video_sha256: videoSha,
      audio_sha256: audioSha,
      provider_status: "dispatching",
      reason,
    })
    .select("id")
    .single();
  if (insertErr || !row) {
    return json({ error: "log_insert_failed", detail: insertErr?.message }, 500);
  }

  // Dispatch to Sync.so
  const apiKey = getSyncApiKey();
  if (!apiKey) {
    await admin
      .from("syncso_replay_log")
      .update({
        provider_status: "config_error",
        provider_error: "missing SYNC_API_KEY",
      })
      .eq("id", row.id);
    return json({ error: "missing_sync_api_key" }, 500);
  }

  const startedAt = Date.now();
  let providerJobId: string | null = null;
  let providerStatus = "dispatched";
  let providerError: string | null = null;
  let providerErrorCode: string | null = null;
  let responseJson: any = null;
  let httpStatus = 0;

  try {
    const r = await fetch("https://api.sync.so/v2/generate", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    httpStatus = r.status;
    responseJson = await r.json().catch(() => ({ raw: "non_json" }));
    providerJobId = responseJson?.id ?? responseJson?.job_id ?? null;
    providerError = responseJson?.error ?? null;
    providerErrorCode = responseJson?.error_code ?? responseJson?.errorCode ?? null;
    if (!r.ok) {
      providerStatus = "dispatch_failed";
    }
  } catch (e) {
    providerStatus = "dispatch_crash";
    providerError = (e as Error)?.message ?? String(e);
    responseJson = { fetch_error: providerError };
  }

  const durationMs = Date.now() - startedAt;

  await admin
    .from("syncso_replay_log")
    .update({
      replay_provider_job_id: providerJobId,
      provider_status: providerStatus,
      provider_error: providerError,
      provider_error_code: providerErrorCode,
      response_json: responseJson,
      duration_ms: durationMs,
    })
    .eq("id", row.id);

  return json({
    ok: true,
    replay_log_id: row.id,
    pass_id: passId,
    replay_provider_job_id: providerJobId,
    original_provider_job_id: originalProviderJobId,
    http_status: httpStatus,
    provider_status: providerStatus,
    provider_error: providerError,
    provider_error_code: providerErrorCode,
    duration_ms: durationMs,
    asset_reachability: {
      video: videoProbe,
      audio: audioProbe,
      dispatched_despite_probe_failure: !videoProbe.reachable || !audioProbe.reachable,
    },
    sent_payload: sentPayloadJson,
    response: responseJson,
    isolation: {
      production_webhook_used: false,
      replay_webhook_used: true,
      no_scene_mutation: true,
      no_refund: true,
    },
  });
});
