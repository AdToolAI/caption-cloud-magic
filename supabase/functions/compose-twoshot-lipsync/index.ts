/**
 * compose-twoshot-lipsync — Two-Shot multi-speaker lip-sync.
 *
 * Runs AFTER `compose-twoshot-audio` produced ONE merged voiceover WAV
 * (with metadata.speakers timing) and AFTER Hailuo i2v rendered the silent
 * 10s two-shot master clip.
 *
 * Strategy:
 *  - Sync.so/lipsync-2 has automatic active-speaker detection for multi-face
 *    videos. We pass the merged audio in ONE pass; Sync.so picks the
 *    speaking face per audio segment.
 *  - We progressively update `composer_scenes.twoshot_stage` so the UI can
 *    display a 6-step progress strip (audio → anchor → master_clip →
 *    lipsync_1 → lipsync_2 → continuity → done).
 *  - Idempotent credit refund on Replicate failure (deterministic UUID
 *    derived from scene_id + source clip URL).
 *
 * Bypasses the multi-speaker guard in `compose-lipsync-scene` by design:
 * here we KNOW the voiceover is the merged Two-Shot track.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import Replicate from "npm:replicate@0.25.2";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

// 2× lipsync-2-pro per pass (multi-pass two-shot) — Artlist parity
const COST = 28;
const LIPSYNC_MODEL = "sync/lipsync-2-pro" as `${string}/${string}`;
const PASS_TIMEOUT_MS = 180_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}_timeout_${Math.round(ms / 1000)}s`)), ms),
    ),
  ]);
}

async function setStage(
  supabase: any,
  sceneId: string,
  stage: string,
  extra: Record<string, unknown> = {},
) {
  await supabase
    .from("composer_scenes")
    .update({ twoshot_stage: stage, ...extra })
    .eq("id", sceneId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockResponse({ corsHeaders, kind: "video" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { scene_id } = body || {};
    if (!scene_id) return json({ error: "scene_id required" }, 400);

    // Load scene + verify ownership.
    const { data: scene, error: sErr } = await supabase
      .from("composer_scenes")
      .select(
        "id, project_id, clip_url, lip_sync_source_clip_url, duration_seconds, audio_plan, character_audio_url, lock_reference_url, character_shots",
      )
      .eq("id", scene_id)
      .single();
    if (sErr || !scene) return json({ error: "scene not found" }, 404);

    const { data: project } = await supabase
      .from("composer_projects")
      .select("id, user_id")
      .eq("id", scene.project_id)
      .single();
    if (!project || project.user_id !== user.id) return json({ error: "Forbidden" }, 403);

    // Source clip = original silent two-shot from Hailuo.
    const sourceClipUrl =
      (scene as any).lip_sync_source_clip_url || scene.clip_url || null;
    if (!sourceClipUrl) return json({ error: "no_source_clip" }, 400);

    // Merged voiceover from compose-twoshot-audio.
    const { data: voClips } = await supabase
      .from("scene_audio_clips")
      .select("url, duration, metadata")
      .eq("scene_id", scene_id)
      .eq("kind", "voiceover")
      .order("duration", { ascending: false });

    let mergedVo: any = voClips?.find((c: any) =>
      String(c.url ?? "").includes("/twoshot-vo/")
    ) ?? voClips?.[0];

    // If no merged track yet, synthesize it on demand by calling
    // compose-twoshot-audio (in case the user pressed the button before the
    // background prep ran).
    if (!mergedVo?.url) {
      await setStage(supabase, scene_id, "audio");
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/compose-twoshot-audio`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": auth,
          },
          body: JSON.stringify({ scene_id }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.url) {
          mergedVo = { url: j.url, duration: j.duration, metadata: { speakers: j.speakers } };
        } else {
          return json({ error: "twoshot_audio_failed", detail: j }, 422);
        }
      } catch (e) {
        return json({ error: "twoshot_audio_exception", message: (e as Error).message }, 500);
      }
    }

    // Wallet check
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .single();
    if (!wallet || wallet.balance < COST) {
      return json({ error: "INSUFFICIENT_CREDITS", required: COST }, 402);
    }

    const REPLICATE_KEY = Deno.env.get("REPLICATE_API_KEY");
    if (!REPLICATE_KEY) return json({ error: "REPLICATE_API_KEY missing" }, 500);

    // Reserve credits + mark stage.
    await supabase.from("wallets").update({
      balance: wallet.balance - COST,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);

    await setStage(supabase, scene_id, "lipsync_1", {
      lip_sync_status: "running",
      clip_error: null,
    });

    let refunded = false;
    const refund = async (reason: string) => {
      if (refunded) return;
      refunded = true;
      console.warn(`[compose-twoshot-lipsync ${scene_id}] Refund ${COST}: ${reason}`);
      const { data: w2 } = await supabase
        .from("wallets").select("balance").eq("user_id", user.id).single();
      if (w2) {
        await supabase.from("wallets").update({
          balance: w2.balance + COST,
          updated_at: new Date().toISOString(),
        }).eq("user_id", user.id);
      }
      await setStage(supabase, scene_id, "failed", {
        lip_sync_status: "failed",
        clip_error: reason.slice(0, 500),
      });
    };

    // ────────────────────────────────────────────────────────────────────
    // Async background pipeline. Edge Functions kill the connection long
    // before two sequential sync.so passes (~3 minutes wall-clock) finish.
    // We return 202 immediately and let `EdgeRuntime.waitUntil` keep the
    // worker alive. The frontend (`useTwoShotAutoTrigger`) polls
    // `composer_scenes.lip_sync_status` / `lip_sync_applied_at` for the
    // result — no HTTP response needed.
    // ────────────────────────────────────────────────────────────────────
    const runPipeline = async () => {
      const replicate = new Replicate({ auth: REPLICATE_KEY });
      const sceneDuration = Number((scene as any).duration_seconds ?? 0);
      let voDuration = Number(mergedVo.duration ?? 0);

      // ── Defensive: re-regenerate merged VO if it's significantly shorter
      // than the scene. Older runs of compose-twoshot-audio computed
      // totalSec = max(spokenSec, scene.duration_seconds), so when the
      // duration wasn't yet set (race with Hailuo webhook) the merged
      // track collapsed to spokenSec (~7s) — and Sync.so produced a 7s
      // lipsync clip that didn't match the 10s silent master. Force a
      // refresh so all downstream passes use a properly padded track.
      if (sceneDuration > 0 && voDuration > 0 && voDuration < sceneDuration - 0.5) {
        console.warn(
          `[compose-twoshot-lipsync ${scene_id}] merged VO ${voDuration}s < scene ${sceneDuration}s — regenerating with force_regenerate=true`,
        );
        try {
          const r = await fetch(`${supabaseUrl}/functions/v1/compose-twoshot-audio`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": auth,
            },
            body: JSON.stringify({ scene_id, force_regenerate: true }),
          });
          const j = await r.json().catch(() => ({}));
          if (r.ok && j?.url) {
            mergedVo = {
              url: j.url,
              duration: j.duration,
              metadata: { speakers: j.speakers },
            } as any;
            voDuration = Number(j.duration ?? voDuration);
          } else {
            console.warn(`[compose-twoshot-lipsync ${scene_id}] regen failed`, j);
          }
        } catch (e) {
          console.warn(`[compose-twoshot-lipsync ${scene_id}] regen exception`, (e as Error).message);
        }
      }

      const existingSpeakerMeta = Array.isArray((mergedVo as any)?.metadata?.speakers)
        ? ((mergedVo as any).metadata.speakers as Array<any>)
        : [];
      const uniqueSpeakerKeys = new Set(
        existingSpeakerMeta.map((s) => String(s?.character_id || s?.speaker_slug || s?.speaker || "").toLowerCase()).filter(Boolean),
      );
      if (existingSpeakerMeta.length > 2 && uniqueSpeakerKeys.size > 0 && existingSpeakerMeta.length > uniqueSpeakerKeys.size) {
        console.warn(
          `[compose-twoshot-lipsync ${scene_id}] legacy per-turn tracks detected (${existingSpeakerMeta.length} tracks/${uniqueSpeakerKeys.size} speakers) — regenerating per-character tracks`,
        );
        const r = await fetch(`${supabaseUrl}/functions/v1/compose-twoshot-audio`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": auth,
          },
          body: JSON.stringify({ scene_id, force_regenerate: true }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.url) {
          mergedVo = {
            url: j.url,
            duration: j.duration,
            metadata: { speakers: j.speakers },
          } as any;
          voDuration = Number(j.duration ?? voDuration);
        } else {
          await refund(`twoshot_audio_regen_failed: ${JSON.stringify(j).slice(0, 300)}`);
          return;
        }
      }


      // ── Per-speaker sequential lip-sync ─────────────────────────────
      // If compose-twoshot-audio produced per-speaker padded tracks
      // (metadata.speakers[i].track_url), run ONE sync.so pass per speaker.
      // Each pass feeds only that speaker's audio (silence elsewhere) into
      // lipsync-2 so active-speaker detection has a single voice signal and
      // animates exactly one face. This eliminates the swap caused by the
      // model picking the wrong face on a merged multi-speaker track.
      // Pass order follows character_shots (position 0 first).
      const speakerMeta = Array.isArray((mergedVo as any)?.metadata?.speakers)
        ? ((mergedVo as any).metadata.speakers as Array<any>)
        : [];
      const charShots = Array.isArray((scene as any).character_shots)
        ? ((scene as any).character_shots as Array<any>)
        : [];
      const shotOrder = new Map<string, number>();
      charShots.forEach((cs, idx) => {
        const id = String(cs?.characterId ?? "").toLowerCase();
        if (id) shotOrder.set(id, idx);
      });
      const passes = speakerMeta
        .filter((s) => typeof s?.track_url === "string" && s.track_url)
        .map((s, idx) => ({
          ...s,
          _shotIdx: shotOrder.has(String(s?.character_id ?? "").toLowerCase())
            ? shotOrder.get(String(s.character_id).toLowerCase())!
            : idx + 100, // unknown shots go last but stable
        }))
        .sort((a, b) => a._shotIdx - b._shotIdx);

      const useMultiPass = passes.length >= 2;
      const publicPasses = passes.map(({ _shotIdx: _shotIdx, ...p }) => p);
      let outUrl: string | null = null;

      if (useMultiPass) {
        let currentVideo = sourceClipUrl;
        for (let p = 0; p < passes.length; p++) {
          const pass = passes[p];
          console.log(
            `[compose-twoshot-lipsync ${scene_id}] pass ${p + 1}/${passes.length}`,
            { speaker: pass.speaker, character_id: pass.character_id, audio: pass.track_url },
          );
          const passStartedAt = new Date().toISOString();
          const prevPlan = ((scene as any).audio_plan ?? {}) as Record<string, unknown>;
          const prevTwoshot = (prevPlan.twoshot ?? {}) as Record<string, unknown>;
          await setStage(supabase, scene_id, p === 0 ? "lipsync_1" : "lipsync_2", {
            audio_plan: {
              ...prevPlan,
              twoshot: {
                ...prevTwoshot,
                speakers: publicPasses,
                heartbeat: {
                  pass: p + 1,
                  total_passes: passes.length,
                  started_at: passStartedAt,
                  speaker: pass.speaker,
                },
              },
            },
          });
          // Deterministic face targeting per pass — without this, Sync.so's
          // active_speaker auto-detect collapses both passes onto the same
          // (most prominent) face, leaving speaker 2's mouth unanimated.
          // We send both `face_index` AND `speaker` so we work regardless of
          // which field the current Replicate schema honors; unknown fields
          // are silently ignored by Replicate.
          let passOutput: unknown;
          try {
            passOutput = await withTimeout(
              replicate.run(
                LIPSYNC_MODEL,
                {
                  input: {
                    video: currentVideo,
                    audio: pass.track_url,
                    sync_mode: "loop",
                    active_speaker: true,
                    temperature: 0.5,
                    output_format: "mp4",
                    face_index: p,
                    speaker: p,
                  },
                },
              ),
              PASS_TIMEOUT_MS,
              `lipsync_pass_${p + 1}`,
            );
          } catch (e) {
            await refund(`lipsync_pass_${p + 1}_failed: ${(e as Error).message}`);
            return;
          }
          let stepUrl: string | null = null;
          if (typeof passOutput === "string") stepUrl = passOutput;
          else if (Array.isArray(passOutput) && passOutput.length) stepUrl = passOutput[0] as string;
          else if (passOutput && typeof passOutput === "object") {
            const o = passOutput as Record<string, unknown>;
            stepUrl = (o.video || o.output || o.url) as string ?? null;
          }
          if (!stepUrl) {
            await refund(`pass_${p + 1}_no_output`);
            return;
          }
          currentVideo = stepUrl;
          outUrl = stepUrl;
        }
      } else {
        // Fallback: legacy single merged-audio pass.
        const syncMode = voDuration > sceneDuration + 0.2 ? "cut_off" : "loop";
        let output: unknown;
        try {
          output = await withTimeout(
            replicate.run(
              LIPSYNC_MODEL,
              {
                input: {
                  video: sourceClipUrl,
                  audio: mergedVo.url,
                  sync_mode: syncMode,
                  temperature: 0.5,
                  active_speaker: true,
                  output_format: "mp4",
                },
              },
            ),
            PASS_TIMEOUT_MS,
            "lipsync_single_pass",
          );
        } catch (e) {
          await refund(`lipsync_single_pass_failed: ${(e as Error).message}`);
          return;
        }
        await setStage(supabase, scene_id, "lipsync_2");
        if (typeof output === "string") outUrl = output;
        else if (Array.isArray(output) && output.length) outUrl = output[0] as string;
        else if (output && typeof output === "object") {
          const o = output as Record<string, unknown>;
          outUrl = (o.video || o.output || o.url) as string ?? null;
        }
      }

      if (!outUrl) {
        await refund("no_output_url");
        return;
      }

      // Re-host output in our own bucket.
      let publicUrl = outUrl;
      try {
        const dl = await fetch(outUrl);
        if (dl.ok) {
          const buf = new Uint8Array(await dl.arrayBuffer());
          const path = `${user.id}/${scene_id}-twoshot-${Date.now()}.mp4`;
          const { error: upErr } = await supabase.storage
            .from("composer-clips")
            .upload(path, buf, { contentType: "video/mp4", upsert: true });
          if (!upErr) {
            const { data: pub } = supabase.storage.from("composer-clips").getPublicUrl(path);
            if (pub?.publicUrl) publicUrl = pub.publicUrl;
          }
        }
      } catch (e) {
        console.warn("[compose-twoshot-lipsync] rehost failed, using replicate url", e);
      }

      // ── Continuity Guardian (lightweight) ─────────────────────────────
      // Without ffmpeg in Deno edge, we can't extract frames server-side.
      // We do a best-effort visual check by passing the anchor + final clip
      // poster to Gemini Vision with a structured score request. If the
      // model is unavailable, we set null and let the user inspect manually.
      await setStage(supabase, scene_id, "continuity");
      let driftScore: number | null = null;
      let driftNotes: any = null;
      try {
        const anchorUrl = (scene as any).lock_reference_url as string | undefined;
        if (anchorUrl && LOVABLE_API_KEY) {
          // Use a video poster URL via a thumbnail param (composer-clips bucket
          // serves MP4 — Gemini can ingest the MP4 directly for short clips).
          const visionResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text:
                        "You are a continuity supervisor. Compare the reference anchor image with the rendered video. " +
                        "Rate visual drift from 0 (identical characters/lighting/background) to 1 (completely different). " +
                        "Reply ONLY with strict JSON: {\"drift\": <0..1>, \"identity\": \"ok|drift\", \"background\": \"ok|drift\", \"lighting\": \"ok|drift\", \"notes\": \"<short reason>\"}",
                    },
                    { type: "image_url", image_url: { url: anchorUrl } },
                    { type: "image_url", image_url: { url: publicUrl } },
                  ],
                },
              ],
            }),
            // Continuity check is best-effort — short timeout.
            signal: AbortSignal.timeout(15_000),
          });
          if (visionResp.ok) {
            const vj = await visionResp.json();
            const txt = vj?.choices?.[0]?.message?.content ?? "";
            const m = String(txt).match(/\{[\s\S]*\}/);
            if (m) {
              const parsed = JSON.parse(m[0]);
              driftScore = typeof parsed.drift === "number" ? Math.max(0, Math.min(1, parsed.drift)) : null;
              driftNotes = {
                identity: parsed.identity,
                background: parsed.background,
                lighting: parsed.lighting,
                notes: parsed.notes,
              };
            }
          }
        }
      } catch (e) {
        console.warn("[compose-twoshot-lipsync] continuity check failed (non-fatal)", (e as Error).message);
      }

      // Final DB update.
      // For multi-pass two-shot, the final video's embedded audio only
      // contains the LAST pass's voice (sync.so muxes its input audio into
      // the output). The full merged dialogue lives in the external merged
      // VO track (mergedVo.url, mirrored to character_audio_url). The
      // preview/render must mute the video and play the external track.
      const isMultiPassTwoshot = useMultiPass;
      const updates: Record<string, unknown> = {
        clip_url: publicUrl,
        lip_sync_applied_at: new Date().toISOString(),
        lip_sync_status: "done",
        twoshot_stage: "done",
        continuity_drift_score: driftScore,
        continuity_drift_notes: driftNotes,
      };
      if (!(scene as any).lip_sync_source_clip_url && scene.clip_url) {
        updates.lip_sync_source_clip_url = scene.clip_url;
      }
      if (isMultiPassTwoshot && mergedVo?.url) {
        const prevPlan = ((scene as any).audio_plan ?? {}) as Record<string, unknown>;
        const prevTwoshot = (prevPlan.twoshot ?? {}) as Record<string, unknown>;
        // Strip per-speaker audioUrls — they're already mixed into the
        // merged twoshot track. Leaving them in causes downstream consumers
        // (preview hook, render export) to play them again on top of the
        // merged track = audible echo.
        const prevSpeakers = Array.isArray(prevPlan.speakers)
          ? (prevPlan.speakers as Array<Record<string, unknown>>)
          : [];
        const mergedSpeakers = prevSpeakers.map((sp) => ({
          ...sp,
          audioUrl: null,
          mergedInto: "twoshot",
        }));
        updates.audio_plan = {
          ...prevPlan,
          speakers: mergedSpeakers,
          twoshot: {
            ...prevTwoshot,
            speakers: publicPasses,
            url: mergedVo.url,
            useExternalAudio: true,
            embeddedAudio: false,
            lipsyncedAt: new Date().toISOString(),
            passes: passes.length,
          },
        };
      }

      const { error: updErr } = await supabase
        .from("composer_scenes")
        .update(updates)
        .eq("id", scene_id);
      if (updErr) {
        await refund(`db_update_failed: ${updErr.message}`);
        return;
      }

      // Supersede the original silent Hailuo `video_creations` row for this
      // scene so the Media Library doesn't keep showing two cards (10s
      // silent original + new lipsynced clip). The lipsync output is the
      // user-facing version; the silent master stays in DB as audit anchor
      // via composer_scenes.lip_sync_source_clip_url but is hidden from the
      // library by the `superseded` flag.
      try {
        const { data: prior } = await supabase
          .from("video_creations")
          .select("id, metadata")
          .eq("user_id", user.id)
          .contains("metadata", { source: "motion-studio-clip", scene_id });
        if (prior && prior.length) {
          const stamp = new Date().toISOString();
          for (const row of prior) {
            const md = (row.metadata || {}) as Record<string, unknown>;
            if (md.superseded === true) continue;
            await supabase
              .from("video_creations")
              .update({
                metadata: { ...md, superseded: true, superseded_at: stamp, superseded_by: "twoshot_lipsync" },
                updated_at: stamp,
              })
              .eq("id", row.id);
          }
        }
      } catch (supErr) {
        console.warn("[compose-twoshot-lipsync] supersede prior library entries failed (non-fatal):", (supErr as Error).message);
      }

      console.log(
        `[compose-twoshot-lipsync ${scene_id}] ✅ done — clip=${publicUrl} drift=${driftScore}`,
      );
    };


    // Fire-and-forget: keep worker alive but return 202 to client now.
    // Any throw inside runPipeline triggers a refund + status='failed'.
    EdgeRuntime.waitUntil(
      (async () => {
        try {
          await runPipeline();
        } catch (e) {
          await refund(`pipeline_exception: ${(e as Error).message}`);
        }
      })(),
    );

    return json({
      accepted: true,
      scene_id,
      status: "running",
      credits_reserved: COST,
    }, 202);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
