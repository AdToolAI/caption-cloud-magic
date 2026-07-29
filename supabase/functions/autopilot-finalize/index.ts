// autopilot-finalize
//
// Turns the pile of approved scene clips into one film:
//
//   scenes → voiceover + music bed → Universal-Creator payload → Lambda render
//
// Runs in the background and reports through `autopilot_productions`
// (stage: audio → finalizing → completed) plus `autopilot_director_log`.
//
// Billing: voice + music are charged here against `ai_video_wallets` via the
// shared autopilot helper (idempotent, refunded on failure). The Lambda render
// bills and refunds itself inside `render-with-remotion`.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";
import { AUTOPILOT_PRICE, chargeStage, refundStage } from "../_shared/autopilotCredits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { fn: "autopilot-finalize", ok: true });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const productionId = body?.production_id as string | undefined;
    if (!productionId) return json({ error: "production_id is required" }, 400);

    // Service-role calls (from the orchestrator) pass the user explicitly.
    let userId: string | null = null;
    if (token === SERVICE_KEY && body?.user_id) {
      userId = String(body.user_id);
    } else {
      const { data } = await admin.auth.getUser(token);
      userId = data?.user?.id ?? null;
    }
    if (!userId) return json({ error: "unauthorized" }, 401);

    const { data: production } = await admin
      .from("autopilot_productions")
      .select("*")
      .eq("id", productionId)
      .maybeSingle();

    if (!production || production.user_id !== userId) return json({ error: "not_found" }, 404);
    if (production.stage === "finalizing") return json({ ok: true, already_running: true });

    const task = finalize(admin, production, userId);
    // @ts-ignore EdgeRuntime is provided by the Supabase runtime
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(task);
    else await task;

    return json({ ok: true, production_id: productionId });
  } catch (err) {
    console.error("[autopilot-finalize] fatal", err);
    return json({ error: err instanceof Error ? err.message : "unknown" }, 500);
  }
});

// deno-lint-ignore no-explicit-any
type Admin = any;

async function finalize(admin: Admin, production: any, userId: string) {
  const productionId = production.id as string;
  const language = production.language || "de";

  try {
    const { data: sceneRows } = await admin
      .from("autopilot_production_scenes")
      .select("*")
      .eq("production_id", productionId)
      .order("scene_index", { ascending: true });

    const usable = (sceneRows ?? []).filter(
      (s: any) => s.status === "completed" && (s.lipsync_url || s.video_url),
    );

    if (usable.length === 0) {
      await fail(admin, productionId, userId, "Keine fertige Szene für den Endschnitt vorhanden.");
      return;
    }

    // ---------------------------------------------------------------- audio
    await admin
      .from("autopilot_productions")
      .update({ stage: "audio", status: "running", progress: 80, error_message: null })
      .eq("id", productionId);

    const totalSeconds = usable.reduce(
      (acc: number, s: any) => acc + Math.max(0.1, Number(s.duration_seconds) || 0),
      0,
    );

    const treatment = production.treatment ?? {};
    const wantsVoiceover = treatment?.voiceoverEnabled !== false && !!buildNarration(usable);
    let voiceoverUrl: string | null = production.voiceover_url ?? null;
    let voiceoverDuration = 0;

    if (wantsVoiceover && !voiceoverUrl) {
      const voiceEuros = totalSeconds * AUTOPILOT_PRICE.voicePerSecond;
      const charge = await chargeStage(admin, {
        userId,
        productionId,
        stage: "voice",
        euros: voiceEuros,
        label: "Voiceover",
      });

      if (charge.charged || charge.reason === "already_charged") {
        try {
          const narration = buildNarration(usable);
          const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-video-voiceover`, {
            method: "POST",
            headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              scriptText: narration,
              voice: treatment?.voiceId || production.treatment?.voice_id || undefined,
              language,
              withTimestamps: false,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            voiceoverUrl = data.audioUrl ?? null;
            voiceoverDuration = Number(data.durationSeconds ?? data.duration ?? 0) || 0;
          } else {
            console.warn("[autopilot-finalize] voiceover failed", res.status, await res.text());
          }
        } catch (err) {
          console.warn("[autopilot-finalize] voiceover error", err);
        }

        if (!voiceoverUrl) {
          await refundStage(admin, {
            userId,
            productionId,
            stage: "voice",
            euros: voiceEuros,
            label: "Voiceover fehlgeschlagen",
          });
          await log(admin, productionId, userId, {
            stage: "audio",
            role: "sound",
            severity: "warn",
            message: "Voiceover konnte nicht erzeugt werden — Credits erstattet, Film läuft ohne Sprecher.",
          });
        } else {
          await log(admin, productionId, userId, {
            stage: "audio",
            role: "sound",
            message: "Voiceover aufgenommen.",
          });
        }
      } else {
        await log(admin, productionId, userId, {
          stage: "audio",
          role: "sound",
          severity: "warn",
          message: "Guthaben reicht nicht für das Voiceover — Film wird ohne Sprecher geschnitten.",
        });
      }
    }

    // Music bed — mood comes from the treatment, tracks from the stock search.
    let musicUrl: string | null = production.music_url ?? null;
    const wantsMusic = treatment?.musicEnabled !== false;

    if (wantsMusic && !musicUrl) {
      const charge = await chargeStage(admin, {
        userId,
        productionId,
        stage: "music",
        euros: AUTOPILOT_PRICE.music,
        label: "Musikbett",
      });

      if (charge.charged || charge.reason === "already_charged") {
        musicUrl = await pickMusic(admin, treatment?.mood || production.genre || "cinematic");
        if (!musicUrl) {
          await refundStage(admin, {
            userId,
            productionId,
            stage: "music",
            euros: AUTOPILOT_PRICE.music,
            label: "Kein Musikbett gefunden",
          });
          await log(admin, productionId, userId, {
            stage: "audio",
            role: "sound",
            severity: "warn",
            message: "Kein passendes Musikbett gefunden — Credits erstattet.",
          });
        } else {
          await log(admin, productionId, userId, {
            stage: "audio",
            role: "sound",
            message: "Musikbett gelegt.",
          });
        }
      }
    }

    const audioMix = {
      musicVolume: voiceoverUrl ? 0.25 : 0.4,
      voiceoverVolume: 0.95,
    };

    await admin
      .from("autopilot_productions")
      .update({
        voiceover_url: voiceoverUrl,
        music_url: musicUrl,
        audio_mix: audioMix,
        stage: "finalizing",
        progress: 88,
      })
      .eq("id", productionId);

    // ------------------------------------------------------------- overlays
    const { data: assets } = await admin
      .from("autopilot_assets")
      .select("role, public_url, analysis")
      .eq("user_id", userId)
      .eq("production_id", productionId);

    const logoUrl =
      (assets ?? []).find((a: any) => a.role === "logo" && a.public_url)?.public_url ?? null;

    // -------------------------------------------------------------- payload
    const scenes = usable.map((s: any, index: number) => {
      const clip = s.lipsync_url || s.video_url;
      const duration = Math.max(0.5, Math.min(60, Number(s.duration_seconds) || 6));
      return {
        id: `autopilot-${s.scene_index}`,
        order: index,
        type: index === 0 ? "hook" : index === usable.length - 1 ? "cta" : "content",
        title: s.beat || `Szene ${index + 1}`,
        duration,
        spokenText: s.dialogue?.text || "",
        visualDescription: "",
        background: { type: "video", videoUrl: clip },
        animatedVideoUrl: clip,
        useAnimation: true,
        animation: "none",
        kenBurnsDirection: "in",
        transition: { type: index === 0 ? "none" : "fade", duration: 0.4 },
        textOverlay: { enabled: false, position: "center", fontSize: 64, fontColor: "#FFFFFF", animation: "none" },
        soundEffectType: "none",
        // Lip-synced clips carry their own dialogue audio; silent clips stay muted.
        originalAudio: { muted: !s.lipsync_url, enabled: !!s.lipsync_url, volume: s.lipsync_url ? 1 : 0 },
        ...(logoUrl && index === usable.length - 1
          ? { logoOverlay: { url: logoUrl, position: "bottom-right", scale: 0.18 } }
          : {}),
      };
    });

    const durationSeconds = scenes.reduce((acc, s) => acc + s.duration, 0);
    const voDuration = voiceoverDuration > 0 ? Math.min(voiceoverDuration, durationSeconds) : durationSeconds;

    const customizations: Record<string, unknown> = {
      scenes,
      durationSeconds,
      // Raw-Media-Invariant: the autopilot assembles clean media, cinematic
      // post-processing stays exclusive to the Director's Cut.
      rawMediaMode: true,
      useOriginalAudio: usable.some((s: any) => !!s.lipsync_url),
      originalAudioVolume: 1,
      subtitles: [],
      source: "autopilot",
      ...(voiceoverUrl
        ? {
            voiceoverUrl,
            voiceoverDuration: voDuration,
            voiceoverVolume: audioMix.voiceoverVolume,
            voiceoverStartTime: 0,
          }
        : {}),
      ...(musicUrl
        ? { backgroundMusicUrl: musicUrl, backgroundMusicVolume: audioMix.musicVolume }
        : {}),
    };

    const renderRes = await fetch(`${SUPABASE_URL}/functions/v1/render-with-remotion`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        component_name: "UniversalCreatorVideo",
        customizations,
        format: "mp4",
        aspect_ratio: production.aspect_ratio || "9:16",
        quality: "hd",
      }),
    });

    const renderJson = await renderRes.json().catch(() => ({}));
    if (!renderRes.ok) {
      await fail(
        admin,
        productionId,
        userId,
        renderJson?.error === "Insufficient credits"
          ? "Guthaben reicht für den Endschnitt nicht aus."
          : `Endschnitt konnte nicht gestartet werden: ${renderJson?.error ?? renderRes.status}`,
      );
      return;
    }

    const renderId = renderJson.render_id || renderJson.renderId || renderJson.pending_render_id;
    await admin
      .from("autopilot_productions")
      .update({ render_id: renderId ?? null, progress: 92 })
      .eq("id", productionId);

    await log(admin, productionId, userId, {
      stage: "finalizing",
      role: "editor",
      message: `Endschnitt gestartet — ${scenes.length} Szenen, ${Math.round(durationSeconds)}s.`,
      meta: { render_id: renderId },
    });

    // ----------------------------------------------------------- poll render
    const finalUrl = renderId ? await waitForRender(admin, renderId) : null;

    if (!finalUrl) {
      await fail(admin, productionId, userId, "Endschnitt wurde nicht rechtzeitig fertig. Die Szenen bleiben erhalten.");
      return;
    }

    await admin
      .from("autopilot_productions")
      .update({
        final_video_url: finalUrl,
        stage: "completed",
        status: "completed",
        progress: 100,
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", productionId);

    // Videos live in `video_creations` — platform persistence rule.
    await admin.from("video_creations").insert({
      user_id: userId,
      render_id: renderId ?? null,
      output_url: finalUrl,
      status: "completed",
      format: "mp4",
      quality: "hd",
      aspect_ratio: production.aspect_ratio || "9:16",
      customizations: { source: "autopilot", production_id: productionId },
      metadata: {
        source: "autopilot",
        production_id: productionId,
        title: (production.brief ?? "Autopilot-Spot").slice(0, 120),
        duration_seconds: Math.round(durationSeconds),
      },
    }).then(
      () => undefined,
      (err: unknown) => console.warn("[autopilot-finalize] library insert failed", err),
    );

    await log(admin, productionId, userId, {
      stage: "completed",
      role: "director",
      message: "Film fertig — liegt in der Mediathek.",
      meta: { final_video_url: finalUrl },
    });
  } catch (err) {
    console.error("[autopilot-finalize] error", err);
    await fail(admin, productionId, userId, err instanceof Error ? err.message : "unknown");
  }
}

function buildNarration(scenes: any[]): string {
  return scenes
    .map((s) => (s.dialogue?.text as string | undefined)?.trim())
    .filter((t): t is string => !!t)
    .join(" ")
    .trim();
}

async function pickMusic(admin: Admin, mood: string): Promise<string | null> {
  try {
    const { data } = await admin.functions.invoke("search-stock-music", {
      body: { query: mood, mood, genre: "instrumental" },
    });
    const results = data?.results ?? [];
    const best = results.find((r: any) => (r.duration ?? 0) >= 20 && (r.duration ?? 0) <= 180) ?? results[0];
    return best?.url ?? best?.preview_url ?? null;
  } catch (err) {
    console.warn("[autopilot-finalize] music lookup failed", err);
    return null;
  }
}

/** Poll `video_renders` for up to ~14 minutes. */
async function waitForRender(admin: Admin, renderId: string): Promise<string | null> {
  const deadline = Date.now() + 14 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 8000));
    const { data } = await admin
      .from("video_renders")
      .select("status, video_url, error_message")
      .eq("render_id", renderId)
      .maybeSingle();
    if (!data) continue;
    if (data.status === "completed" && data.video_url) return data.video_url;
    if (data.status === "failed") return null;
  }
  return null;
}

async function fail(admin: Admin, productionId: string, userId: string, message: string) {
  await admin
    .from("autopilot_productions")
    .update({ stage: "failed", status: "failed", error_message: message, progress: 100 })
    .eq("id", productionId);
  await log(admin, productionId, userId, {
    stage: "failed",
    role: "director",
    severity: "error",
    message,
  });
}

async function log(admin: Admin, productionId: string, userId: string, entry: Record<string, unknown>) {
  try {
    await admin.from("autopilot_director_log").insert({
      production_id: productionId,
      user_id: userId,
      ...entry,
    });
  } catch (err) {
    console.warn("[autopilot-finalize] log failed", err);
  }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
