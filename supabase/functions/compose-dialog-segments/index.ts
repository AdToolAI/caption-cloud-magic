/**
 * compose-dialog-segments — Sync.so Segments API (1-call dialog pipeline).
 *
 * Replaces the v4 per-turn chain (`compose-dialog-scene` + `poll-dialog-shots`)
 * with a SINGLE Sync.so generate call using the official `segments[]` API
 * (https://sync.so/docs/developer-guides/segments). Each turn maps to one
 * segment with `audioInput.refId` pointing to that speaker's isolated track.
 *
 * Why this matters:
 *  - 1 Sync.so render instead of N (no per-turn dispatch, no ffmpeg stitch).
 *  - 1 Webhook completion instead of N webhooks + stitch trigger.
 *  - End-to-end render goes from ~10–15 min to ~3–5 min for a 3-turn scene.
 *  - Cost: ~$0.083/s × scene_duration once, vs. N × per-turn cost.
 *
 * State model (dialog_shots version=5):
 *  {
 *    version: 5,
 *    engine: "sync-segments",
 *    status: "queued" | "rendering" | "done" | "failed",
 *    sync_job_id: string,
 *    source_clip_url: string,         // master plate (no chain)
 *    segments: [...],                 // for diagnostics
 *    cost_credits: number,
 *    refunded: boolean,
 *    final_url?: string,
 *    error?: string,
 *  }
 *
 * Idempotent. Auto-refund on failure (matches v4 contract). Webhook does
 * the completion patch; this function only does the dispatch.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYNC_API_BASE = "https://api.sync.so/v2";
const LIPSYNC_MODEL = "lipsync-2-pro";

// Pricing: Sync.so lipsync-2-pro = 9 credits/s.  ONE pass over the full clip
// (regardless of speaker count), so cost = ceil(totalSec) * 9 (min 9).
const LIPSYNC_CREDITS_PER_SEC = 9;
const LIPSYNC_MIN_CREDITS = 9;
const MIN_TURN_DUR_SEC = 0.4;

const computeCost = (durSec: number) =>
  Math.max(LIPSYNC_MIN_CREDITS, Math.ceil(Math.max(0, durSec)) * LIPSYNC_CREDITS_PER_SEC);

interface Turn { startSec: number; endSec: number }
interface TwoshotSpeaker {
  speaker?: string;
  character_id?: string | null;
  track_url?: string;
  voicedRange?: { turns?: Turn[]; startSec?: number; endSec?: number };
}

interface SegmentsState {
  version: 5;
  engine: "sync-segments";
  status: "queued" | "rendering" | "done" | "failed";
  sync_job_id?: string;
  source_clip_url: string;
  total_sec: number;
  segments: Array<{
    startTime: number;
    endTime: number;
    speakerIdx: number;
    speakerName: string;
    refId: string;
  }>;
  cost_credits: number;
  refunded: boolean;
  started_at: string;
  finished_at?: string;
  final_url?: string | null;
  error?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const syncApiKey = Deno.env.get("SYNC_SO_API_KEY") ?? Deno.env.get("SYNCSO_API_KEY") ?? "";
    if (!syncApiKey) return json({ error: "missing_sync_api_key" }, 500);

    const supabase = createClient(supabaseUrl, serviceKey);

    const { scene_id: sceneId } = await req.json().catch(() => ({}));
    if (!sceneId || typeof sceneId !== "string") {
      return json({ error: "scene_id_required" }, 400);
    }

    const { data: scene, error: sceneErr } = await supabase
      .from("composer_scenes")
      .select(
        "id, project_id, audio_plan, dialog_shots, clip_url, lip_sync_source_clip_url, lip_sync_applied_at",
      )
      .eq("id", sceneId)
      .single();
    if (sceneErr || !scene) {
      return json({ error: "scene_not_found", details: sceneErr?.message }, 404);
    }

    const { data: project } = await supabase
      .from("composer_projects")
      .select("user_id")
      .eq("id", scene.project_id)
      .single();
    const userId = project?.user_id;
    if (!userId) return json({ error: "missing_user" }, 403);

    // ── Validate audio plan ───────────────────────────────────────────────
    const plan = ((scene as any).audio_plan ?? {}) as Record<string, any>;
    const twoshot = (plan.twoshot ?? {}) as Record<string, any>;
    const speakers = (Array.isArray(twoshot.speakers) ? twoshot.speakers : []) as TwoshotSpeaker[];
    const masterAudioUrl = String(twoshot.url ?? "");
    const totalSec = Number(twoshot.totalSec ?? 0);

    if (!masterAudioUrl || speakers.length === 0 || totalSec <= 0) {
      return json(
        {
          error: "missing_audio_plan",
          message: "Sync-Segments requires compose-twoshot-audio output (master WAV + speakers[].voicedRange.turns[]).",
        },
        422,
      );
    }

    const sourceClipUrl =
      (scene as any).lip_sync_source_clip_url || (scene as any).clip_url || null;
    if (!sourceClipUrl) {
      return json(
        { error: "missing_source_clip", message: "Scene has no master plate to lipsync onto." },
        422,
      );
    }

    // Idempotency: an active render already exists → nudge and return.
    const existing = (scene as any).dialog_shots as SegmentsState | null;
    if (
      existing &&
      existing.version === 5 &&
      existing.engine === "sync-segments" &&
      ["queued", "rendering"].includes(String(existing.status))
    ) {
      return json({ ok: true, status: "already_running", scene_id: sceneId }, 202);
    }

    // ── Build segments from per-speaker turns ────────────────────────────
    interface RawSegment {
      startTime: number;
      endTime: number;
      speakerIdx: number;
      speakerName: string;
      audioUrl: string;
    }
    const raw: RawSegment[] = [];
    speakers.forEach((sp, sIdx) => {
      const turns: Turn[] = Array.isArray(sp.voicedRange?.turns)
        ? (sp.voicedRange!.turns as Turn[])
        : sp.voicedRange?.startSec != null && sp.voicedRange?.endSec != null
          ? [{ startSec: sp.voicedRange.startSec, endSec: sp.voicedRange.endSec }]
          : [];
      const speakerAudio = String(sp.track_url ?? "").trim() || masterAudioUrl;
      const speakerName = String(sp.speaker ?? `Speaker ${sIdx + 1}`);
      for (const t of turns) {
        const start = Math.max(0, Number(t.startSec));
        const end = Math.max(start + MIN_TURN_DUR_SEC, Number(t.endSec));
        raw.push({
          startTime: start,
          endTime: Math.min(end, totalSec),
          speakerIdx: sIdx,
          speakerName,
          audioUrl: speakerAudio,
        });
      }
    });

    if (raw.length === 0) {
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: "dialog_pipeline_no_turns",
        })
        .eq("id", sceneId);
      return json({ error: "no_turns" }, 422);
    }

    raw.sort((a, b) => a.startTime - b.startTime);

    // De-dup audio sources → refIds
    const audioRefMap = new Map<string, string>();
    raw.forEach((r) => {
      if (!audioRefMap.has(r.audioUrl)) {
        audioRefMap.set(r.audioUrl, `audio_${audioRefMap.size + 1}`);
      }
    });

    const segments = raw.map((r) => ({
      startTime: Number(r.startTime.toFixed(3)),
      endTime: Number(r.endTime.toFixed(3)),
      speakerIdx: r.speakerIdx,
      speakerName: r.speakerName,
      refId: audioRefMap.get(r.audioUrl)!,
    }));

    // ── Wallet reserve ───────────────────────────────────────────────────
    const totalCost = computeCost(totalSec);
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .single();
    if (!wallet || Number(wallet.balance) < totalCost) {
      return json(
        {
          error: "INSUFFICIENT_CREDITS",
          required: totalCost,
          have: wallet?.balance ?? 0,
          message: `Sync-Segments benötigt ${totalCost} Credits.`,
        },
        402,
      );
    }
    await supabase
      .from("wallets")
      .update({
        balance: Number(wallet.balance) - totalCost,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    // ── Build Sync.so payload ────────────────────────────────────────────
    const webhookUrl = appendWebhookToken(
      `${supabaseUrl}/functions/v1/sync-so-webhook?scene_id=${sceneId}`,
    );

    const input: Array<Record<string, unknown>> = [
      { type: "video", url: sourceClipUrl },
      ...Array.from(audioRefMap.entries()).map(([url, refId]) => ({
        type: "audio",
        url,
        refId,
      })),
    ];

    const payload: Record<string, unknown> = {
      model: LIPSYNC_MODEL,
      input,
      segments: segments.map((s) => ({
        startTime: s.startTime,
        endTime: s.endTime,
        audioInput: {
          refId: s.refId,
          startTime: s.startTime,
          endTime: s.endTime,
        },
      })),
      webhookUrl,
      webhook_url: webhookUrl,
    };

    console.log(
      `[compose-dialog-segments] scene=${sceneId} dispatch segments=${segments.length} cost=${totalCost} payload=${JSON.stringify(payload).slice(0, 1200)}`,
    );

    const resp = await fetch(`${SYNC_API_BASE}/generate`, {
      method: "POST",
      headers: { "x-api-key": syncApiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => "");
      console.error(
        `[compose-dialog-segments] scene=${sceneId} dispatch FAILED status=${resp.status} body=${errTxt.slice(0, 800)}`,
      );
      // Auto-refund
      const { data: w2 } = await supabase
        .from("wallets").select("balance").eq("user_id", userId).single();
      await supabase
        .from("wallets")
        .update({
          balance: Number(w2?.balance ?? 0) + totalCost,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: `syncso_segments_dispatch_${resp.status}`,
        })
        .eq("id", sceneId);
      return json(
        {
          error: "syncso_dispatch_failed",
          status: resp.status,
          body: errTxt.slice(0, 400),
          refunded: totalCost,
        },
        502,
      );
    }

    const data = await resp.json();
    const jobId = String(data.id ?? "");
    if (!jobId) {
      console.error(`[compose-dialog-segments] scene=${sceneId} no job id in response`);
      return json({ error: "no_job_id" }, 502);
    }

    const nowIso = new Date().toISOString();
    const state: SegmentsState = {
      version: 5,
      engine: "sync-segments",
      status: "rendering",
      sync_job_id: jobId,
      source_clip_url: sourceClipUrl,
      total_sec: totalSec,
      segments,
      cost_credits: totalCost,
      refunded: false,
      started_at: nowIso,
      final_url: null,
    };

    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: state,
        lip_sync_status: "running",
        twoshot_stage: "syncso_segments",
        lip_sync_source_clip_url: sourceClipUrl,
        replicate_prediction_id: `sync:${jobId}`,
        clip_error: null,
        updated_at: nowIso,
      })
      .eq("id", sceneId);

    return json(
      {
        ok: true,
        status: "rendering",
        scene_id: sceneId,
        sync_job_id: jobId,
        segments: segments.length,
        cost_credits: totalCost,
      },
      202,
    );
  } catch (e) {
    console.error("[compose-dialog-segments] error", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
