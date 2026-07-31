/**
 * report-plate-motion-track (v327)
 * ────────────────────────────────────────────────────────────────────────
 * Receives client-sampled plate frames (canvas JPEG captures uploaded to the
 * `composer-frames` bucket), runs AWS Rekognition DetectFaces on each frame,
 * chains the detections into per-slot face trajectories and persists them on
 * `composer_scenes.motion_track`.
 *
 * `compose-dialog-segments` reads that track right before dispatch: speakers
 * classified `static` keep the untouched legacy preclip pipeline, `moving`
 * speakers get a full-plate dispatch with per-frame bounding boxes.
 *
 * Fail-open by contract — every error path returns 200 with `ok:false` so the
 * client never blocks the lip-sync trigger on a motion probe.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  buildSlotTracks,
  MOTION_TRACK_VERSION,
  type DetectedFrameFace,
  type MotionTrack,
} from "../_shared/face-motion-track.ts";

const AWS_REGION_PATTERN = /^[a-z]{2}(-gov)?-[a-z]+-\d$/;
const DEFAULT_REGION = "us-east-1";
const REGION = (() => {
  const override = (Deno.env.get("REKOGNITION_REGION") ?? "").trim();
  if (override && AWS_REGION_PATTERN.test(override)) return override;
  const raw = (Deno.env.get("AWS_REGION") ?? "").trim();
  if (raw && AWS_REGION_PATTERN.test(raw)) return raw;
  return DEFAULT_REGION;
})();
const HOST = `rekognition.${REGION}.amazonaws.com`;
const ENDPOINT = `https://${HOST}/`;
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";

const MAX_FRAMES = 12;
const FETCH_TIMEOUT_MS = 10_000;
const REK_TIMEOUT_MS = 12_000;

function ok(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ── SigV4 ─────────────────────────────────────────────────────────────── */
async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    "raw",
    key instanceof Uint8Array ? key : new Uint8Array(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
}

async function signingKey(secret: string, dateStamp: string) {
  const kDate = await hmac(new TextEncoder().encode("AWS4" + secret), dateStamp);
  const kRegion = await hmac(kDate, REGION);
  const kService = await hmac(kRegion, "rekognition");
  return await hmac(kService, "aws4_request");
}

async function detectFaces(bytes: Uint8Array, imgW: number, imgH: number): Promise<DetectedFrameFace[]> {
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) throw new Error("aws_credentials_missing");
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const payloadJson = JSON.stringify({ Image: { Bytes: btoa(bin) }, Attributes: ["DEFAULT"] });

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const target = "RekognitionService.DetectFaces";
  const canonicalHeaders =
    `content-type:application/x-amz-json-1.1\nhost:${HOST}\nx-amz-date:${amzDate}\nx-amz-target:${target}\n`;
  const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
  const canonicalRequest = [
    "POST", "/", "", canonicalHeaders, signedHeaders, await sha256Hex(payloadJson),
  ].join("\n");
  const credentialScope = `${dateStamp}/${REGION}/rekognition/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256Hex(canonicalRequest),
  ].join("\n");
  const sigBytes = await hmac(await signingKey(AWS_SECRET_ACCESS_KEY, dateStamp), stringToSign);
  const signature = Array.from(new Uint8Array(sigBytes)).map((b) => b.toString(16).padStart(2, "0")).join("");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REK_TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Date": amzDate,
        "X-Amz-Target": target,
        "Authorization":
          `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, ` +
          `SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      body: payloadJson,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`detect_faces_http_${res.status}:${body.slice(0, 160)}`);
    }
    const json = await res.json();
    const details = Array.isArray(json?.FaceDetails) ? json.FaceDetails : [];
    const faces: DetectedFrameFace[] = [];
    for (const d of details) {
      if (!d?.BoundingBox) continue;
      const conf = Number(d.Confidence ?? 0);
      if (conf < 80) continue;
      const { Left, Top, Width, Height } = d.BoundingBox;
      const x1 = Math.max(0, Math.min(imgW, Math.round(Left * imgW)));
      const y1 = Math.max(0, Math.min(imgH, Math.round(Top * imgH)));
      const x2 = Math.max(0, Math.min(imgW, Math.round((Left + Width) * imgW)));
      const y2 = Math.max(0, Math.min(imgH, Math.round((Top + Height) * imgH)));
      if (x2 - x1 < 8 || y2 - y1 < 8) continue;
      faces.push({ bbox: [x1, y1, x2, y2], confidence: conf / 100 });
    }
    return faces;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return ok({ ok: false, error: "unauthorized" }, 401);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await authClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return ok({ ok: false, error: "unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    const sceneId = typeof body?.scene_id === "string" ? body.scene_id : "";
    const plateUrl = typeof body?.plate_url === "string" ? body.plate_url : "";
    const width = Math.round(Number(body?.width ?? 0));
    const height = Math.round(Number(body?.height ?? 0));
    const rawFrames = Array.isArray(body?.frames) ? body.frames : [];
    if (!sceneId || !plateUrl || !(width > 0) || !(height > 0) || rawFrames.length < 2) {
      return ok({ ok: false, error: "invalid_input" }, 400);
    }

    const frames = rawFrames
      .map((f: any) => ({ t: Number(f?.t), url: String(f?.url ?? "") }))
      .filter((f: { t: number; url: string }) => Number.isFinite(f.t) && f.url.startsWith("http"))
      .slice(0, MAX_FRAMES);
    if (frames.length < 2) return ok({ ok: false, error: "invalid_frames" }, 400);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: scene } = await admin
      .from("composer_scenes")
      .select("id, project_id")
      .eq("id", sceneId)
      .maybeSingle();
    if (!scene) return ok({ ok: false, error: "scene_not_found" }, 404);

    const { data: canAccess } = await admin.rpc("can_access_composer_project", {
      _project_id: scene.project_id,
      _user_id: userId,
    });
    if (canAccess !== true) return ok({ ok: false, error: "forbidden" }, 403);

    // Rekognition per sampled frame (parallel — 12 images max).
    const detections = await Promise.all(
      frames.map(async (f: { t: number; url: string }) => {
        try {
          const bytes = await fetchBytes(f.url);
          if (!bytes) return { t: f.t, faces: [] as DetectedFrameFace[] };
          return { t: f.t, faces: await detectFaces(bytes, width, height) };
        } catch (e) {
          console.warn(`[report-plate-motion-track] v327 detect failed t=${f.t}: ${(e as Error).message}`);
          return { t: f.t, faces: [] as DetectedFrameFace[] };
        }
      }),
    );

    const usable = detections.filter((d) => d.faces.length > 0);
    if (usable.length < 2) {
      console.log(
        `[report-plate-motion-track] v327_motion_track scene=${sceneId} usable_frames=${usable.length}/${frames.length} → static fallback`,
      );
      return ok({ ok: false, error: "insufficient_detections", usable_frames: usable.length });
    }

    const slots = buildSlotTracks({
      frames: usable,
      imgWidth: width,
      imgHeight: height,
    });
    if (slots.length === 0) return ok({ ok: false, error: "no_slots" });

    const track: MotionTrack = {
      version: MOTION_TRACK_VERSION,
      created_at: new Date().toISOString(),
      plate_url: plateUrl,
      dims: { width, height },
      samples: usable.length,
      slots,
      degraded_reason: usable.length < frames.length ? `dropped_${frames.length - usable.length}_frames` : null,
    };

    const { error: upErr } = await admin
      .from("composer_scenes")
      .update({ motion_track: track })
      .eq("id", sceneId);
    if (upErr) {
      console.warn(`[report-plate-motion-track] v327 persist failed: ${upErr.message}`);
      return ok({ ok: false, error: "persist_failed" });
    }

    console.log(
      `[report-plate-motion-track] v327_motion_track scene=${sceneId} samples=${usable.length} ` +
        slots.map((s) => `slot${s.slot}=${s.motion_class}(drift=${(s.max_drift_pct * 100).toFixed(1)}%,scale=${(s.max_scale_delta * 100).toFixed(1)}%)`).join(" "),
    );

    return ok({
      ok: true,
      samples: usable.length,
      slots: slots.map((s) => ({
        slot: s.slot,
        motion_class: s.motion_class,
        max_drift_pct: s.max_drift_pct,
        max_scale_delta: s.max_scale_delta,
        points: s.points.length,
      })),
    });
  } catch (e) {
    console.error(`[report-plate-motion-track] v327 error: ${(e as Error).message}`);
    return ok({ ok: false, error: "internal_error" });
  }
});
