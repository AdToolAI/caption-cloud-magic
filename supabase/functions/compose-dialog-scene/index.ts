/**
 * compose-dialog-scene — NEW dialog-based shot pipeline for cinematic-sync
 * scenes with N (1, 2, 3+) speakers.
 *
 * Replaces the legacy `compose-twoshot-lipsync` two-pass Sync.so flow.
 *
 * What it does (initiator side — fast, returns 202):
 *  1. Reads scene + audio_plan.twoshot (built by compose-twoshot-audio).
 *  2. Flattens speaker.voicedRange.turns[] into a flat, time-ordered shot
 *     list — one shot per speaker turn.
 *  3. Reserves credits for ALL shots up-front (idempotent refund downstream).
 *  4. Persists `dialog_shots` JSONB on the scene with status='generating'.
 *  5. Fires Hailuo i2v on Replicate in parallel — one prediction per shot,
 *     with that speaker's portrait as the first frame.
 *  6. Returns 202. The pg_cron-driven `poll-dialog-shots` continues from
 *     there (Hailuo → Sync.so lipsync per shot → ffmpeg concat).
 *
 * Idempotent: safe to re-invoke. If `dialog_shots` already exists in a
 * non-failed state we re-trigger the poller instead of double-spending.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import Replicate from "npm:replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

// Per-shot price = 9 credits/sec (lipsync-2-pro 1 pass) + flat 25 credits
// (Hailuo 6s standard ≈ €0.25). Margin ~25%.
const HAILUO_FLAT_CREDITS = 25;
const LIPSYNC_CREDITS_PER_SEC = 9;
const LIPSYNC_MIN_CREDITS = 9;
const computeShotCost = (durSec: number) =>
  HAILUO_FLAT_CREDITS +
  Math.max(LIPSYNC_MIN_CREDITS, Math.ceil(Math.max(0, durSec)) * LIPSYNC_CREDITS_PER_SEC);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Turn {
  startSec: number;
  endSec: number;
}
interface TwoshotSpeaker {
  speaker?: string;
  character_id?: string | null;
  voicedRange?: { turns?: Turn[]; startSec?: number; endSec?: number };
}
interface DialogShot {
  idx: number;
  speaker_idx: number;
  speaker_name: string;
  character_id: string | null;
  portrait_url: string | null;
  startSec: number;
  endSec: number;
  durSec: number;
  hailuo_target_sec: number;
  status:
    | "pending"
    | "generating"
    | "generated"
    | "lipsyncing"
    | "ready"
    | "failed";
  hailuo_prediction_id?: string;
  plate_url?: string;
  audio_slice_url?: string;
  sync_job_id?: string;
  lipsync_url?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

function chooseHailuoDuration(turnDur: number): 6 | 10 {
  // Hailuo only supports 6 or 10. Pad a bit so lipsync VAD has lead-in.
  return turnDur + 0.6 <= 6 ? 6 : 10;
}

function pickPortraitForSpeaker(
  speaker: TwoshotSpeaker,
  charShots: Array<{
    characterId?: string;
    character_id?: string;
    portraitUrl?: string;
    portrait_url?: string;
    referenceImageUrl?: string;
    reference_image_url?: string;
    outfitLookId?: string;
    outfit_look_id?: string;
  }>,
  outfitUrlById: Map<string, string>,
): string | null {
  const charId = speaker.character_id ?? null;
  const match = charShots.find(
    (c) => (c.characterId ?? c.character_id) === charId,
  );
  if (!match) return null;
  const lookId = match.outfitLookId ?? match.outfit_look_id ?? null;
  if (lookId && outfitUrlById.has(lookId)) return outfitUrlById.get(lookId)!;
  return (
    match.portraitUrl ??
    match.portrait_url ??
    match.referenceImageUrl ??
    match.reference_image_url ??
    null
  );
}

function buildShotPrompt(
  scenePrompt: string,
  speakerName: string,
  isLast: boolean,
): string {
  const baseClean = String(scenePrompt ?? "")
    .replace(/\[Dialog\][\s\S]*?\[\/Dialog\]/gi, "")
    .replace(/^\s*[A-Za-zÀ-ÿ][\w\s.'-]{1,40}\s*[:：].*$/gm, "")
    .trim();
  const shotDescriptor = isLast
    ? `Medium close-up of ${speakerName}, eye-line slightly off-camera as if listening then responding`
    : `Medium close-up of ${speakerName}, frontal, eye-line slightly off-camera toward the other speaker`;
  return [
    baseClean,
    shotDescriptor,
    "Mouth clearly visible, no hands near face, no microphone, no foreground occlusion",
    "Subtle natural head movement, neutral resting facial expression, ready to speak",
    "Cinematic depth of field, soft key light, color-graded for film",
  ]
    .filter(Boolean)
    .join(". ");
}

const NEG_PROMPT =
  "blurry, low quality, distorted face, deformed mouth, missing teeth, occluded mouth, hand over mouth, microphone in frame, watermark, text overlay, subtitles, multiple identical people, body horror";

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const replicateKey = Deno.env.get("REPLICATE_API_KEY") ?? "";
  if (!replicateKey) return json({ error: "REPLICATE_API_KEY missing" }, 500);

  const supabase = createClient(supabaseUrl, serviceKey);
  const replicate = new Replicate({ auth: replicateKey });

  try {
    const body = await req.json().catch(() => ({}));
    const sceneId = String(body?.scene_id ?? "");
    if (!sceneId) return json({ error: "scene_id required" }, 400);

    const { data: scene, error: sErr } = await supabase
      .from("composer_scenes")
      .select(
        "id, project_id, ai_prompt, character_shots, audio_plan, duration_seconds, dialog_shots, lip_sync_status, lip_sync_applied_at, engine_override",
      )
      .eq("id", sceneId)
      .single();
    if (sErr || !scene) return json({ error: "scene not found" }, 404);

    const { data: project } = await supabase
      .from("composer_projects")
      .select("id, user_id")
      .eq("id", scene.project_id)
      .single();
    if (!project) return json({ error: "project not found" }, 404);
    const userId = project.user_id;

    if (scene.lip_sync_applied_at)
      return json({ ok: true, status: "already_done", scene_id: sceneId });

    const plan = (scene.audio_plan ?? {}) as Record<string, any>;
    const twoshot = (plan.twoshot ?? {}) as Record<string, any>;
    const speakers = Array.isArray(twoshot.speakers)
      ? (twoshot.speakers as TwoshotSpeaker[])
      : [];
    const masterAudioUrl = String(twoshot.url ?? "");
    const totalSec = Number(twoshot.totalSec ?? scene.duration_seconds ?? 0);

    if (!masterAudioUrl || speakers.length === 0) {
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: "dialog_pipeline_missing_audio_plan",
        })
        .eq("id", sceneId);
      return json(
        {
          error: "missing_audio_plan",
          message:
            "Cinematic-Sync needs compose-twoshot-audio output (master WAV + speakers[].voicedRange.turns[]).",
        },
        422,
      );
    }

    // ── Idempotency: if dialog_shots already in flight, just kick the poller
    const existing = (scene.dialog_shots ?? null) as Record<string, any> | null;
    if (
      existing &&
      existing.status &&
      !["failed", "done"].includes(String(existing.status))
    ) {
      // Fire poller via waitUntil and return 202.
      const resume = async () => {
        try {
          await fetch(`${supabaseUrl}/functions/v1/poll-dialog-shots`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ scene_id: sceneId }),
          });
        } catch (e) {
          console.warn("[compose-dialog-scene] resume failed", e);
        }
      };
      // @ts-expect-error EdgeRuntime is global in Supabase functions
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-expect-error
        EdgeRuntime.waitUntil(resume());
      }
      return json(
        { ok: true, status: "resumed", scene_id: sceneId },
        202,
      );
    }

    // ── Build shot list from per-turn windows ─────────────────────────
    const charShots = Array.isArray((scene as any).character_shots)
      ? ((scene as any).character_shots as any[])
      : [];

    // Resolve outfit-look URLs
    const lookIds = Array.from(
      new Set(
        charShots
          .map((c: any) => c?.outfitLookId ?? c?.outfit_look_id ?? null)
          .filter((x: any): x is string => !!x),
      ),
    );
    const outfitUrlById = new Map<string, string>();
    if (lookIds.length > 0) {
      const { data: looks } = await supabase
        .from("avatar_outfit_looks")
        .select("id, cover_url, front_url")
        .in("id", lookIds);
      for (const l of looks ?? []) {
        const url = (l as any).cover_url || (l as any).front_url;
        if (url) outfitUrlById.set((l as any).id, url);
      }
    }

    const rawShots: DialogShot[] = [];
    let idx = 0;
    speakers.forEach((sp, sIdx) => {
      const turns = Array.isArray(sp.voicedRange?.turns)
        ? sp.voicedRange!.turns!
        : sp.voicedRange?.startSec != null && sp.voicedRange?.endSec != null
          ? [{ startSec: sp.voicedRange.startSec, endSec: sp.voicedRange.endSec }]
          : [];
      const portrait = pickPortraitForSpeaker(sp, charShots, outfitUrlById);
      for (const t of turns) {
        const dur = Math.max(0.4, t.endSec - t.startSec);
        rawShots.push({
          idx: idx++,
          speaker_idx: sIdx,
          speaker_name: String(sp.speaker ?? `Speaker ${sIdx + 1}`),
          character_id: sp.character_id ?? null,
          portrait_url: portrait,
          startSec: t.startSec,
          endSec: t.endSec,
          durSec: dur,
          hailuo_target_sec: chooseHailuoDuration(dur),
          status: "pending",
        });
      }
    });

    if (rawShots.length === 0) {
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: "dialog_pipeline_no_turns",
        })
        .eq("id", sceneId);
      return json(
        { error: "no_turns", message: "No speaker turns found in audio_plan.twoshot." },
        422,
      );
    }

    // Time-order shots
    rawShots.sort((a, b) => a.startSec - b.startSec);
    rawShots.forEach((s, i) => (s.idx = i));

    // ── Wallet reserve ──────────────────────────────────────────────────
    const totalCost = rawShots.reduce((sum, s) => sum + computeShotCost(s.durSec), 0);
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .single();
    if (!wallet || wallet.balance < totalCost) {
      return json(
        {
          error: "INSUFFICIENT_CREDITS",
          required: totalCost,
          have: wallet?.balance ?? 0,
          message: `Dialog-Pipeline benötigt ${totalCost} Credits (${rawShots.length} Shots).`,
        },
        402,
      );
    }
    await supabase
      .from("wallets")
      .update({
        balance: wallet.balance - totalCost,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    // ── Persist initial state ──────────────────────────────────────────
    const nowIso = new Date().toISOString();
    const dialogShotsState = {
      version: 1,
      status: "generating",
      shots: rawShots,
      master_audio_url: masterAudioUrl,
      total_sec: totalSec,
      cost_credits: totalCost,
      refunded: false,
      started_at: nowIso,
      stitched_url: null,
    };

    // Strip legacy two-shot lipsync state so the new dialog pipeline
    // doesn't mix with stale syncJobs / heartbeat / faceMap from the
    // old `compose-twoshot-lipsync` flow.
    const cleanPlan = { ...plan };
    if (cleanPlan.twoshot && typeof cleanPlan.twoshot === "object") {
      const ts = { ...(cleanPlan.twoshot as Record<string, any>) };
      delete ts.syncJobs;
      delete ts.heartbeat;
      delete ts.faceMap;
      delete ts.anchor_face_audit;
      delete ts.diagnostics;
      cleanPlan.twoshot = ts;
    }

    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: dialogShotsState,
        audio_plan: cleanPlan,
        replicate_prediction_id: null,
        lip_sync_status: "running",
        twoshot_stage: "dialog_shots",
        clip_error: null,
        updated_at: nowIso,
      })
      .eq("id", sceneId);

    // ── Fire Hailuo predictions per shot in PARALLEL ───────────────────
    const scenePrompt = String((scene as any).ai_prompt ?? "");
    const webhookUrl = `${supabaseUrl}/functions/v1/poll-dialog-shots?scene_id=${sceneId}`;

    const launches = await Promise.allSettled(
      rawShots.map(async (shot) => {
        const prompt = buildShotPrompt(
          scenePrompt,
          shot.speaker_name,
          shot.idx === rawShots.length - 1,
        );
        const input: Record<string, unknown> = {
          prompt,
          negative_prompt: NEG_PROMPT,
          duration: shot.hailuo_target_sec,
          resolution: "768p",
        };
        if (shot.portrait_url) input.first_frame_image = shot.portrait_url;

        const pred = await replicate.predictions.create({
          model: "minimax/hailuo-2.3",
          input,
          webhook: webhookUrl,
          webhook_events_filter: ["completed"],
        });
        return { idx: shot.idx, predictionId: pred.id };
      }),
    );

    // Patch dialog_shots with prediction IDs / failures
    const patched = dialogShotsState.shots.map((s, i) => {
      const r = launches[i];
      if (r.status === "fulfilled") {
        return {
          ...s,
          status: "generating" as const,
          hailuo_prediction_id: r.value.predictionId,
          started_at: nowIso,
        };
      }
      return {
        ...s,
        status: "failed" as const,
        error: `hailuo_dispatch_failed: ${(r.reason as Error)?.message ?? "unknown"}`,
      };
    });
    const anyDispatched = patched.some((s) => s.status === "generating");
    if (!anyDispatched) {
      // Full failure → refund + mark failed
      await supabase
        .from("wallets")
        .update({
          balance: wallet.balance,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: {
            ...dialogShotsState,
            shots: patched,
            status: "failed",
            refunded: true,
            error: "all_hailuo_dispatches_failed",
          },
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: "dialog_all_hailuo_dispatches_failed",
        })
        .eq("id", sceneId);
      return json({ error: "all_dispatches_failed" }, 502);
    }

    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: { ...dialogShotsState, shots: patched },
        updated_at: new Date().toISOString(),
      })
      .eq("id", sceneId);

    return json(
      {
        ok: true,
        status: "generating",
        scene_id: sceneId,
        shots: patched.length,
        cost: totalCost,
      },
      202,
    );
  } catch (e) {
    console.error("[compose-dialog-scene] error", e);
    return json(
      { error: e instanceof Error ? e.message : "unknown" },
      500,
    );
  }
});
