/**
 * syncso-support-bundle — v129.5
 *
 * Admin-only forensic tool: generates a JSON support bundle for a single
 * failed Sync.so dialog pass. Bundles together the original dispatch
 * fingerprint, the provider-truth response from GET /v2/generate/:id,
 * sha256+ffprobe-style metadata for the video/audio inputs, and a
 * sanitized reproducer payload.
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

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface AssetReport {
  url: string;
  http_status: number;
  content_type: string;
  content_length: number;
  sha256: string | null;
  bytes_fetched: number;
  fetch_error: string | null;
}

async function probeAndHash(url: string): Promise<AssetReport> {
  const out: AssetReport = {
    url,
    http_status: 0,
    content_type: "",
    content_length: 0,
    sha256: null,
    bytes_fetched: 0,
    fetch_error: null,
  };
  if (!url) {
    out.fetch_error = "empty_url";
    return out;
  }
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    out.http_status = r.status;
    out.content_type = r.headers.get("content-type") ?? "";
    out.content_length = Number(r.headers.get("content-length") ?? 0) || 0;
    if (!r.ok) {
      out.fetch_error = `HTTP_${r.status}`;
      await r.body?.cancel();
      return out;
    }
    const buf = new Uint8Array(await r.arrayBuffer());
    out.bytes_fetched = buf.byteLength;
    out.sha256 = await sha256Hex(buf);
    return out;
  } catch (e) {
    out.fetch_error = (e as Error)?.message ?? String(e);
    return out;
  }
}

/**
 * Inspect a 16-bit PCM WAV header for sample-rate / channels / duration.
 * Returns null if the buffer is not a parseable RIFF/WAVE.
 */
function inspectWavLite(bytes: Uint8Array | null): {
  sample_rate: number;
  channels: number;
  duration_sec: number;
  codec: string;
} | null {
  if (!bytes || bytes.byteLength < 44) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const wave = String.fromCharCode(...bytes.slice(8, 12));
  if (riff !== "RIFF" || wave !== "WAVE") return null;
  // Walk chunks
  let off = 12;
  let sr = 0,
    ch = 0,
    bps = 16,
    dataSize = 0,
    fmt = 1;
  while (off + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(...bytes.slice(off, off + 4));
    const size = dv.getUint32(off + 4, true);
    if (id === "fmt ") {
      fmt = dv.getUint16(off + 8, true);
      ch = dv.getUint16(off + 10, true);
      sr = dv.getUint32(off + 12, true);
      bps = dv.getUint16(off + 22, true);
    } else if (id === "data") {
      dataSize = size;
      break;
    }
    off += 8 + size + (size % 2);
  }
  if (!sr || !ch) return null;
  const bytesPerSample = Math.max(1, Math.floor(bps / 8));
  const frames = dataSize / (ch * bytesPerSample);
  return {
    sample_rate: sr,
    channels: ch,
    duration_sec: +(frames / sr).toFixed(3),
    codec: fmt === 1 ? "pcm_s16le" : `wav_fmt_${fmt}`,
  };
}

/**
 * Inspect an MP4 'mvhd' atom to recover duration + timescale. Best-effort.
 */
function inspectMp4Lite(
  bytes: Uint8Array | null,
): { duration_sec: number; codec_hint: string } | null {
  if (!bytes || bytes.byteLength < 32) return null;
  // Find "mvhd" anywhere in first ~256KB
  const scan = bytes.subarray(0, Math.min(bytes.byteLength, 262_144));
  for (let i = 0; i < scan.byteLength - 16; i++) {
    if (
      scan[i] === 0x6d &&
      scan[i + 1] === 0x76 &&
      scan[i + 2] === 0x68 &&
      scan[i + 3] === 0x64
    ) {
      const dv = new DataView(scan.buffer, scan.byteOffset, scan.byteLength);
      const ver = scan[i + 4];
      try {
        if (ver === 0) {
          const ts = dv.getUint32(i + 16, false);
          const dur = dv.getUint32(i + 20, false);
          if (ts > 0) return { duration_sec: +(dur / ts).toFixed(3), codec_hint: "mp4" };
        } else if (ver === 1) {
          const ts = dv.getUint32(i + 24, false);
          const durHi = dv.getUint32(i + 28, false);
          const durLo = dv.getUint32(i + 32, false);
          const dur = durHi * 2 ** 32 + durLo;
          if (ts > 0) return { duration_sec: +(dur / ts).toFixed(3), codec_hint: "mp4" };
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function fetchProviderTruth(jobId: string | null): Promise<{
  ok: boolean;
  http_status: number | null;
  body: any;
  error_code_missing: boolean;
}> {
  const apiKey = getSyncApiKey();
  if (!apiKey || !jobId) {
    return { ok: false, http_status: null, body: null, error_code_missing: true };
  }
  try {
    const r = await fetch(
      `https://api.sync.so/v2/generate/${encodeURIComponent(jobId)}`,
      {
        method: "GET",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10_000),
      },
    );
    const body = await r.json().catch(() => null);
    const code =
      body && (body.error_code ?? body.errorCode ?? null);
    return {
      ok: r.ok,
      http_status: r.status,
      body,
      error_code_missing: !code,
    };
  } catch (e) {
    return {
      ok: false,
      http_status: null,
      body: { fetch_error: (e as Error)?.message ?? String(e) },
      error_code_missing: true,
    };
  }
}

function sanitizePayload(p: any): any {
  if (!p || typeof p !== "object") return p;
  const clone = JSON.parse(JSON.stringify(p));
  // Remove anything resembling a secret or production webhook
  if (clone.webhookUrl) clone.webhookUrl = "<REDACTED:original-production-webhook>";
  if (clone.webhook_url) clone.webhook_url = "<REDACTED:original-production-webhook>";
  return clone;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Auth: validate user + admin role
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (claimsErr || !claims?.claims?.sub) return json({ error: "unauthorized" }, 401);
  const userId = claims.claims.sub as string;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: isAdmin } = await admin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) return json({ error: "forbidden_admin_only" }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const sceneId: string | undefined = body?.scene_id;
  const passIndex: number = Number.isInteger(body?.pass_index) ? body.pass_index : 0;
  if (!sceneId) return json({ error: "missing_scene_id" }, 400);

  // Load scene + dispatch log (read-only)
  const { data: scene, error: sceneErr } = await admin
    .from("composer_scenes")
    .select("id, dialog_shots, lip_sync_status, twoshot_stage")
    .eq("id", sceneId)
    .maybeSingle();
  if (sceneErr || !scene) return json({ error: "scene_not_found" }, 404);
  const passes = scene.dialog_shots?.passes ?? [];
  const pass = passes[passIndex];
  if (!pass) return json({ error: "pass_not_found", available: passes.length }, 404);

  const passId = `${sceneId}:${passIndex}`;
  const providerJobId: string | null =
    pass.provider_job_id ?? pass.job_id ?? pass._v106_probe?.provider_job_id ?? null;

  // Latest dispatch log entry (for fingerprint)
  const { data: dispatches } = await admin
    .from("syncso_dispatch_log")
    .select("*")
    .eq("scene_id", sceneId)
    .order("created_at", { ascending: false })
    .limit(10);

  // Fetch + hash video/audio in parallel
  const videoUrl: string = pass.payload_video_url ?? pass._v106_probe?.payload_video_url ?? "";
  const audioUrl: string = pass.payload_audio_url ?? pass._v106_probe?.payload_audio_url ?? "";
  const [videoReport, audioReport, providerTruth] = await Promise.all([
    probeAndHash(videoUrl),
    probeAndHash(audioUrl),
    fetchProviderTruth(providerJobId),
  ]);

  // Light decode (no ffmpeg in Deno) — best-effort
  let audioMeta: any = null;
  let videoMeta: any = null;
  if (audioReport.bytes_fetched > 0) {
    try {
      const r2 = await fetch(audioUrl, { signal: AbortSignal.timeout(15_000) });
      audioMeta = inspectWavLite(new Uint8Array(await r2.arrayBuffer()));
    } catch { /* noop */ }
  }
  if (videoReport.bytes_fetched > 0) {
    try {
      const r2 = await fetch(videoUrl, { signal: AbortSignal.timeout(15_000) });
      videoMeta = inspectMp4Lite(new Uint8Array(await r2.arrayBuffer()));
    } catch { /* noop */ }
  }

  // Reconstruct sanitized original payload from pass probes
  const originalPayload = {
    model: pass.payload_model ?? pass._v106_probe?.payload_model ?? "sync-3",
    options: {
      sync_mode: pass.sync_mode ?? "cut_off",
      active_speaker_detection: pass._v1291
        ? {
            frame_number: pass._v1291.frame_number,
            coordinates: pass._v1291.transformed_coords_int,
            auto_detect: false,
          }
        : null,
    },
    input: [
      { type: "video", url: videoUrl },
      { type: "audio", url: audioUrl },
    ],
  };

  const bundle = {
    bundle_version: "v129.5",
    generated_at: new Date().toISOString(),
    generated_by: userId,
    pass_id: passId,
    scene_id: sceneId,
    pass_index: passIndex,
    pipeline_snapshot: {
      lip_sync_status: scene.lip_sync_status,
      twoshot_stage: scene.twoshot_stage,
      pass_status: pass.status,
      pass_error: pass.error ?? scene.dialog_shots?.error ?? null,
      last_error_class:
        pass.last_error_class ?? scene.dialog_shots?.last_error_class ?? null,
      sync_error_bucket:
        pass.sync_error_bucket ?? scene.dialog_shots?.sync_error_bucket ?? null,
      scene_failure_source:
        scene.dialog_shots?.scene_failure_source ?? null,
      v1291: pass._v1291 ?? null,
      v1291_ambiguity: pass._v1291_ambiguity ?? null,
      v105_probe: pass._v105_probe ?? null,
      v106_probe: pass._v106_probe ?? null,
      audio_normalization: pass.audio_normalization ?? null,
      provider_input_fingerprint:
        dispatches?.[0]?.meta?.provider_input_fingerprint ?? null,
    },
    provider_truth: {
      provider_job_id: providerJobId,
      get_generation: providerTruth,
      error_code_missing: providerTruth.error_code_missing,
    },
    assets: {
      video: {
        ...videoReport,
        meta: videoMeta,
      },
      audio: {
        ...audioReport,
        meta: audioMeta,
      },
    },
    original_payload_sanitized: sanitizePayload(originalPayload),
    reproducer_curl: [
      "curl -X POST https://api.sync.so/v2/generate \\",
      "  -H 'x-api-key: <SYNC_API_KEY>' \\",
      "  -H 'Content-Type: application/json' \\",
      "  -d '" + JSON.stringify(originalPayload) + "'",
    ].join("\n"),
    dispatch_log_recent: (dispatches ?? []).slice(0, 5).map((d: any) => ({
      created_at: d.created_at,
      status: d.status,
      provider_job_id: d.provider_job_id,
      error: d.error,
      error_code: d.error_code,
      meta: d.meta,
    })),
    isolation_invariants: {
      no_production_state_touched: true,
      readonly: true,
    },
  };

  // Store in support-bundles bucket
  const filename = `${userId}/${sceneId}/p${passIndex}-${Date.now()}.json`;
  const bytes = new TextEncoder().encode(JSON.stringify(bundle, null, 2));
  const upload = await admin.storage
    .from("support-bundles")
    .upload(filename, bytes, {
      contentType: "application/json",
      upsert: true,
    });
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
    pass_id: passId,
    bundle_url: signed.signedUrl,
    bundle_path: filename,
    summary: {
      provider_error_code_present: !providerTruth.error_code_missing,
      provider_error_code:
        providerTruth.body?.error_code ?? providerTruth.body?.errorCode ?? null,
      provider_error: providerTruth.body?.error ?? null,
      video_sha256: videoReport.sha256,
      audio_sha256: audioReport.sha256,
      video_meta: videoMeta,
      audio_meta: audioMeta,
    },
    bundle,
  });
});
