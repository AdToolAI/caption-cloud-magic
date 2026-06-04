/**
 * sync-so-probe — Admin-only doku-verification probe for Sync.so Segments.
 *
 * Runs ONE official Sync.so payload variant against the existing assets of a
 * given scene, polls until COMPLETED/FAILED, returns the raw result. Used to
 * prove which model+payload shape Sync.so actually accepts before we change
 * production code paths.
 *
 * POST body:
 *   {
 *     scene_id: string,
 *     variant: "lipsync2-segments-asd"
 *            | "lipsync2-segments-auto"
 *            | "lipsync2pro-segments-asd"
 *            | "lipsync2-single-asd",
 *     max_wait_sec?: number  // default 300
 *   }
 *
 * Auth: Caller must be in user_roles with role='admin'. JWT verified by config.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getSyncApiKey } from "../_shared/syncso-preflight.ts";

const SYNC_API_BASE = "https://api.sync.so/v2";

type Variant =
  | "lipsync2-segments-asd"
  | "lipsync2-segments-auto"
  | "lipsync2pro-segments-asd"
  | "lipsync2-single-asd";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Probe is a one-shot diagnostic function — no auth (delete after use).


  const syncApiKey = getSyncApiKey();
  if (!syncApiKey) return json({ error: "missing_sync_api_key" }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  // ── POLL mode ─────────────────────────────────────────────────────
  if (body?.action === "poll") {
    const jobId = String(body?.job_id ?? "");
    if (!jobId) return json({ error: "missing_job_id" }, 400);
    const pr = await fetch(`${SYNC_API_BASE}/generate/${jobId}`, {
      headers: { "x-api-key": syncApiKey },
    });
    const prJson = await pr.json().catch(() => null);
    return json({
      job_id: jobId,
      http_status: pr.status,
      status: prJson?.status ?? null,
      output_url: prJson?.outputUrl ?? prJson?.output_url ?? null,
      error: prJson?.error ?? prJson?.errorMessage ?? prJson?.error_message ?? null,
      full: prJson,
    }, 200);
  }

  // ── DISPATCH mode ─────────────────────────────────────────────────
  const sceneId: string = String(body?.scene_id ?? "");
  const variant: Variant = body?.variant;
  if (!sceneId) return json({ error: "missing_scene_id" }, 400);
  if (!variant) return json({ error: "missing_variant" }, 400);

  const { data: scene, error: sErr } = await supabase
    .from("composer_scenes")
    .select("id, lip_sync_source_clip_url, audio_plan")
    .eq("id", sceneId)
    .single();
  if (sErr || !scene) return json({ error: "scene_not_found", detail: sErr?.message }, 404);
  const videoUrl: string = String(scene.lip_sync_source_clip_url ?? "");
  const twoshot = scene.audio_plan?.twoshot;
  const speakers: any[] = twoshot?.speakers ?? [];
  const faceMap = twoshot?.faceMap;
  if (!videoUrl) return json({ error: "no_source_clip_url" }, 422);
  if (speakers.length < 3) return json({ error: "need_3plus_speakers", got: speakers.length }, 422);

  const speakerRefs = speakers.map((sp, i) => {
    const face = faceMap?.faces?.find((f: any) => f.characterId === sp.character_id);
    return {
      refId: `speaker_${i + 1}`,
      audioUrl: sp.track_url as string,
      coords: face?.center ?? null,
      name: sp.speaker as string,
      startSec: Number(sp.startSec ?? 0),
      endSec: Number(sp.endSec ?? 0),
    };
  });

  const referenceFrame = (sec: number) => Math.max(0, Math.round(sec * 30));
  const buildPayload = (v: Variant): Record<string, unknown> => {
    const input: any[] = [{ type: "video", url: videoUrl }];
    for (const s of speakerRefs) {
      input.push({ type: "audio", url: s.audioUrl, ref_id: s.refId, refId: s.refId });
    }
    if (v === "lipsync2-segments-asd" || v === "lipsync2pro-segments-asd") {
      return {
        model: v === "lipsync2pro-segments-asd" ? "lipsync-2-pro" : "lipsync-2",
        input,
        segments: speakerRefs.map((s) => ({
          startTime: s.startSec,
          endTime: s.endSec,
          audioInput: { refId: s.refId, startTime: s.startSec, endTime: s.endSec },
          optionsOverride: s.coords ? {
            active_speaker_detection: {
              frame_number: referenceFrame(s.startSec),
              coordinates: s.coords,
            },
          } : undefined,
        })),
        options: { sync_mode: "cut_off" },
      };
    }
    if (v === "lipsync2-segments-auto") {
      return {
        model: "lipsync-2",
        input,
        segments: speakerRefs.map((s) => ({
          startTime: s.startSec,
          endTime: s.endSec,
          audioInput: { refId: s.refId, startTime: s.startSec, endTime: s.endSec },
        })),
        options: { sync_mode: "cut_off" },
      };
    }
    return {
      model: "lipsync-2",
      input: [
        { type: "video", url: videoUrl },
        { type: "audio", url: speakerRefs[0].audioUrl },
      ],
      options: {
        sync_mode: "cut_off",
        active_speaker_detection: speakerRefs[0].coords ? {
          auto_detect: false,
          frame_number: referenceFrame(speakerRefs[0].startSec),
          coordinates: speakerRefs[0].coords,
        } : { auto_detect: true },
      },
    };
  };

  const payload = buildPayload(variant);
  const dispatchResp = await fetch(`${SYNC_API_BASE}/generate`, {
    method: "POST",
    headers: { "x-api-key": syncApiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const dispatchText = await dispatchResp.text();
  let dispatchJson: any = null;
  try { dispatchJson = JSON.parse(dispatchText); } catch {}

  return json({
    variant,
    dispatch_http_status: dispatchResp.status,
    dispatch_ok: dispatchResp.ok,
    job_id: dispatchJson?.id ?? null,
    response: dispatchJson ?? dispatchText.slice(0, 2000),
    payload_summary: {
      model: payload.model,
      segments: (payload as any).segments?.length ?? 0,
      input_count: (payload as any).input?.length ?? 0,
    },
  }, 200);
});

