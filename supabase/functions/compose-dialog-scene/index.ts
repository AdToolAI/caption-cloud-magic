/**
 * compose-dialog-scene — Per-turn sequential Sync.so chain initiator.
 *
 * Design (May 2026 rewrite):
 *  - Treats `audio_plan.twoshot.speakers[*].voicedRange.turns[]` as a flat,
 *    time-ordered list of speaker turns.
 *  - Each turn = ONE Sync.so lipsync-2-pro pass on the existing master plate
 *    (the two-shot Hailuo clip). Tight `segments_secs=[[t.startSec, t.endSec]]`
 *    + identity-matched face coordinates from cached `audio_plan.twoshot.faceMap`.
 *  - Passes run SEQUENTIALLY in `poll-dialog-shots`: the output of turn N
 *    becomes the video input of turn N+1. The final turn's output is the
 *    new `clip_url`. NO ffmpeg, NO Remotion stitching needed.
 *
 * Why this beats the legacy compose-twoshot-lipsync two-pass-per-speaker:
 *  - Per-turn windows are the tightest possible scope → Sync.so face VAD
 *    has minimum competing audio and animates only one mouth per pass.
 *  - Sequential chaining preserves earlier turns' animation because
 *    `sync_mode='cut_off'` leaves frames outside `segments_secs` untouched.
 *  - Identity-matched coordinates eliminate the "wrong character speaks"
 *    swap that auto_detect produces on multi-window passes.
 *
 * Returns 202 after queueing turn 0. `poll-dialog-shots` (pg_cron, 1min)
 * advances the chain.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

// Sync.so lipsync-2-pro pricing: 9 credits per second per pass.
// Min 9 credits per turn (covers <1s utterances). One pass per turn.
const LIPSYNC_CREDITS_PER_SEC = 9;
const LIPSYNC_MIN_CREDITS = 9;
const MIN_TURN_DUR_SEC = 0.4;

const computeTurnCost = (durSec: number) =>
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

interface DialogTurnShot {
  idx: number;
  speaker_idx: number;
  speaker_name: string;
  character_id: string | null;
  startSec: number;
  endSec: number;
  durSec: number;
  /** Sync.so coords [x, y] in master-plate pixel space. Set by initiator
   *  from cached faceMap; never auto_detect for multi-speaker scenes. */
  target_coords: [number, number] | null;
  /** Adaptive temperature: 1.0 for very short turns (<2s), else 0.85.
   *  Short turns need maximum articulation force; long turns prefer stability. */
  temperature: number;
  status:
    | "pending"
    | "lipsyncing"
    | "ready"
    | "failed";
  sync_job_id?: string;
  /** Output URL of THIS turn's Sync.so pass. Becomes video input of next turn. */
  output_url?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

interface DialogShotsState {
  version: 2; // bumped from v1 (Hailuo-per-turn) to v2 (sequential master chain)
  status: "queued" | "lipsyncing" | "done" | "failed";
  /** Per-turn passes, time-ordered. */
  shots: DialogTurnShot[];
  /** The two-shot master plate this chain starts from. Stable reference. */
  source_clip_url: string;
  /** Master audio WAV (built by compose-twoshot-audio). Sliced per-turn. */
  master_audio_url: string;
  total_sec: number;
  cost_credits: number;
  refunded: boolean;
  started_at: string;
  /** Video dims (px) Sync.so should treat coords against. */
  video_width: number;
  video_height: number;
  /** Final output URL of the last successful turn. = clip_url when status=done. */
  final_url?: string | null;
  finished_at?: string;
  error?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

    const plan = ((scene as any).audio_plan ?? {}) as Record<string, any>;
    const twoshot = (plan.twoshot ?? {}) as Record<string, any>;
    const speakers = Array.isArray(twoshot.speakers)
      ? (twoshot.speakers as TwoshotSpeaker[])
      : [];
    const masterAudioUrl = String(twoshot.url ?? "");
    const totalSec = Number(twoshot.totalSec ?? 0);
    const faceMap = (twoshot.faceMap ?? null) as {
      faces?: Array<{
        center?: [number, number];
        characterId?: string | null;
        side?: "left" | "right";
      }>;
      width?: number;
      height?: number;
    } | null;

    if (!masterAudioUrl || speakers.length === 0 || totalSec <= 0) {
      return json(
        {
          error: "missing_audio_plan",
          message:
            "Cinematic-Sync requires compose-twoshot-audio output (master WAV + speakers[].voicedRange.turns[]).",
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

    // Idempotency: if a fresh, non-failed dialog_shots state exists, just
    // nudge the poller.
    const existing = (scene as any).dialog_shots as DialogShotsState | null;
    if (
      existing &&
      existing.status &&
      !["failed", "done"].includes(String(existing.status))
    ) {
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
      return json({ ok: true, status: "resumed", scene_id: sceneId }, 202);
    }

    // ── Build per-turn shot list ────────────────────────────────────────
    const coordsByCharId = new Map<string, [number, number]>();
    if (faceMap?.faces?.length) {
      for (const f of faceMap.faces) {
        const cid = String(f.characterId ?? "").toLowerCase();
        if (cid && Array.isArray(f.center) && f.center.length === 2) {
          coordsByCharId.set(cid, [Number(f.center[0]), Number(f.center[1])]);
        }
      }
    }
    const videoW = Number(faceMap?.width) || 1280;
    const videoH = Number(faceMap?.height) || 720;

    const rawShots: DialogTurnShot[] = [];
    let idx = 0;
    speakers.forEach((sp, sIdx) => {
      const turns = Array.isArray(sp.voicedRange?.turns)
        ? sp.voicedRange!.turns!
        : sp.voicedRange?.startSec != null && sp.voicedRange?.endSec != null
          ? [{ startSec: sp.voicedRange.startSec, endSec: sp.voicedRange.endSec }]
          : [];
      const charId = String(sp.character_id ?? "").toLowerCase() || null;
      const coords = charId ? coordsByCharId.get(charId) ?? null : null;
      for (const t of turns) {
        const dur = Math.max(MIN_TURN_DUR_SEC, t.endSec - t.startSec);
        rawShots.push({
          idx: idx++,
          speaker_idx: sIdx,
          speaker_name: String(sp.speaker ?? `Speaker ${sIdx + 1}`),
          character_id: charId,
          startSec: t.startSec,
          endSec: t.endSec,
          durSec: dur,
          target_coords: coords,
          // Adaptive temperature: short turns need stronger articulation
          temperature: dur < 2.0 ? 1.0 : 0.85,
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

    // Identity coverage check: every multi-speaker shot MUST have a coord.
    // Without coords Sync.so would auto-detect → swap risk.
    const distinctSpeakerIdxs = new Set(rawShots.map((s) => s.speaker_idx));
    if (distinctSpeakerIdxs.size >= 2) {
      const missing = rawShots.filter((s) => !s.target_coords);
      if (missing.length > 0) {
        const missingChars = Array.from(
          new Set(missing.map((m) => m.character_id ?? m.speaker_name)),
        );
        await supabase
          .from("composer_scenes")
          .update({
            lip_sync_status: "failed",
            twoshot_stage: "failed",
            clip_error:
              `dialog_missing_face_coords: ${missingChars.join(", ")} — bitte „🎥 Clip + Lip-Sync neu rendern" für eine frische Identity-Detection.`,
          })
          .eq("id", sceneId);
        return json(
          { error: "missing_face_coords", missing: missingChars },
          422,
        );
      }
    }

    // ── Wallet reserve (one cost per turn) ──────────────────────────────
    const totalCost = rawShots.reduce((sum, s) => sum + computeTurnCost(s.durSec), 0);
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
          message: `Dialog-Pipeline benötigt ${totalCost} Credits (${rawShots.length} Turns × ~${LIPSYNC_CREDITS_PER_SEC} cr/s).`,
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

    const nowIso = new Date().toISOString();
    const state: DialogShotsState = {
      version: 2,
      status: "queued",
      shots: rawShots,
      source_clip_url: sourceClipUrl,
      master_audio_url: masterAudioUrl,
      total_sec: totalSec,
      cost_credits: totalCost,
      refunded: false,
      started_at: nowIso,
      video_width: videoW,
      video_height: videoH,
      final_url: null,
    };

    // Strip legacy two-shot state so we don't mix with old syncJobs/heartbeat
    const cleanPlan = { ...plan };
    if (cleanPlan.twoshot && typeof cleanPlan.twoshot === "object") {
      const ts = { ...(cleanPlan.twoshot as Record<string, any>) };
      delete ts.syncJobs;
      delete ts.heartbeat;
      delete ts.diagnostics;
      // Keep faceMap! We need it for chained passes.
      cleanPlan.twoshot = ts;
    }

    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: state,
        audio_plan: cleanPlan,
        replicate_prediction_id: null,
        lip_sync_status: "running",
        twoshot_stage: "dialog_chain",
        lip_sync_source_clip_url: sourceClipUrl,
        clip_error: null,
        updated_at: nowIso,
      })
      .eq("id", sceneId);

    // Kick the poller immediately so turn 0 dispatches on this request,
    // not 1min later from pg_cron.
    const kick = async () => {
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
        console.warn("[compose-dialog-scene] poller kick failed", e);
      }
    };
    // @ts-expect-error EdgeRuntime global
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-expect-error
      EdgeRuntime.waitUntil(kick());
    } else {
      kick();
    }

    return json(
      {
        ok: true,
        status: "queued",
        scene_id: sceneId,
        turns: rawShots.length,
        cost_credits: totalCost,
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
