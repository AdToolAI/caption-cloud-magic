// autopilot-orchestrate
//
// The production loop. Runs AFTER the user approved a treatment:
//
//   for each scene:  anchor gate (cheap, judged, repaired)  →  motion pass (expensive)
//
// The expensive pass is only ever reached with a verified frame in hand. The
// loop runs in the background (EdgeRuntime.waitUntil) and reports progress
// through `autopilot_productions` + `autopilot_director_log`, which the
// Director's Table polls — no long-lived HTTP request, no client timeout.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import Replicate from "npm:replicate@0.25.2";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";
import { AUTOPILOT_PRICE, chargeStage, refundStage } from "../_shared/autopilotCredits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

interface SceneInput {
  id: string;
  orderIndex: number;
  beat: string;
  durationSeconds: number;
  anchorPrompt: string;
  motionPrompt: string;
  dialogue?: string | null;
  speakerCharacterId?: string | null;
  voiceId?: string | null;
  voiceLanguage?: string | null;
  characterIds?: string[];
  portraitUrls?: string[];
  characterNames?: string[];
  soundDesign?: Record<string, unknown> | null;
  grammar?: Record<string, unknown>;
}

interface Body {
  production_id: string;
  aspect_ratio?: string;
  scenes: SceneInput[];
}

/** Engine picked per scene length — Hailuo is the reliable i2v workhorse. */
const MOTION_MODEL = "minimax/hailuo-2.3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { fn: "autopilot-orchestrate", ok: true });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = (await req.json()) as Body;
    if (!body?.production_id || !Array.isArray(body.scenes) || body.scenes.length === 0) {
      return json({ error: "production_id and scenes are required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Ownership check — never orchestrate somebody else's production.
    const { data: production } = await admin
      .from("autopilot_productions")
      .select("id, user_id, status, aspect_ratio")
      .eq("id", body.production_id)
      .maybeSingle();

    if (!production || production.user_id !== user.id) {
      return json({ error: "not_found" }, 404);
    }
    if (production.status === "running") {
      return json({ ok: true, already_running: true });
    }

    const aspect = body.aspect_ratio ?? production.aspect_ratio ?? "9:16";

    // Fresh scene rows for this run.
    await admin.from("autopilot_production_scenes").delete().eq("production_id", production.id);
    await admin.from("autopilot_production_scenes").insert(
      body.scenes.map((scene) => ({
        production_id: production.id,
        user_id: user.id,
        scene_index: scene.orderIndex,
        beat: scene.beat,
        duration_seconds: scene.durationSeconds,
        grammar: scene.grammar ?? {},
        anchor_prompt: scene.anchorPrompt,
        motion_prompt: scene.motionPrompt,
        dialogue: scene.dialogue
          ? {
              text: scene.dialogue,
              speaker_character_id: scene.speakerCharacterId ?? null,
              voice_id: scene.voiceId ?? null,
              language: scene.voiceLanguage ?? null,
            }
          : {},
        sound_design: scene.soundDesign ?? {},
        status: "pending",
      })),
    );

    await admin
      .from("autopilot_productions")
      .update({
        stage: "anchors",
        status: "running",
        progress: 25,
        approved_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", production.id);

    await log(admin, production.id, user.id, {
      stage: "anchors",
      role: "director",
      message: `Freigabe erteilt — Produktion mit ${body.scenes.length} Szenen gestartet.`,
    });

    // Hand the long work to the background; the client polls from here on.
    const task = runProduction(admin, production.id, user.id, aspect, body.scenes);
    // @ts-ignore EdgeRuntime is provided by the Supabase runtime
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(task);
    else void task;

    return json({ ok: true, production_id: production.id, scenes: body.scenes.length });
  } catch (err) {
    console.error("[autopilot-orchestrate] fatal", err);
    return json({ error: err instanceof Error ? err.message : "unknown" }, 500);
  }
});

// ------------------------------------------------------------------ the loop

async function runProduction(
  admin: ReturnType<typeof createClient>,
  productionId: string,
  userId: string,
  aspect: string,
  scenes: SceneInput[],
) {
  const replicateKey = Deno.env.get("REPLICATE_API_KEY");
  const total = scenes.length;
  let done = 0;
  let failed = 0;

  for (const scene of scenes) {
    const started = Date.now();
    try {
      await setSceneStatus(admin, productionId, scene.orderIndex, { status: "anchor" });

      // --- Stage 1: prove the frame for cents ------------------------------
      const anchor = await callAnchorGate({
        sceneId: scene.id,
        productionId,
        prompt: scene.anchorPrompt,
        aspect,
        portraitUrls: scene.portraitUrls ?? [],
        characterNames: scene.characterNames ?? [],
      });

      if (!anchor?.anchor_url) {
        failed++;
        await setSceneStatus(admin, productionId, scene.orderIndex, {
          status: "failed",
          error_message: "Kein brauchbares Ankerbild — Szene übersprungen.",
        });
        await log(admin, productionId, userId, {
          stage: "anchors",
          role: "dp",
          severity: "error",
          scene_index: scene.orderIndex,
          message: `Szene ${scene.orderIndex + 1}: Bildfreigabe gescheitert — keine Motion-Credits ausgegeben.`,
        });
        continue;
      }

      // Bill the still only once it actually delivered.
      const anchorEuros = Math.max(1, anchor.attempts ?? 1) * AUTOPILOT_PRICE.anchorImage;
      await chargeStage(admin, {
        userId,
        productionId,
        stage: "anchor",
        sceneIndex: scene.orderIndex,
        euros: anchorEuros,
        label: `Bildfreigabe Szene ${scene.orderIndex + 1}`,
      });

      await setSceneStatus(admin, productionId, scene.orderIndex, {
        status: "motion",
        anchor_url: anchor.anchor_url,
        anchor_score: Math.round(anchor.score ?? 0),
        anchor_attempts: anchor.attempts ?? 1,
        anchor_verdicts: anchor.verdicts ?? [],
      });

      await log(admin, productionId, userId, {
        stage: "anchors",
        role: "dp",
        scene_index: scene.orderIndex,
        duration_ms: Date.now() - started,
        message: `Szene ${scene.orderIndex + 1}: Bild freigegeben (Score ${Math.round(anchor.score ?? 0)}${
          anchor.attempts > 1 ? `, ${anchor.attempts} Anläufe` : ""
        }).`,
        meta: { anchor_url: anchor.anchor_url },
      });

      // --- Stage 2: only now do we spend motion credits --------------------
      if (!replicateKey) throw new Error("REPLICATE_API_KEY fehlt");

      const motionEuros = Math.max(1, scene.durationSeconds) * AUTOPILOT_PRICE.motionPerSecond;
      const motionCharge = await chargeStage(admin, {
        userId,
        productionId,
        stage: "motion",
        sceneIndex: scene.orderIndex,
        euros: motionEuros,
        label: `Bewegtbild Szene ${scene.orderIndex + 1}`,
      });

      if (!motionCharge.charged && motionCharge.reason === "insufficient") {
        failed++;
        await setSceneStatus(admin, productionId, scene.orderIndex, {
          status: "failed",
          error_message: "Guthaben reicht für diese Szene nicht aus.",
        });
        await log(admin, productionId, userId, {
          stage: "motion",
          role: "producer",
          severity: "error",
          scene_index: scene.orderIndex,
          message: `Szene ${scene.orderIndex + 1}: Guthaben aufgebraucht — Produktion gestoppt.`,
        });
        break;
      }

      const videoUrl = await animate({
        apiKey: replicateKey,
        imageUrl: anchor.anchor_url,
        prompt: scene.motionPrompt,
        durationSeconds: scene.durationSeconds,
      });

      if (!videoUrl) {
        failed++;
        await refundStage(admin, {
          userId,
          productionId,
          stage: "motion",
          sceneIndex: scene.orderIndex,
          euros: motionEuros,
          label: `Bewegtbild Szene ${scene.orderIndex + 1} fehlgeschlagen`,
        });
        await setSceneStatus(admin, productionId, scene.orderIndex, {
          status: "failed",
          error_message: "Animation lieferte kein Video.",
        });
        await log(admin, productionId, userId, {
          stage: "motion",
          role: "editor",
          severity: "error",
          scene_index: scene.orderIndex,
          message: `Szene ${scene.orderIndex + 1}: Animation fehlgeschlagen.`,
        });
      } else {
        done++;
        await setSceneStatus(admin, productionId, scene.orderIndex, {
          status: "completed",
          video_url: videoUrl,
          engine: MOTION_MODEL,
        });

        // --- Stage 3: speaking scenes get voice + lip-sync -----------------
        if (scene.dialogue && scene.dialogue.trim().length > 1) {
          await speakAndSync(admin, {
            productionId,
            userId,
            scene,
            videoUrl,
          });
        }
        await log(admin, productionId, userId, {
          stage: "motion",
          role: "editor",
          scene_index: scene.orderIndex,
          duration_ms: Date.now() - started,
          message: `Szene ${scene.orderIndex + 1}: Clip fertig (${scene.durationSeconds.toFixed(1)}s).`,
          meta: { video_url: videoUrl },
        });
      }
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : "unknown";
      console.error("[autopilot-orchestrate] scene failed", scene.orderIndex, message);
      await setSceneStatus(admin, productionId, scene.orderIndex, {
        status: "failed",
        error_message: message,
      });
      await log(admin, productionId, userId, {
        stage: "motion",
        role: "editor",
        severity: "error",
        scene_index: scene.orderIndex,
        message: `Szene ${scene.orderIndex + 1}: ${message}`,
      });
    }

    await admin
      .from("autopilot_productions")
      .update({ progress: 25 + Math.round(((done + failed) / total) * 70) })
      .eq("id", productionId);
  }

  const allFailed = done === 0;
  await admin
    .from("autopilot_productions")
    .update({
      stage: allFailed ? "failed" : "scenes_ready",
      status: allFailed ? "failed" : "running",
      progress: allFailed ? 100 : 78,
      error_message: allFailed ? "Keine Szene konnte produziert werden." : null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", productionId);

  await log(admin, productionId, userId, {
    stage: allFailed ? "failed" : "scenes_ready",
    role: "director",
    severity: allFailed ? "error" : "info",
    message: allFailed
      ? "Produktion abgebrochen — keine Szene bestand die Prüfung."
      : `Szenen im Kasten: ${done} von ${total}${failed ? `, ${failed} übersprungen` : ""}. Endschnitt startet.`,
  });

  if (allFailed) return;

  // Hand over to the final cut: audio mix, overlays, Lambda render.
  try {
    const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/autopilot-finalize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ production_id: productionId, user_id: userId }),
    });
    if (!resp.ok) {
      throw new Error(`finalize ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    }
  } catch (err) {
    console.error("[autopilot-orchestrate] finalize handoff failed", err);
    await admin
      .from("autopilot_productions")
      .update({
        stage: "scenes_ready",
        status: "completed",
        progress: 95,
        error_message: "Endschnitt konnte nicht gestartet werden — die Szenen sind gesichert.",
      })
      .eq("id", productionId);
  }
}

/**
 * Speaking scene: record every turn, then lip-sync the clip speaker by speaker.
 *
 * Hardened path (v295): Sync.so is driven directly here — with codec preflight,
 * circuit-breaker, anchor face-gate and one pass per speaker. Sync.so is
 * audio-driven, so German ElevenLabs audio passes through untouched; Kling Omni
 * is deliberately not used because it synthesises its own (non-German) voice.
 *
 * Voice and lip-sync are billed per stage against `ai_video_wallets` and
 * refunded on failure. A failure never kills the scene — the silent clip stays
 * usable for the final cut.
 */
async function speakAndSync(
  admin: ReturnType<typeof createClient>,
  args: {
    productionId: string;
    userId: string;
    scene: SceneInput;
    videoUrl: string;
    anchorUrl?: string | null;
  },
) {
  const { productionId, userId, scene, videoUrl } = args;

  // Canonical turns: explicit multi-speaker array, else the single dialogue line.
  const turns: AutopilotTurn[] = (scene.turns && scene.turns.length > 0)
    ? scene.turns
    : (scene.dialogue ?? "").trim().length > 1
    ? [{
      id: `${scene.id}:0`,
      text: (scene.dialogue ?? "").trim(),
      speakerCharacterId: scene.speakerCharacterId ?? null,
      speakerName: scene.characterNames?.[0] ?? "Sprecher",
      voiceId: scene.voiceId ?? null,
      language: scene.voiceLanguage ?? "de",
    }]
    : [];

  if (turns.length === 0) return;

  const speakerCount = turns.length;
  const voiceEuros = Math.max(1, scene.durationSeconds) * AUTOPILOT_PRICE.voicePerSecond *
    speakerCount;
  const voiceCharge = await chargeStage(admin, {
    userId,
    productionId,
    stage: "voice",
    sceneIndex: scene.orderIndex,
    euros: voiceEuros,
    label: `Sprachaufnahme Szene ${scene.orderIndex + 1}`,
  });
  if (!voiceCharge.charged && voiceCharge.reason === "insufficient") return;

  const built = await buildTurnTracks({
    admin,
    userId,
    productionId,
    sceneIndex: scene.orderIndex,
    turns,
    sceneDurationSec: scene.durationSeconds,
    defaultLanguage: scene.voiceLanguage ?? "de",
  });

  if (!built.ok || !built.masterUrl) {
    await refundStage(admin, {
      userId,
      productionId,
      stage: "voice",
      sceneIndex: scene.orderIndex,
      euros: voiceEuros,
      label: `Sprachaufnahme Szene ${scene.orderIndex + 1} fehlgeschlagen`,
    });
    await log(admin, productionId, userId, {
      stage: "audio",
      role: "sound",
      severity: "warn",
      scene_index: scene.orderIndex,
      message: `Szene ${scene.orderIndex + 1}: Sprachaufnahme fehlgeschlagen (${
        built.reason ?? "unbekannt"
      }) — Credits erstattet.`,
    });
    return;
  }

  await setSceneStatus(admin, productionId, scene.orderIndex, {
    voiceover_url: built.masterUrl,
    voiceover_duration_seconds: Math.round(built.totalSec * 100) / 100,
  });

  // Face-gate on the anchor (the i2v input = the clip's geometry). A missing or
  // tiny face means Sync.so would burn credits on an unanimatable mouth.
  let boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  if (args.anchorUrl) {
    const gate = await checkAnchorFaces({
      anchorUrl: args.anchorUrl,
      expectedSpeakers: speakerCount,
    });
    boxes = gate.boxes;
    if (!gate.ok) {
      await log(admin, productionId, userId, {
        stage: "lipsync",
        role: "dp",
        severity: "warn",
        scene_index: scene.orderIndex,
        message: `Szene ${scene.orderIndex + 1}: Gesichts-Check nicht bestanden (${gate.reason}) — Lip-Sync übersprungen, Ton bleibt erhalten.`,
      });
      return;
    }
  }

  const lipsyncEuros = Math.max(1, scene.durationSeconds) *
    AUTOPILOT_PRICE.lipsyncPerSecondPerSpeaker * speakerCount;
  const syncCharge = await chargeStage(admin, {
    userId,
    productionId,
    stage: "lipsync",
    sceneIndex: scene.orderIndex,
    euros: lipsyncEuros,
    label: `Lip-Sync Szene ${scene.orderIndex + 1}`,
  });
  if (!syncCharge.charged && syncCharge.reason === "insufficient") {
    await log(admin, productionId, userId, {
      stage: "lipsync",
      role: "producer",
      severity: "warn",
      scene_index: scene.orderIndex,
      message: `Szene ${scene.orderIndex + 1}: Guthaben reicht nicht für Lip-Sync — Clip bleibt stumm.`,
    });
    return;
  }

  const result = await runLipSyncPasses({
    admin,
    clipUrl: videoUrl,
    durationSec: built.totalSec,
    passes: built.tracks.map((track, i) => ({
      trackUrl: track.url,
      startSec: track.startSec,
      box: boxes[i] ?? null,
      speakerName: track.turn.speakerName ?? `Sprecher ${i + 1}`,
    })),
  });

  if (result.ok && result.outputUrl) {
    await setSceneStatus(admin, productionId, scene.orderIndex, {
      lipsync_url: result.outputUrl,
    });
    await log(admin, productionId, userId, {
      stage: "lipsync",
      role: "sound",
      scene_index: scene.orderIndex,
      message: `Szene ${scene.orderIndex + 1}: Lip-Sync sitzt (${result.passesDone} von ${speakerCount} Sprechern).`,
    });
    return;
  }

  // Partial success keeps what we got, but only the unfinished passes are refunded.
  const failedPasses = Math.max(1, speakerCount - result.passesDone);
  await refundStage(admin, {
    userId,
    productionId,
    stage: "lipsync",
    sceneIndex: scene.orderIndex,
    euros: Math.round((lipsyncEuros * failedPasses / speakerCount) * 100) / 100,
    label: `Lip-Sync Szene ${scene.orderIndex + 1} fehlgeschlagen`,
  });
  if (result.outputUrl) {
    await setSceneStatus(admin, productionId, scene.orderIndex, {
      lipsync_url: result.outputUrl,
    });
  }
  await log(admin, productionId, userId, {
    stage: "lipsync",
    role: "sound",
    severity: "warn",
    scene_index: scene.orderIndex,
    message: `Szene ${scene.orderIndex + 1}: Lip-Sync unvollständig (${
      result.reason ?? "unbekannt"
    }) — anteilig erstattet.`,
  });
}


// ------------------------------------------------------------------- helpers

async function callAnchorGate(args: {
  sceneId: string;
  productionId: string;
  prompt: string;
  aspect: string;
  portraitUrls: string[];
  characterNames: string[];
}): Promise<{ anchor_url: string | null; score: number; attempts: number; verdicts: unknown } | null> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/autopilot-anchor-gate`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({
      production_id: args.productionId,
      scene_id: args.sceneId,
      anchor_prompt: args.prompt,
      aspect_ratio: args.aspect,
      portrait_urls: args.portraitUrls,
      character_names: args.characterNames,
    }),
  });
  if (!resp.ok) {
    console.error("[autopilot-orchestrate] anchor gate", resp.status, (await resp.text()).slice(0, 300));
    return null;
  }
  return await resp.json();
}

async function animate(args: {
  apiKey: string;
  imageUrl: string;
  prompt: string;
  durationSeconds: number;
}): Promise<string | null> {
  const replicate = new Replicate({ auth: args.apiKey });
  // Hailuo accepts 6s or 10s; round to the nearest supported slot.
  const duration = args.durationSeconds > 8 ? 10 : 6;
  const output = await replicate.run(MOTION_MODEL, {
    input: { image: args.imageUrl, prompt: args.prompt, duration },
  });

  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length) return String(output[0]);
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    const value = obj.video ?? obj.output ?? obj.url;
    return value ? String(value) : null;
  }
  return null;
}

async function setSceneStatus(
  admin: ReturnType<typeof createClient>,
  productionId: string,
  sceneIndex: number,
  patch: Record<string, unknown>,
) {
  await admin
    .from("autopilot_production_scenes")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("production_id", productionId)
    .eq("scene_index", sceneIndex);
}

async function log(
  admin: ReturnType<typeof createClient>,
  productionId: string,
  userId: string,
  entry: {
    stage: string;
    role: string;
    message: string;
    severity?: string;
    scene_index?: number;
    duration_ms?: number;
    meta?: Record<string, unknown>;
  },
) {
  await admin.from("autopilot_director_log").insert({
    production_id: productionId,
    user_id: userId,
    stage: entry.stage,
    role: entry.role,
    severity: entry.severity ?? "info",
    message: entry.message,
    scene_index: entry.scene_index ?? null,
    duration_ms: entry.duration_ms ?? null,
    meta: entry.meta ?? {},
  });
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
