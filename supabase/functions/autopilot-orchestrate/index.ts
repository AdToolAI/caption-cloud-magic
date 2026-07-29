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
import {
  type AutopilotTurn,
  buildTurnTracks,
  checkAnchorFaces,
} from "../_shared/autopilotLipSync.ts";
import {
  composerLipsyncCredits,
  creditsToEuros,
  ensureShadowProject,
  runComposerLipSync,
  upsertBridgeScene,
} from "../_shared/autopilotComposerBridge.ts";


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
  /** Multi-speaker: canonical turn array. Wins over `dialogue` when present. */
  turns?: AutopilotTurn[];
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
        dialogue: (scene.turns?.length ?? 0) > 0
          ? {
              text: (scene.turns ?? []).map((t) => t.text).join(" "),
              turns: (scene.turns ?? []).map((t, i) => ({
                id: t.id || `${scene.id}:${i}`,
                text: t.text,
                speaker_character_id: t.speakerCharacterId ?? null,
                speaker_name: t.speakerName ?? null,
                voice_id: t.voiceId ?? null,
                language: t.language ?? scene.voiceLanguage ?? null,
              })),
            }
          : scene.dialogue
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

/**
 * v297 — Belastbarkeit für lange Filme.
 *
 * Drei Änderungen gegenüber der seriellen Schleife von vorher:
 *
 *  1. Jede Szene bekommt bis zu zwei Anläufe, der zweite mit repariertem
 *     Prompt. Scheitert auch der, wird die Szene aus dem freigegebenen Anker
 *     als Standbild gefüllt — die Laufzeit bleibt erhalten, statt still zu
 *     schrumpfen.
 *  2. Bis zu drei Szenen laufen gleichzeitig. Lip-Sync-Szenen werden dabei
 *     serialisiert, weil die Sync.so-Slots knapp sind.
 *  3. Nach jeder Szene wird ein Heartbeat geschrieben, damit
 *     `autopilot-watchdog` eine tote Background-Task erkennt und fortsetzt.
 */
const SCENE_CONCURRENCY = 3;

async function runProduction(
  admin: ReturnType<typeof createClient>,
  productionId: string,
  userId: string,
  aspect: string,
  scenes: SceneInput[],
  resume = false,
) {
  const replicateKey = Deno.env.get("REPLICATE_API_KEY");
  const total = scenes.length;
  const counters = { done: 0, failed: 0, stills: 0 };
  /** Wird gesetzt, sobald das Guthaben leer ist — dann startet nichts Neues mehr. */
  let outOfCredits = false;
  /** Sync.so verträgt keine parallelen Autopilot-Passes. */
  let lipsyncLock: Promise<void> = Promise.resolve();

  // Resume: bereits fertige Szenen nicht erneut produzieren.
  let skipIndices = new Set<number>();
  if (resume) {
    const { data: existing } = await admin
      .from("autopilot_production_scenes")
      .select("scene_index, status")
      .eq("production_id", productionId);
    skipIndices = new Set(
      (existing ?? [])
        .filter((row: Record<string, unknown>) => row.status === "completed")
        .map((row: Record<string, unknown>) => Number(row.scene_index)),
    );
    counters.done = skipIndices.size;
  }

  const pending = scenes.filter((scene) => !skipIndices.has(scene.orderIndex));

  const heartbeat = async () => {
    await admin
      .from("autopilot_productions")
      .update({
        heartbeat_at: new Date().toISOString(),
        progress: 25 +
          Math.round(((counters.done + counters.failed) / Math.max(1, total)) * 70),
      })
      .eq("id", productionId);
  };

  const withLipsyncLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    const previous = lipsyncLock;
    let release!: () => void;
    lipsyncLock = new Promise<void>((resolve) => (release = resolve));
    await previous.catch(() => {});
    try {
      return await fn();
    } finally {
      release();
    }
  };

  const produceScene = async (scene: SceneInput) => {
    if (outOfCredits) return;
    const started = Date.now();

    let anchorUrl: string | null = null;
    let anchorScore = 0;
    let lastError = "unbekannt";

    for (let attempt = 1; attempt <= MAX_SCENE_ATTEMPTS; attempt++) {
      if (outOfCredits) return;
      try {
        await setSceneStatus(admin, productionId, scene.orderIndex, {
          status: "anchor",
          attempt,
          error_message: null,
        });

        // --- Stage 1: prove the frame for cents --------------------------
        const anchorPrompt = attempt === 1
          ? scene.anchorPrompt
          : repairAnchorPrompt(scene.anchorPrompt);

        const anchor = anchorUrl
          // Ein bereits freigegebener Anker wird nicht neu bezahlt.
          ? { anchor_url: anchorUrl, score: anchorScore, attempts: 1, verdicts: [] }
          : await callAnchorGate({
            sceneId: scene.id,
            productionId,
            prompt: anchorPrompt,
            aspect,
            portraitUrls: scene.portraitUrls ?? [],
            characterNames: scene.characterNames ?? [],
          });

        if (!anchor?.anchor_url) {
          lastError = "Kein brauchbares Ankerbild.";
          await log(admin, productionId, userId, {
            stage: "anchors",
            role: "dp",
            severity: attempt < MAX_SCENE_ATTEMPTS ? "warn" : "error",
            scene_index: scene.orderIndex,
            message: attempt < MAX_SCENE_ATTEMPTS
              ? `Szene ${scene.orderIndex + 1}: Bildfreigabe gescheitert — zweiter Anlauf mit vereinfachter Bildidee.`
              : `Szene ${scene.orderIndex + 1}: Bildfreigabe endgültig gescheitert — keine Motion-Credits ausgegeben.`,
          });
          continue;
        }

        if (!anchorUrl) {
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
          anchorUrl = anchor.anchor_url;
          anchorScore = Math.round(anchor.score ?? 0);

          await log(admin, productionId, userId, {
            stage: "anchors",
            role: "dp",
            scene_index: scene.orderIndex,
            duration_ms: Date.now() - started,
            message: `Szene ${scene.orderIndex + 1}: Bild freigegeben (Score ${anchorScore}${
              (anchor.attempts ?? 1) > 1 ? `, ${anchor.attempts} Anläufe` : ""
            }).`,
            meta: { anchor_url: anchor.anchor_url },
          });
        }

        await setSceneStatus(admin, productionId, scene.orderIndex, {
          status: "motion",
          anchor_url: anchor.anchor_url,
          anchor_score: anchorScore,
          anchor_attempts: anchor.attempts ?? 1,
          anchor_verdicts: anchor.verdicts ?? [],
        });

        // --- Stage 2: only now do we spend motion credits ----------------
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
          outOfCredits = true;
          counters.failed++;
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
          return;
        }

        const motionPrompt = attempt === 1
          ? scene.motionPrompt
          : repairMotionPrompt(scene.motionPrompt, {
            faceFocus: isFramingFailure(lastError) ||
              (scene.turns?.length ?? 0) > 0 ||
              (scene.dialogue ?? "").trim().length > 1,
          });

        const videoUrl = await animate({
          apiKey: replicateKey,
          imageUrl: anchor.anchor_url,
          prompt: motionPrompt,
          durationSeconds: scene.durationSeconds,
        });

        if (!videoUrl) {
          lastError = "Animation lieferte kein Video.";
          await refundStage(admin, {
            userId,
            productionId,
            stage: "motion",
            sceneIndex: scene.orderIndex,
            euros: motionEuros,
            label: `Bewegtbild Szene ${scene.orderIndex + 1} fehlgeschlagen`,
          });
          await log(admin, productionId, userId, {
            stage: "motion",
            role: "editor",
            severity: attempt < MAX_SCENE_ATTEMPTS ? "warn" : "error",
            scene_index: scene.orderIndex,
            message: attempt < MAX_SCENE_ATTEMPTS
              ? `Szene ${scene.orderIndex + 1}: Animation fehlgeschlagen — zweiter Anlauf mit ruhigerem Framing.`
              : `Szene ${scene.orderIndex + 1}: Animation endgültig fehlgeschlagen.`,
          });
          continue;
        }

        counters.done++;
        await setSceneStatus(admin, productionId, scene.orderIndex, {
          status: "completed",
          video_url: videoUrl,
          engine: MOTION_MODEL,
          fallback_kind: null,
          error_message: null,
        });

        // --- Stage 3: speaking scenes get voice + lip-sync ---------------
        if ((scene.turns?.length ?? 0) > 0 || (scene.dialogue ?? "").trim().length > 1) {
          await withLipsyncLock(() =>
            speakAndSync(admin, {
              productionId,
              userId,
              scene,
              videoUrl,
              anchorUrl: anchor.anchor_url,
            })
          );
        }

        await log(admin, productionId, userId, {
          stage: "motion",
          role: "editor",
          scene_index: scene.orderIndex,
          duration_ms: Date.now() - started,
          message: `Szene ${scene.orderIndex + 1}: Clip fertig (${scene.durationSeconds.toFixed(1)}s${
            attempt > 1 ? ", 2. Anlauf" : ""
          }).`,
          meta: { video_url: videoUrl },
        });
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : "unknown";
        console.error("[autopilot-orchestrate] scene attempt failed", scene.orderIndex, attempt, lastError);
        if (attempt >= MAX_SCENE_ATTEMPTS) break;
      }
    }

    // --- Beide Anläufe verbraucht: Standbild statt Loch --------------------
    if (anchorUrl) {
      counters.stills++;
      counters.done++;
      await setSceneStatus(admin, productionId, scene.orderIndex, {
        status: "completed",
        video_url: null,
        fallback_kind: FALLBACK_STILL,
        error_message: null,
      });
      await log(admin, productionId, userId, {
        stage: "motion",
        role: "editor",
        severity: "warn",
        scene_index: scene.orderIndex,
        message:
          `Szene ${scene.orderIndex + 1}: Bewegtbild nicht zustande gekommen (${lastError}) — als Standbild in den Schnitt genommen, keine Motion-Credits berechnet.`,
      });
      return;
    }

    counters.failed++;
    await setSceneStatus(admin, productionId, scene.orderIndex, {
      status: "failed",
      fallback_kind: null,
      error_message: lastError,
    });
  };

  // --- Worker-Pool: drei Szenen gleichzeitig -----------------------------
  let cursor = 0;
  const worker = async () => {
    while (true) {
      if (outOfCredits) return;
      const index = cursor++;
      if (index >= pending.length) return;
      await produceScene(pending[index]);
      await heartbeat();
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(SCENE_CONCURRENCY, Math.max(1, pending.length)) }, worker),
  );

  const { done, failed, stills } = counters;


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
 * v296 — Composer-Brücke: statt einer zweiten Lip-Sync-Pipeline schiebt der
 * Autopilot die Szene als versteckte `composer_scenes`-Zeile in die bereits
 * gehärtete Motion-Studio-Strecke (`compose-twoshot-audio` →
 * `compose-dialog-segments`). Damit gelten hier automatisch Preclip-Isolation,
 * Codec-Preflight, Face-Gate, Slot-Routing, Retry-Matrix, Circuit-Breaker und
 * der Watchdog. Am Composer-Code wird nichts geändert.
 *
 * Fällt die Brücke aus (kein Guthaben, Gesichts-Check, Fehler), bleibt die
 * Sprachspur erhalten — die Szene ist nie verloren, nur stumm gelippt.
 */
async function speakAndSync(
  admin: ReturnType<typeof createClient>,
  args: {
    productionId: string;
    userId: string;
    productionTitle?: string | null;
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

  const speakerCount = new Set(
    turns.map((t, i) => t.speakerCharacterId ?? `anon:${i}`),
  ).size;
  const language = scene.voiceLanguage ?? "de";

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

  /** Rückfallebene: nur Sprachspur, kein Lip-Sync. Szene bleibt nutzbar. */
  const voiceOnly = async (message: string, severity: "info" | "warn" = "warn") => {
    const built = await buildTurnTracks({
      admin,
      userId,
      productionId,
      sceneIndex: scene.orderIndex,
      turns,
      sceneDurationSec: scene.durationSeconds,
      defaultLanguage: language,
    });
    if (built.ok && built.masterUrl) {
      await setSceneStatus(admin, productionId, scene.orderIndex, {
        voiceover_url: built.masterUrl,
        voiceover_duration_seconds: Math.round(built.totalSec * 100) / 100,
      });
    } else {
      await refundStage(admin, {
        userId,
        productionId,
        stage: "voice",
        sceneIndex: scene.orderIndex,
        euros: voiceEuros,
        label: `Sprachaufnahme Szene ${scene.orderIndex + 1} fehlgeschlagen`,
      });
    }
    await log(admin, productionId, userId, {
      stage: "lipsync",
      role: "sound",
      severity,
      scene_index: scene.orderIndex,
      message,
    });
  };

  // Face-gate on the anchor (the i2v input = the clip's geometry). A missing or
  // tiny face means the Sync-Strecke would burn credits on an unanimatable mouth.
  if (args.anchorUrl) {
    const gate = await checkAnchorFaces({
      anchorUrl: args.anchorUrl,
      expectedSpeakers: speakerCount,
    });
    if (!gate.ok) {
      await voiceOnly(
        `Szene ${scene.orderIndex + 1}: Gesichts-Check nicht bestanden (${gate.reason}) — Lip-Sync übersprungen, Ton bleibt erhalten.`,
      );
      return;
    }
  }

  // Kostenschätzung = exakt die Credits, die der Composer gleich abbucht.
  const estimatedCredits = composerLipsyncCredits(scene.durationSeconds, speakerCount);
  const lipsyncEuros = creditsToEuros(estimatedCredits);
  const syncCharge = await chargeStage(admin, {
    userId,
    productionId,
    stage: "lipsync",
    sceneIndex: scene.orderIndex,
    euros: lipsyncEuros,
    label: `Lip-Sync Szene ${scene.orderIndex + 1}`,
  });
  if (!syncCharge.charged && syncCharge.reason === "insufficient") {
    await voiceOnly(
      `Szene ${scene.orderIndex + 1}: Guthaben reicht nicht für Lip-Sync — Sprachspur bleibt, Clip bleibt stumm gelippt.`,
    );
    return;
  }

  // Brücke: versteckte Composer-Arbeitsmappe + Szenenzeile.
  const projectId = await ensureShadowProject(admin, {
    productionId,
    userId,
    title: args.productionTitle,
    language,
  });
  const sceneId = projectId
    ? await upsertBridgeScene(admin, {
      projectId,
      productionId,
      sceneIndex: scene.orderIndex,
      clipUrl: videoUrl,
      anchorUrl: args.anchorUrl ?? null,
      durationSeconds: scene.durationSeconds,
      turns,
      language,
    })
    : null;

  if (!sceneId) {
    await refundStage(admin, {
      userId,
      productionId,
      stage: "lipsync",
      sceneIndex: scene.orderIndex,
      euros: lipsyncEuros,
      label: `Lip-Sync Szene ${scene.orderIndex + 1} nicht gestartet`,
    });
    await voiceOnly(
      `Szene ${scene.orderIndex + 1}: Lip-Sync-Strecke nicht erreichbar — Sprachspur bleibt erhalten.`,
    );
    return;
  }

  const result = await runComposerLipSync(admin, {
    sceneId,
    userId,
    durationSeconds: scene.durationSeconds,
    speakerCount,
  });

  if (result.masterAudioUrl) {
    await setSceneStatus(admin, productionId, scene.orderIndex, {
      voiceover_url: result.masterAudioUrl,
      voiceover_duration_seconds: Math.round(scene.durationSeconds * 100) / 100,
    });
  }

  if (result.ok && result.outputUrl) {
    await setSceneStatus(admin, productionId, scene.orderIndex, {
      lipsync_url: result.outputUrl,
    });
    await log(admin, productionId, userId, {
      stage: "lipsync",
      role: "sound",
      scene_index: scene.orderIndex,
      message: `Szene ${scene.orderIndex + 1}: Lip-Sync sitzt (${speakerCount} ${
        speakerCount === 1 ? "Sprecher" : "Sprecher"
      }, Motion-Studio-Strecke).`,
      meta: { composer_scene_id: sceneId },
    });
    return;
  }

  // Fehlschlag: Der Composer erstattet seine Credits selbst — dann geben wir
  // auch die Euro-Stufe zurück. Hat er sie verbraucht, bleibt die Buchung.
  if (result.composerRefunded || result.grantedCredits === 0) {
    await refundStage(admin, {
      userId,
      productionId,
      stage: "lipsync",
      sceneIndex: scene.orderIndex,
      euros: lipsyncEuros,
      label: `Lip-Sync Szene ${scene.orderIndex + 1} fehlgeschlagen`,
    });
  }

  if (!result.masterAudioUrl) {
    await voiceOnly(
      `Szene ${scene.orderIndex + 1}: Lip-Sync fehlgeschlagen (${result.reason ?? "unbekannt"}).`,
    );
    return;
  }

  await log(admin, productionId, userId, {
    stage: "lipsync",
    role: "sound",
    severity: "warn",
    scene_index: scene.orderIndex,
    message: `Szene ${scene.orderIndex + 1}: Lip-Sync fehlgeschlagen (${
      result.reason ?? "unbekannt"
    }) — Sprachspur bleibt, ${result.composerRefunded ? "Credits erstattet" : "Verbrauch verbucht"}.`,
    meta: { composer_scene_id: sceneId, clip_error: result.clipError ?? null },
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
