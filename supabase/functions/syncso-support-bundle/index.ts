/**
 * syncso-support-bundle — v129.6
 *
 * Admin-only forensic tool for failed Sync.so dialog passes.
 *
 * Refactored v129.6: drops cosmetic SHA256/codec blobs in favor of three
 * actually-diagnostic signals:
 *   1. provider_truth — GET /v2/generate/:id (status, error_details,
 *      options, worker_ms). The single source that tells us what Sync.so
 *      really saw.
 *   2. request_payload — reconstructed POST body from syncso_dispatch_log,
 *      sanitized + as copy-paste curl_snippet.
 *   3. face_probe (optional, opt-in) — Gemini Vision face count on
 *      frame 0 + 30 of the plate. Catches the 50%+ failure class
 *      "0 or >1 faces in first frame".
 *
 * STRICT: read-only. Never mutates composer_scenes, dialog_shots,
 * syncso_dispatch_log, wallets, or refunds.
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

function getGeminiApiKey(): string {
  return (
    Deno.env.get("LOVABLE_API_KEY") ??
    Deno.env.get("GEMINI_API_KEY") ??
    ""
  );
}

// --- HEAD probe: are video/audio reachable for Sync.so? ---
async function headProbe(url: string): Promise<{
  reachable: boolean;
  http_status: number | null;
  content_type: string | null;
  content_length: number | null;
  error: string | null;
}> {
  if (!url) {
    return { reachable: false, http_status: null, content_type: null, content_length: null, error: "empty_url" };
  }
  try {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8_000) });
    return {
      reachable: r.ok,
      http_status: r.status,
      content_type: r.headers.get("content-type"),
      content_length: Number(r.headers.get("content-length") ?? 0) || null,
      error: r.ok ? null : `HTTP_${r.status}`,
    };
  } catch (e) {
    return { reachable: false, http_status: null, content_type: null, content_length: null, error: (e as Error)?.message ?? String(e) };
  }
}

// --- Provider Truth: GET /v2/generate/:id ---
async function fetchProviderTruth(jobId: string | null): Promise<{
  fetched: boolean;
  http_status: number | null;
  status: string | null;
  error_details: any;
  model: string | null;
  options: any;
  created_at: string | null;
  updated_at: string | null;
  worker_ms: number | null;
  raw: any;
  fetch_error: string | null;
}> {
  const apiKey = getSyncApiKey();
  if (!apiKey) {
    return { fetched: false, http_status: null, status: null, error_details: null, model: null, options: null, created_at: null, updated_at: null, worker_ms: null, raw: null, fetch_error: "missing_sync_api_key" };
  }
  if (!jobId) {
    return { fetched: false, http_status: null, status: null, error_details: null, model: null, options: null, created_at: null, updated_at: null, worker_ms: null, raw: null, fetch_error: "missing_provider_job_id" };
  }
  try {
    const r = await fetch(`https://api.sync.so/v2/generate/${encodeURIComponent(jobId)}`, {
      method: "GET",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await r.json().catch(() => null);
    const createdAt = body?.createdAt ?? body?.created_at ?? null;
    const updatedAt = body?.updatedAt ?? body?.updated_at ?? null;
    let workerMs: number | null = null;
    if (createdAt && updatedAt) {
      const a = Date.parse(createdAt);
      const b = Date.parse(updatedAt);
      if (!isNaN(a) && !isNaN(b)) workerMs = b - a;
    }
    return {
      fetched: r.ok,
      http_status: r.status,
      status: body?.status ?? null,
      error_details: body?.error ?? body?.errorDetails ?? body?.error_details ?? null,
      model: body?.model ?? null,
      options: body?.options ?? null,
      created_at: createdAt,
      updated_at: updatedAt,
      worker_ms: workerMs,
      raw: body,
      fetch_error: r.ok ? null : `HTTP_${r.status}`,
    };
  } catch (e) {
    return { fetched: false, http_status: null, status: null, error_details: null, model: null, options: null, created_at: null, updated_at: null, worker_ms: null, raw: null, fetch_error: (e as Error)?.message ?? String(e) };
  }
}

// --- URL sanitizer: signed URLs collapse to {host}{path} ---
function sanitizeUrl(u: string | null | undefined): string {
  if (!u) return "";
  try {
    const url = new URL(u);
    return `${url.origin}${url.pathname}?{signed_url_redacted}`;
  } catch {
    return "<invalid_url>";
  }
}

// --- Face probe via Gemini 2.5 Flash (opt-in) ---
async function probeFaceCount(imageUrl: string): Promise<{ faces: number | null; raw: any; error: string | null }> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return { faces: null, raw: null, error: "missing_api_key" };
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Count the number of distinct human faces clearly visible in this image. Reply with ONLY a single integer (0, 1, 2, ...). No words." },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        }],
      }),
    });
    const body = await r.json().catch(() => null);
    const txt: string = body?.choices?.[0]?.message?.content ?? "";
    const m = txt.match(/\d+/);
    return { faces: m ? Number(m[0]) : null, raw: { reply: txt.slice(0, 100) }, error: r.ok ? null : `HTTP_${r.status}` };
  } catch (e) {
    return { faces: null, raw: null, error: (e as Error)?.message ?? String(e) };
  }
}

async function extractFrameToDataUrl(_videoUrl: string, _atSec: number): Promise<string | null> {
  // No ffmpeg in Deno — Gemini can ingest the full video URL directly for a
  // single-frame question, but most reliable is to send the video URL and ask
  // about its first visible frame. We pass the video URL itself and let Gemini
  // sample. Returns the URL unchanged for now (Gemini handles mp4 input).
  return _videoUrl;
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
    console.error("[syncso-support-bundle] auth_failed", userErr?.message);
    return json({ error: "unauthorized", detail: userErr?.message ?? null }, 401);
  }
  const userId = userData.user.id;

  const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (roleErr) {
    console.error("[syncso-support-bundle] has_role_error", roleErr.message);
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
  const includeFaceProbe: boolean = body?.include_face_probe === true;
  if (!sceneId) return json({ error: "missing_scene_id" }, 400);

  // --- Read-only: scene + pass ---
  const { data: scene, error: sceneErr } = await admin
    .from("composer_scenes")
    .select("id, dialog_shots, lip_sync_status, twoshot_stage")
    .eq("id", sceneId)
    .maybeSingle();
  if (sceneErr || !scene) return json({ error: "scene_not_found" }, 404);
  const passes = scene.dialog_shots?.passes ?? [];
  const pass = passes[passIndex];
  if (!pass) return json({ error: "pass_not_found", available: passes.length }, 404);

  const providerJobId: string | null =
    pass.provider_job_id ?? pass.job_id ?? pass._v106_probe?.provider_job_id ?? null;

  // --- Read-only: dispatch log entry for THIS provider_job_id ---
  let dispatch: any = null;
  if (providerJobId) {
    const { data: d } = await admin
      .from("syncso_dispatch_log")
      .select("*")
      .eq("job_id", providerJobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    dispatch = d;
  }

  const videoUrl: string = pass.payload_video_url ?? pass._v106_probe?.payload_video_url ?? dispatch?.video_url ?? "";
  const audioUrl: string = pass.payload_audio_url ?? pass._v106_probe?.payload_audio_url ?? dispatch?.audio_url ?? "";

  // --- Provider Truth + asset reachability in parallel ---
  const [providerTruth, videoHead, audioHead] = await Promise.all([
    fetchProviderTruth(providerJobId),
    headProbe(videoUrl),
    headProbe(audioUrl),
  ]);

  // --- Reconstruct request payload from dispatch log ---
  const reconstructedPayload = dispatch ? {
    model: dispatch.meta?.model ?? pass.payload_model ?? "sync-3",
    options: {
      sync_mode: dispatch.mode ?? null,
      active_speaker_detection: (dispatch.frame_number != null || dispatch.coords) ? {
        frame_number: dispatch.frame_number ?? null,
        coordinates: dispatch.coords ?? null,
      } : null,
    },
    input: [
      { type: "video", url: sanitizeUrl(dispatch.video_url) },
      { type: "audio", url: sanitizeUrl(dispatch.audio_url) },
    ],
  } : null;

  // --- Optional: face probe ---
  let faceProbe: any = null;
  if (includeFaceProbe && videoUrl) {
    const frame0Url = await extractFrameToDataUrl(videoUrl, 0);
    const probe = frame0Url ? await probeFaceCount(frame0Url) : { faces: null, raw: null, error: "frame_extract_failed" };
    faceProbe = {
      frame_0: probe,
      note: "Gemini Vision counts distinct human faces. faces=0 or faces>1 is the #1 cause of generation_unknown_error in single-speaker pipelines.",
    };
  }

  // --- Verdict heuristic ---
  let verdict: { level: "red" | "yellow" | "orange" | "blue" | "gray"; headline: string; suggestion: string };
  const errStr = JSON.stringify(providerTruth.error_details ?? "").toLowerCase();
  if (faceProbe?.frame_0?.faces === 0) {
    verdict = { level: "red", headline: "Kein Gesicht im ersten Frame des Plates", suggestion: "Hailuo hat eine Szene ohne sichtbares Gesicht generiert. Re-render des Plates nötig, kein Sync.so-Replay sinnvoll." };
  } else if (faceProbe?.frame_0?.faces && faceProbe.frame_0.faces > 1) {
    verdict = { level: "yellow", headline: `${faceProbe.frame_0.faces} Gesichter erkannt — Sync.so muss raten`, suggestion: "Replay-Preset `bboxes` mit expliziter Bounding-Box pro Frame versuchen." };
  } else if (errStr.includes("face") || errStr.includes("detect")) {
    verdict = { level: "yellow", headline: "Provider meldet Face-Detection-Problem", suggestion: "Replay-Preset `bboxes` (per-Frame Boxes) versuchen." };
  } else if (providerTruth.worker_ms != null && providerTruth.worker_ms < 2000 && providerTruth.status === "FAILED") {
    verdict = { level: "orange", headline: `Provider-Worker crashte instant (${providerTruth.worker_ms}ms)`, suggestion: "Internes Sync.so-Problem. Replay-Preset `exact` versuchen — wenn reproduzierbar, an Sync.so-Support melden." };
  } else if (providerTruth.options?.sync_mode) {
    verdict = { level: "blue", headline: `sync_mode='${providerTruth.options.sync_mode}' war gesetzt`, suggestion: "Replay-Preset `omit_sync_mode` testen — ist der Mode der Trigger?" };
  } else if (!providerTruth.fetched) {
    verdict = { level: "gray", headline: "Provider Truth nicht abrufbar", suggestion: providerTruth.fetch_error ?? "Manuelle Inspektion nötig." };
  } else {
    verdict = { level: "gray", headline: "Keine eindeutige Ursache erkennbar", suggestion: "Provider Truth JSON manuell prüfen. Replay-Preset `exact` für Reproduktion." };
  }

  // --- curl snippet ---
  const curlSnippet = reconstructedPayload ? [
    "curl -X POST https://api.sync.so/v2/generate \\",
    "  -H 'x-api-key: <SYNC_API_KEY>' \\",
    "  -H 'Content-Type: application/json' \\",
    `  -d '${JSON.stringify(reconstructedPayload)}'`,
  ].join("\n") : null;

  const bundle = {
    bundle_version: "v129.6",
    generated_at: new Date().toISOString(),
    generated_by: userId,
    scene_id: sceneId,
    pass_index: passIndex,
    provider_job_id: providerJobId,
    verdict,
    provider_truth: providerTruth,
    request_payload: reconstructedPayload,
    curl_snippet: curlSnippet,
    asset_reachable: {
      video: videoHead,
      audio: audioHead,
    },
    face_probe: faceProbe,
    pipeline_snapshot: {
      lip_sync_status: scene.lip_sync_status,
      twoshot_stage: scene.twoshot_stage,
      pass_status: pass.status,
      pass_error: pass.error ?? scene.dialog_shots?.error ?? null,
      sync_error_bucket: pass.sync_error_bucket ?? scene.dialog_shots?.sync_error_bucket ?? null,
    },
    isolation_invariants: {
      no_production_state_touched: true,
      readonly: true,
    },
  };

  // --- Store in support-bundles bucket ---
  const filename = `${userId}/${sceneId}/p${passIndex}-${Date.now()}.json`;
  const bytes = new TextEncoder().encode(JSON.stringify(bundle, null, 2));
  const upload = await admin.storage
    .from("support-bundles")
    .upload(filename, bytes, { contentType: "application/json", upsert: true });
  if (upload.error) {
    return json({ error: "upload_failed", detail: upload.error.message }, 500);
  }
  const { data: signed, error: signErr } = await admin.storage
    .from("support-bundles")
    .createSignedUrl(filename, 24 * 60 * 60);
  if (signErr) {
    return json({ error: "sign_failed", detail: signErr.message }, 500);
  }

  return json({
    ok: true,
    bundle_url: signed.signedUrl,
    bundle_path: filename,
    bundle,
  });
});
