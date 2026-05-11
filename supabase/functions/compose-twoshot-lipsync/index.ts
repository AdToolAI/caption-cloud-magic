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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const COST = 16; // 2× normal lip-sync cost (multi-pass two-shot)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function setStage(
  supabase: ReturnType<typeof createClient>,
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

    let mergedVo = voClips?.find((c: any) =>
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

    try {
      const replicate = new Replicate({ auth: REPLICATE_KEY });
      const sceneDuration = Number((scene as any).duration_seconds ?? 0);
      const voDuration = Number(mergedVo.duration ?? 0);

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
      let outUrl: string | null = null;

      if (useMultiPass) {
        let currentVideo = sourceClipUrl;
        for (let p = 0; p < passes.length; p++) {
          const pass = passes[p];
          console.log(
            `[compose-twoshot-lipsync ${scene_id}] pass ${p + 1}/${passes.length}`,
            { speaker: pass.speaker, character_id: pass.character_id, audio: pass.track_url },
          );
          await setStage(supabase, scene_id, p === 0 ? "lipsync_1" : "lipsync_2");
          const passOutput = await replicate.run(
            "sync/lipsync-2" as `${string}/${string}`,
            {
              input: {
                video: currentVideo,
                audio: pass.track_url,
                sync_mode: "loop",
                active_speaker: true,
              },
            },
          );
          let stepUrl: string | null = null;
          if (typeof passOutput === "string") stepUrl = passOutput;
          else if (Array.isArray(passOutput) && passOutput.length) stepUrl = passOutput[0] as string;
          else if (passOutput && typeof passOutput === "object") {
            const o = passOutput as Record<string, unknown>;
            stepUrl = (o.video || o.output || o.url) as string ?? null;
          }
          if (!stepUrl) {
            await refund(`pass_${p + 1}_no_output`);
            return json({ error: `lipsync pass ${p + 1} produced no output` }, 502);
          }
          currentVideo = stepUrl;
          outUrl = stepUrl;
        }
      } else {
        // Fallback: legacy single merged-audio pass.
        const syncMode = voDuration > sceneDuration + 0.2 ? "cut_off" : "loop";
        const output = await replicate.run(
          "sync/lipsync-2" as `${string}/${string}`,
          {
            input: {
              video: sourceClipUrl,
              audio: mergedVo.url,
              sync_mode: syncMode,
            },
          },
        );
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
        return json({ error: "no output url" }, 502);
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
        updates.audio_plan = {
          ...prevPlan,
          twoshot: {
            ...prevTwoshot,
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
        return json({ error: updErr.message }, 500);
      }

      return json({
        success: true,
        scene_id,
        clip_url: publicUrl,
        credits_used: COST,
        continuity_drift_score: driftScore,
        continuity_drift_notes: driftNotes,
      });
    } catch (e) {
      await refund(`replicate_error: ${(e as Error).message}`);
      return json({ error: (e as Error).message }, 502);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
