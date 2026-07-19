// compose-video-clips v2.4.0 — v81 shared CLIP_COSTS + dialog-speakers
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";
import { CLIP_COSTS, type ClipQuality } from "../_shared/clip-costs.ts";
import {
  countDialogSpeakers,
  stripSpeakerPrefixes,
} from "../_shared/dialog-speakers.ts";

/** Snap an arbitrary duration (seconds) to the nearest provider-allowed discrete value. */
function snapDuration(seconds: number, allowed: number[]): number {
  return allowed.reduce(
    (best, val) =>
      Math.abs(val - seconds) < Math.abs(best - seconds) ? val : best,
    allowed[0],
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Extract retry_after seconds from a Replicate 429 error body, default 8s. */
function parseRetryAfter(msg: string): number {
  const m = msg.match(/"retry_after"\s*:\s*(\d+)/);
  if (m) return Math.max(parseInt(m[1], 10), 1);
  const m2 = msg.match(/retry_after"?\s*:\s*(\d+)/);
  return m2 ? Math.max(parseInt(m2[1], 10), 1) : 8;
}
import { createClient } from "npm:@supabase/supabase-js@2";
import Replicate from "npm:replicate@0.25.2";
import { getVisualStyleHint } from "../_shared/composer-visual-styles.ts";
import {
  countFacesInImage,
  countHumansInImage,
} from "../_shared/face-count.ts";
import { auditAnchorIdentity } from "../_shared/identity-audit.ts";

import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
import { sanitizeForHappyHorse } from "../_shared/happyhorse-green-net.ts";
import {
  ensureDialogTurnsForScene,
  fetchDialogTurnsForScenes,
  readIdOnlyEnabled,
  effectiveShotsFromTurns,
  orderedSpeakerIdsFromTurns,
  type DialogTurn,
} from "../_shared/scene-dialog-turns.ts";
import {
  ensureSceneAssetsForScene,
  readSceneAssetsRequired,
  summarizeSceneAssets,
  type AssetRef,
} from "../_shared/asset-ref.ts";
const ANCHOR_AUDIT_VERSION = 13;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

// v81: CLIP_COSTS and ClipQuality are now imported from _shared/clip-costs.ts
// (single source of truth, shared with compose-clip-webhook refund path).
type Quality = ClipQuality;


interface ComposerCharacter {
  id: string;
  name: string;
  appearance: string;
  signatureItems: string;
  /** Optional pre-built identity-card prompt from the Brand Character library. */
  identityCardPrompt?: string;
  /** Optional anchor portrait — surfaced for logging; the i2v wiring stays on `scene.referenceImageUrl`. */
  referenceImageUrl?: string;
  brandCharacterId?: string;
}

type DialogVoiceCfg = {
  engine?: string;
  voiceId?: string;
  voiceName?: string;
  provider?: string;
};

/** ── HeyGen routing helpers (mirrors src/lib/video-composer/sceneEngineRouter.ts) ── */
function sceneHasDialogText(script?: string | null): boolean {
  return !!(script && script.trim().length > 0);
}
// v81: countDialogSpeakers + stripSpeakerPrefixes moved to _shared/dialog-speakers.ts
function resolveDialogVoiceId(
  cfg?: string | DialogVoiceCfg,
): string | undefined {
  if (!cfg) return undefined;
  if (typeof cfg === "string") return cfg;
  return cfg.voiceId;
}

type CharacterShotType =
  | "full"
  | "profile"
  | "back"
  | "detail"
  | "pov"
  | "silhouette"
  | "absent";

interface ClipScene {
  id: string;
  clipSource: string;
  clipQuality?: Quality;
  aiPrompt?: string;
  /** Negative phrases extracted client-side by composePromptLayers (Phase 3).
   *  Merged into the provider's `negative_prompt` API parameter. */
  negativePrompt?: string;
  stockKeywords?: string;
  uploadUrl?: string;
  /** Optional image used as visual guide for AI sources (image-to-video). */
  referenceImageUrl?: string;
  /** Optional anchor image for the END of the clip (Kling/Luma backward extend / bridge). */
  endReferenceImageUrl?: string;
  durationSeconds: number;
  characterShot?: { characterId: string; shotType: CharacterShotType; actionEn?: string; actionUser?: string };
  characterShots?: Array<{ characterId: string; shotType: CharacterShotType; actionEn?: string; actionUser?: string }>;
  /** Optional scene-wide action beat (Auto-Director / Briefing). */
  actionBeat?: {
    characterAction?: string;
    environmentMotion?: string;
    motionIntensity?: 'static' | 'subtle' | 'moderate' | 'high';
  };
  /** English mirror of the scene action, when available. */
  sceneActionEn?: string;
  sceneActionUser?: string;
  /** Per-scene dialog screenplay ("NAME: text" per line). Triggers HeyGen routing. */
  dialogScript?: string;
  /** Map of characterId → voice (string voiceId or { voiceId }). */
  dialogVoices?: Record<string, string | DialogVoiceCfg>;
  /** Render-engine override. 'heygen' is a legacy value that is silently normalised to 'cinematic-sync'. */
  engineOverride?:
    | "auto"
    | "heygen"
    | "broll"
    | "sync-polish"
    | "cinematic-sync"
    | "sync-segments"
    | "native-dialogue";
  /** When false → request muted output (Veo/Kling generate_audio=false; Sora muted at stitch). Default true. */
  withAudio?: boolean;
  /** Client-side Composer dialog/lip-sync switches. Used to prevent auto-HeyGen routing. */
  lipSyncWithVoiceover?: boolean;
  dialogMode?: boolean;
}

interface ClipRequest {
  projectId: string;
  scenes: ClipScene[];
  /** Optional visual style override (Comic, Realistic, Anime, ...). When set,
   *  every AI scene prompt is suffixed with the matching style clause. */
  visualStyle?: string;
  /** Optional recurring characters from the briefing — used to inject
   *  appearance / signatureItems into prompts based on each scene's shotType. */
  characters?: ComposerCharacter[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "video" });
  }

  // Stage marker for diagnostics — updated as we progress so a fatal
  // error in any branch surfaces the exact phase that failed.
  let __stage = "init";
  // Cached body so the FATAL catch (below) can mark scenes as `failed` even
  // when the crash happens before processScenes() runs.
  let __parsedBody: ClipRequest | null = null;

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    __stage = "parse_body";
    const body: ClipRequest = await req.json();
    __parsedBody = body;
    const { projectId, scenes, visualStyle, characters } = body;

    if (!projectId) {
      return new Response(
        JSON.stringify({
          error: "MISSING_PROJECT_ID",
          message:
            "projectId is required — project must be saved before clips can be generated",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!scenes?.length) {
      return new Response(
        JSON.stringify({
          error: "MISSING_SCENES",
          message: "At least one scene is required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verify project ownership
    __stage = "verify_project";
    const { data: project, error: projError } = await supabaseAdmin
      .from("composer_projects")
      .select("id, user_id, status")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projError || !project) {
      return new Response(
        JSON.stringify({
          error: "PROJECT_NOT_FOUND",
          message: "Project not found or you don't have access to it",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── v202: Cast & World ID-Registry — JIT scene_assets backfill ────────
    // Ensure every scene in this request carries a canonical AssetRef list.
    // Best-effort: legacy scenes get backfilled from character_shots /
    // mentioned_location_ids / applied_style_preset_id. Feature flag
    // `composer.feature.scene_assets_required` (default false) can later
    // turn this into a hard-fail gate.
    __stage = "v202_scene_assets_ensure";
    try {
      const sceneAssetsRequired = await readSceneAssetsRequired();
      const registryReport: Array<{
        sceneId: string;
        source: string;
        total: number;
        byType: Record<string, number>;
        characterIds: string[];
      }> = [];
      let mismatchCount = 0;
      for (const s of scenes) {
        if (!s?.id) continue;
        const ensured = await ensureSceneAssetsForScene(s.id);
        const summary = summarizeSceneAssets(ensured.refs);
        registryReport.push({
          sceneId: s.id,
          source: ensured.source,
          total: summary.total,
          byType: summary.byType,
          characterIds: summary.characterIds,
        });
        // Cross-check: every characterId used in dialog_turns must exist as
        // an AssetRef(character). Otherwise flag mismatch.
        const shotIds: string[] = Array.isArray((s as any).characterShots)
          ? ((s as any).characterShots as any[])
              .map((cs) => cs?.characterId)
              .filter((x): x is string => typeof x === "string")
          : [];
        const registryCharIds = new Set(summary.characterIds);
        const missing = shotIds.filter((id) => !registryCharIds.has(id));
        if (missing.length > 0) mismatchCount += missing.length;
      }
      console.log("[compose-video-clips] v202_asset_registry_bound", {
        projectId,
        sceneCount: scenes.length,
        mismatchCount,
        required: sceneAssetsRequired,
        report: registryReport,
      });
      if (sceneAssetsRequired && mismatchCount > 0) {
        return new Response(
          JSON.stringify({
            error: "v202_asset_registry_mismatch",
            message:
              "Scene(s) reference character IDs that are not present in scene_assets. Populate Cast & World first.",
            mismatchCount,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    } catch (e) {
      // Never block dispatch on registry infra errors while flag is off.
      console.warn(
        "[compose-video-clips] v202 scene_assets ensure failed (non-fatal):",
        e,
      );
    }

    // Calculate total cost for AI scenes (quality-tier aware)
    __stage = "cost_calc";
    const aiScenes = scenes.filter((s) => s.clipSource.startsWith("ai-"));
    let totalCost = 0;
    for (const scene of aiScenes) {
      const quality: Quality = scene.clipQuality === "pro" ? "pro" : "standard";
      const costPerSec = CLIP_COSTS[scene.clipSource]?.[quality] ?? 0.15;
      totalCost += scene.durationSeconds * costPerSec;
    }

    // Check wallet if AI scenes exist
    if (aiScenes.length > 0) {
      const { data: wallet } = await supabaseAdmin
        .from("ai_video_wallets")
        .select("balance_euros, currency")
        .eq("user_id", user.id)
        .single();

      if (!wallet) {
        return new Response(
          JSON.stringify({
            error: "No AI Video wallet found",
            code: "NO_WALLET",
            needsPurchase: true,
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (wallet.balance_euros < totalCost) {
        return new Response(
          JSON.stringify({
            error: `Insufficient credits. Need €${totalCost.toFixed(2)}, have €${wallet.balance_euros.toFixed(2)}`,
            code: "INSUFFICIENT_CREDITS",
            needsPurchase: true,
            required: totalCost,
            available: wallet.balance_euros,
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Update project status
    await supabaseAdmin
      .from("composer_projects")
      .update({ status: "generating", updated_at: new Date().toISOString() })
      .eq("id", projectId);

    // ── EARLY Pre-Mark (moved up from L806 on 2026-05-31) ─────────────────
    // If any of the ~500 lines between project-status-update and the
    // original pre-mark throws (Replicate init, cost calc, anchor compose,
    // etc.), scenes used to stay on `clip_status='pending'` FOREVER and the
    // UI would show 95 % with "Slots 0/3" indefinitely. By pre-marking
    // immediately we guarantee the UI sees `generating` even if the
    // background dispatch later crashes — and the heartbeat watchdog can
    // then auto-fail stale `generating` rows after 15 min.
    try {
      const earlyAiSceneIds = (scenes as Array<{ id: string; clipSource?: string }>)
        .filter((s) => s.clipSource?.startsWith("ai-"))
        .map((s) => s.id);
      if (earlyAiSceneIds.length > 0) {
        await supabaseAdmin
          .from("composer_scenes")
          .update({
            clip_status: "generating",
            clip_error: null,
            updated_at: new Date().toISOString(),
          })
          .in("id", earlyAiSceneIds);
      }
    } catch (preMarkErr) {
      console.warn(
        "[compose-video-clips] EARLY pre-mark failed (non-fatal):",
        preMarkErr,
      );
    }


    const replicate = new Replicate({
      auth: Deno.env.get("REPLICATE_API_KEY"),
    });
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const webhookUrl = appendWebhookToken(
      `${supabaseUrl}/functions/v1/compose-clip-webhook`,
    );

    // IMPORTANT: We do NOT append negative words to the positive prompt.
    // Diffusion video models (Hailuo, Kling) treat words like "text", "captions",
    // "logos" as concepts to render, even when prefixed with "no". Instead we use
    // the dedicated `negative_prompt` API parameter (see hailuoInput / klingInput).
    // The positive prompt only carries a short positive cue.
    const NEGATIVE_PROMPT_PARAM =
      "text, captions, subtitles, watermark, logo, typography, written words, letters, signs with readable text, UI overlay, lower thirds, isolated product, plain white background, floating product, rotating product, blurry, low quality";
    // Extra negatives applied ONLY when a reference image is supplied (i2v).
    // i2v models tend to hold the reference image static for the first 3-12 frames
    // before motion kicks in. These tokens push the model to start motion at frame 1.
    const NEGATIVE_PROMPT_I2V_EXTRA =
      ", static first frame, frozen opening, still image hold at start, motionless beginning, freeze frame intro";
    const CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE =
      // v112 — REMOVED the broad anti-mouth-motion tokens
      // ("talking mouth, lip movement, speaking animation, open mouth speech,
      //  mouthing words, mouth flapping") that previously lived here. They
      // directly contradicted the official Sync.so AI-video guidance
      // (sync.so/docs/compatibility-and-tips/media-content-tips:
      //  "the character should be speaking naturally [...] random mouth
      //   movements are necessary to get the best results from our lipsync
      //   model"). With those tokens active, AI plates were rendered with a
      //  statically closed mouth and sync-3 returned the input unchanged
      //  ("COMPLETED" but mouths don't move). We retain ONLY the
      //  *exaggerated*-talking guard so plates don't drift into clearly-
      //  worded speech that fights the audio.
      ", exaggerated facial talking, dialogue performance, singing, yelling, words clearly visible on lips" +
      // v171 (Jun 22 2026) — Ghost-Speaker Guard. With all 4 passes finally
      // running in parallel, non-active speakers were visibly mouthing along
      // because the plate prompt asked for "subtle idle mouth and jaw motion"
      // on every face. We keep the *lip-ready geometry* on the active speaker
      // (Sync.so still needs an animatable mouth region — do NOT re-add the
      // v112-killer tokens "talking mouth / lip movement / open mouth speech")
      // but explicitly forbid idle mouth/jaw motion + listener mouth movement
      // so the plate itself shows only the speaker-driven mouths in post.
      ", idle mouth motion, idle jaw motion, mouths softly moving, mouth twitching, jaw twitching, multiple mouths flapping, group chatter, background mouth motion, listeners moving their lips, listeners' mouths moving, secondary characters speaking, non-speaker mouth movement, everyone talking at once, all characters speaking simultaneously" +
      // v230 (Jul 11 2026) — Speech-shape guard. v171 already forbids idle
      // mouth motion, but Hailuo/Kling still emit sub-speech lip vibration
      // ("mouthing along") on non-speakers. We ban the *speech-shaped*
      // patterns explicitly, while leaving breathing / blink / micro-life
      // untouched so the scene doesn't freeze.
      ", rhythmic lip motion, syllable-shaped mouth, whispering lips, lip-flap, chewing pattern, mouth mouthing words, non-speaker mouthing along, sub-vocal lip movement, mumbling lips" +
      // v172 (Jun 22 2026) — Closed-Eyes + Dauer-Nicken Guard. The v171 idle-
      // body clause ("small head bobs", "occasional blinks") was being
      // over-interpreted by Hailuo/Kling as continuous nodding and frequently
      // held-shut eyes. Hard-block both failure modes.
      ", closed eyes, eyes closed, squinting, sleepy eyes, drowsy expression, prolonged blink, eyes held shut, head nodding, nodding head, continuous nodding, rhythmic head bobbing, head bobbing up and down, agreeing nod loop, everyone nodding" +
      // v57 — Plate-stability guard. Hailuo/Kling/Wan i2v tend to invent a
      // mid-clip camera cut or push-in when given a 3-shot start-frame plus
      // a long dialog-style prompt. The downstream Sync.so dispatch then
      // sees a different subject than the anchor coords describe and either
      // maps the wrong speaker's audio onto the wrong face (auto-ASD) or
      // returns an opaque "unknown error" (manual ASD). Hard-block every
      // form of in-clip framing change for cinematic-sync master plates.
      // FROZEN — see mem/architecture/lipsync/FROZEN-INVARIANTS.md (I.4):
      // every framing-change keyword below MUST stay.
      ", camera cut, scene change, shot change, new shot, different angle, edit cut, hard cut, jump cut, zoom in, zoom out, push in, pull out, dolly, dolly in, dolly out, crane, pan, tilt, whip pan, close-up insert, reframe, second camera, multi-camera, picture-in-picture" +
      // v9 (Jun 19 2026) — Anti-Split-Screen guard. Hailuo/Nano-Banana-2 were
      // interpreting the prior n>=3 positive prompt ("equal screen share /
      // clear gaps / no overlap") as a literal quad-split layout. These
      // tokens hard-block any panel/grid/collage composition so the model
      // produces ONE shared physical room instead.
      ", split screen, split-screen composition, split-frame, multi-panel layout, panel grid, photo grid, brady bunch grid, photo collage, composite of separate portraits, isolated character cutouts, vertical divider lines, visible seams between people, four-up grid, two-up grid, side-by-side panels, each person in their own frame, individual portrait panels";
    const POSITIVE_CLEAN_CUE =
      ", clean cinematic composition, natural environment";
    // Positive cue appended ONLY for i2v requests — biases the model toward
    // immediate camera movement so the reference image doesn't appear as a still.
    const POSITIVE_I2V_MOTION_CUE =
      ", motion already in progress from frame one, immediate camera movement, no static opening frame";
    const STYLE_HINT = getVisualStyleHint(visualStyle);

    const failedClipUpdate = (
      isCinematicSyncScene: boolean,
      clipError?: string,
    ): Record<string, unknown> => ({
      clip_status: "failed",
      ...(clipError ? { clip_error: clipError.slice(0, 500) } : {}),
      ...(isCinematicSyncScene
        ? {
            lip_sync_status: null,
            twoshot_stage: null,
            lip_sync_source_clip_url: null,
            dialog_shots: null,
          }
        : {}),
      updated_at: new Date().toISOString(),
    });

    // Build a quick character lookup for the safety-net injection
    const charById = new Map<string, ComposerCharacter>();
    (characters || []).forEach((c) => {
      if (c?.id) charById.set(c.id, c);
    });

    // STAGE 4 (May 30 2026): hydrate missing characters from brand_characters
    // table when scenes reference IDs/slugs (e.g. `samuel-dusatko`) that the
    // client didn't include in the `characters` payload. Without this, the
    // anchor-composition step gets `portraitUrls.length === 0` and silently
    // skips composing — Cinematic-Sync then renders a raw avatar instead of
    // the scripted scene.
    try {
      const referencedIds = new Set<string>();
      for (const s of scenes) {
        const shots = [
          ...(s.characterShots ?? []),
          ...(s.characterShot ? [s.characterShot] : []),
        ];
        for (const sh of shots) {
          const id = (sh as any)?.characterId;
          if (typeof id === "string" && id.length > 0 && !charById.has(id)) {
            referencedIds.add(id);
          }
        }
      }
      if (referencedIds.size > 0) {
        const idList = Array.from(referencedIds);
        // Try direct ID match first (UUIDs); then fall back to slugified name.
        const { data: byId } = await supabaseAdmin
          .from("brand_characters")
          .select("id, name, reference_image_url, default_voice_id")
          .in("id", idList);
        for (const row of byId ?? []) {
          if (row?.id) {
            charById.set(String((row as any).id), {
              id: String((row as any).id),
              name: String((row as any).name ?? ""),
              referenceImageUrl: (row as any).reference_image_url ?? undefined,
            } as ComposerCharacter);
          }
        }
        const stillMissing = idList.filter((id) => !charById.has(id));
        if (stillMissing.length > 0) {
          const { data: bySlug } = await supabaseAdmin
            .from("brand_characters")
            .select("id, name, reference_image_url");
          for (const row of bySlug ?? []) {
            const slug = String((row as any).name ?? "")
              .toLowerCase()
              .trim()
              .replace(/\s+/g, "-");
            const match = stillMissing.find(
              (id) => id.toLowerCase() === slug || id.toLowerCase() === slug.split("-")[0],
            );
            if (match && !charById.has(match)) {
              charById.set(match, {
                id: match,
                name: String((row as any).name ?? ""),
                referenceImageUrl: (row as any).reference_image_url ?? undefined,
              } as ComposerCharacter);
            }
          }
        }
        console.log(
          `[compose-video-clips] hydrated ${charById.size - (characters?.length ?? 0)} extra character(s) from brand_characters for slug/UUID refs`,
        );
      }
    } catch (hydrationErr) {
      console.warn(
        "[compose-video-clips] brand_characters hydration failed:",
        hydrationErr,
      );
    }

    // ID-Only Cast Resolution ------------------------------------------------
    // Fetch canonical dialog_turns for every scene up-front. When present,
    // the two speaker-resolution sites below skip name-based fuzzy matching
    // entirely and derive the visual cast from turn.characterId directly.
    // Legacy scenes with dialog + Cast IDs are now just-in-time backfilled;
    // unresolved ID scenes fail before provider dispatch instead of falling
    // back to name matching. Feature-flag gated via
    // `composer.feature.id_only_cast_resolution`.
    const idOnlyEnabled = await readIdOnlyEnabled(supabaseAdmin);
    const dialogTurnsByScene: Map<string, DialogTurn[]> = idOnlyEnabled
      ? await fetchDialogTurnsForScenes(
          supabaseAdmin,
          scenes.map((s) => s.id).filter(Boolean),
        )
      : new Map();
    const hasDialogLinesForIdOnly = (scene: ClipScene) =>
      String(scene.dialogScript ?? "")
        .split(/\r?\n/)
        .some((line) => /^\s*\[?[\p{L}][\p{L}\p{N}\s.'-]{0,60}?\]?\s*(?:[\u2014\u2013-]\s*[\p{L}\s]{1,32})?\s*(?:\[[^\]]{1,32}\])?\s*[:：]/u.test(line));
    const hasUuidCastForIdOnly = (scene: ClipScene) => {
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const shots = [...(scene.characterShots ?? []), ...(scene.characterShot ? [scene.characterShot] : [])];
      return shots.some((shot) => uuidRe.test(String((shot as any)?.characterId ?? "")));
    };
    if (idOnlyEnabled) {
      for (const scene of scenes) {
        if (!scene.id || dialogTurnsByScene.has(scene.id) || !hasDialogLinesForIdOnly(scene)) continue;
        const result = await ensureDialogTurnsForScene(supabaseAdmin, {
          id: scene.id,
          dialog_script: scene.dialogScript,
          character_shots: scene.characterShots ?? (scene.characterShot ? [scene.characterShot] : []),
        });
        if (result.ok) {
          dialogTurnsByScene.set(scene.id, result.turns);
          console.log(
            `[compose-video-clips] v201_dialog_turns_jit_backfill scene=${scene.id} source=${result.source} turns=${result.turns.length}`,
          );
        } else if (hasUuidCastForIdOnly(scene)) {
          console.error(
            `[compose-video-clips] v201_id_only_required_block scene=${scene.id} reason=${result.reason} details=${JSON.stringify(result.details ?? {})}`,
          );
          await supabaseAdmin
            .from("composer_scenes")
            .update(failedClipUpdate(true, `id_only_dialog_turns_required:${result.reason}`))
            .eq("id", scene.id);
          return new Response(
            JSON.stringify({
              error: "id_only_dialog_turns_required",
              scene_id: scene.id,
              reason: result.reason,
              details: result.details ?? null,
            }),
            { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }
    if (idOnlyEnabled && dialogTurnsByScene.size > 0) {
      console.log(
        `[compose-video-clips] id-only cast resolution active for ${dialogTurnsByScene.size}/${scenes.length} scene(s) (canonical dialog_turns)`,
      );
      // Hydrate any character referenced by turns that isn't yet in charById
      // (e.g. legacy scene where the frontend didn't include the character in
      // the request payload but the turns row already carries the UUID).
      const missingFromTurns = new Set<string>();
      for (const turns of dialogTurnsByScene.values()) {
        for (const t of turns) {
          if (t.characterId && !charById.has(t.characterId)) {
            missingFromTurns.add(t.characterId);
          }
        }
      }
      if (missingFromTurns.size > 0) {
        try {
          const { data: rows } = await supabaseAdmin
            .from("brand_characters")
            .select("id, name, reference_image_url")
            .in("id", Array.from(missingFromTurns));
          for (const row of rows ?? []) {
            const id = String((row as any).id);
            if (id && !charById.has(id)) {
              charById.set(id, {
                id,
                name: String((row as any).name ?? ""),
                referenceImageUrl: (row as any).reference_image_url ?? undefined,
              } as ComposerCharacter);
            }
          }
        } catch (turnHydrateErr) {
          console.warn(
            "[compose-video-clips] dialog_turns character hydration failed:",
            turnHydrateErr,
          );
        }
      }
    }

    /**
     * Marker-Block-Guard: preserve `[CastActions]…[/CastActions]` and
     * `[SceneAction]…[/SceneAction]` across the anchor strippers. The generic
     * `- Name: ...` bullet regex below would otherwise annihilate the very
     * lines that carry per-character actions, causing `compose-scene-anchor`
     * to see an empty CastActions block and fall back to the equal-share
     * TWO_SHOT_FRAMING line-up.
     */
    const MARKER_BLOCK_RES: RegExp[] = [
      /\[CastActions\][\s\S]*?\[\/CastActions\]/g,
      /\[SceneAction\][\s\S]*?\[\/SceneAction\]/g,
    ];
    const preserveMarkers = (fn: (s: string) => string) => (raw: string): string => {
      if (!raw) return "";
      const saved: string[] = [];
      let masked = raw;
      for (const re of MARKER_BLOCK_RES) {
        masked = masked.replace(re, (m) => {
          const idx = saved.push(m) - 1;
          return `§§MARKER_${idx}§§`;
        });
      }
      let out = fn(masked);
      out = out.replace(/§§MARKER_(\d+)§§/g, (_, i) => saved[Number(i)] ?? "");
      return out;
    };

    /**
     * Strip spoken-dialog patterns from a scene prompt BEFORE handing it to
     * the image anchor renderer. Mirrors `compose-scene-anchor`'s server-side
     * sanitizer but applied early so the Dialog-block leak cannot reach Nano
     * Banana (which would otherwise paint the same speaker twice when a
     * script repeats a name across lines).
     */
    const stripDialogForAnchor = preserveMarkers((raw: string): string => {
      if (!raw) return "";

      const cleaned = raw
        .replace(/\[\s*dialog\s*\][\s\S]*?\[\s*\/\s*dialog\s*\]/gi, "")
        .replace(/^\s*featuring\s+[^:\n]{1,200}:\s*/gim, "")
        .replace(
          /^\s*[-*•]\s*[\p{L}][\p{L}\s.'\-]{0,60}\s+(says?|speaks?|tells|asks|whispers|shouts|replies|responds)\s*:?\s.*$/gimu,
          "",
        )
        .replace(/^\s*[-*•]\s*[\p{L}][\p{L}\s.'\-]{0,60}\s*:\s.*$/gmu, "")
        .replace(
          /^.*\b(speak\s+to\s+camera\s+in\s+turns|lip[- ]?sync\s+mouth\s+movement|timing\s+must\s+follow|speaker\s+order|in\s+turns|dialogue\s*:|conversation\s+script).*$/gim,
          "",
        )
        .replace(/^[\p{Lu}][\p{L}\s'\-]{0,40}\s*[:\-—]\s.*$/gmu, "")
        .replace(/"[^"]{1,400}"/g, "")
        .replace(/„[^"]{1,400}"/g, "")
        .replace(/«[^»]{1,400}»/g, "")
        .replace(/'[^']{2,400}'/g, "")
        .replace(/\n{2,}/g, "\n")
        .trim();
      const meaningful = cleaned.replace(/[\s.\-,;:!?]/g, "").length >= 10;
      return meaningful ? cleaned : "";
    });

    /**
     * Anchor-Audit-Safe sanitizer: removes / neutralises scene elements that
     * routinely cause the cinematic-sync anchor `human-count` audit to fail
     * with `anchor_extra_person_detected` — e.g. visible laptop/phone/TV
     * screens showing UI with people, posters/photos on walls, crowds,
     * bystanders, background figures, mirrors reflecting people, mannequins,
     * statues. Lipsync requires EXACTLY N humans in the anchor; any
     * secondary depiction (even a tiny UI avatar on a screen) is counted by
     * Gemini Vision and aborts the run before Hailuo spends credits.
     */
    const stripExtraHumansForAnchor = preserveMarkers((raw: string): string => {
      let s = raw || "";
      const riskyTerms = [
        "laptop screen",
        "screen of (?:the |a )?laptop",
        "computer screen",
        "monitor screen",
        "phone screen",
        "smartphone screen",
        "tv screen",
        "television screen",
        "tablet screen",
        "ipad screen",
        "social media calendar",
        "social media feed",
        "social media interface",
        "social media post",
        "social media dashboard",
        "user interface",
        "dashboard interface",
        "app interface",
        "tool interface",
        "ui interface",
        "visible interface",
        "interface visible",
        "interface is visible",
        "calendar visible",
        "calendar is visible",
        "adtool ai interface",
        "posters? (?:of|with|showing) (?:a |the )?(?:person|people|man|woman|figure)",
        "photos? (?:of|with|showing) (?:a |the )?(?:person|people|man|woman|figure)",
        "mirror reflecting",
        "mirror reflection",
        "mannequin",
        "statue of (?:a |the )?(?:person|man|woman|figure)",
        "background crowd",
        "in the background[^.!?]{0,40}(?:people|crowd|bystander|colleague|coworker|customer|guest|figure)",
        "passers?-?by",
        "bystanders?",
        "other (?:people|customers|guests|colleagues|coworkers)",
        "colleagues? (?:nearby|in the background|in the back)",
        "coworkers? (?:nearby|in the background|in the back)",
      ];
      for (const term of riskyTerms) {
        const sentenceRe = new RegExp(
          `[^.!?\\n]*\\b(?:${term})\\b[^.!?\\n]*[.!?]?`,
          "gi",
        );
        s = s.replace(sentenceRe, "");
      }
      s = s
        .replace(/\s*,\s*,/g, ",")
        .replace(/\s*\.\s*\./g, ".")
        .replace(/\s{2,}/g, " ")
        .replace(/\n{2,}/g, "\n")
        .trim();
      const noExtraClause =
        " The environment shows NO additional humans anywhere — no people on screens, no portraits or photos of people on walls, no posters showing people, no reflections of people, no mannequins, no statues of people, no background bystanders or coworkers, no out-of-focus crowd. Any visible laptop, phone or TV screen is turned away from camera, dim, or shows abstract patterns only (no faces, no UI with avatars).";
      return s.length === 0 ? noExtraClause.trim() : `${s}.${noExtraClause}`;
    });


    /**
     * Parse a dialog script ("NAME: text" per line) and return the unique
     * speaker slugs in first-appearance order. Used to override the visual
     * cast for anchor composition: even if `character_shots` lists more
     * slots than the script actually uses, the anchor should only render
     * the people who actually speak (and each exactly ONCE).
     */
    const uniqueSpeakerSlugsFromScript = (script?: string | null): string[] => {
      const s = (script ?? "").trim();
      if (!s) return [];
      const out: string[] = [];
      const seen = new Set<string>();
      // Accept: "NAME:", "[NAME]:", "NAME — MOOD:", "NAME – mood:", "NAME [mood]:"
      // Em-dash (\u2014), en-dash (\u2013) and hyphen, plus optional mood word(s).
      const RE = /^\s*\[?([\p{L}][\p{L}\p{N}\s.'\-]{0,60}?)\]?\s*(?:[\u2014\u2013\-]\s*[\p{L}\s]{1,32})?\s*(?:\[[^\]]{1,32}\])?\s*[:：]/u;
      for (const line of s.split(/\r?\n/)) {
        const m = line.match(RE);
        if (!m) continue;
        const slug = m[1]
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^\p{L}\p{N}\-]/gu, "");
        if (slug && !seen.has(slug)) {
          seen.add(slug);
          out.push(slug);
        }
      }
      return out;
    };


    /**
     * Resolve a speaker slug ("matthew-dusatko" or "matthew") to the matching
     * cast member in `character_shots` (preferred — has the portrait) so we
     * can build a clean portraitUrls[] / characterNames[] pair from the
     * dialog script alone.
     */
    const resolveSpeakerToShot = (
      slug: string,
      shots: Array<{ characterId: string; shotType: CharacterShotType }>,
    ): { characterId: string; shotType: CharacterShotType } | undefined => {
      if (!slug || shots.length === 0) return undefined;
      const lower = slug.toLowerCase();
      const first = lower.split("-")[0];
      // 1) exact match
      let hit = shots.find(
        (s) => String(s.characterId).toLowerCase() === lower,
      );
      if (hit) return hit;
      // 2) first-name match against characterId
      hit = shots.find(
        (s) => String(s.characterId).toLowerCase().split("-")[0] === first,
      );
      if (hit) return hit;
      // 3) match via brand character name
      hit = shots.find((s) => {
        const c = charById.get(s.characterId);
        const cn = (c?.name || "").toLowerCase();
        return cn === lower || cn.split(/\s+/)[0] === first;
      });
      return hit;
    };

    // FROZEN — see mem/architecture/lipsync/FROZEN-INVARIANTS.md (I.4)
    // The returned string MUST contain "LOCKED static camera" verbatim and
    // the negative prompt block CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE MUST
    // list every framing-change keyword (cut/zoom/push/pull/dolly/pan/tilt/
    // reframe/shot change/insert). A regression here triggers wrong-face
    // ASD mapping on multi-speaker plates.
    const neutralTwoShotPrompt = (names: string[], fallbackCount: number) => {
      const cleanNames = names.filter(Boolean);
      // STAGE 6 (May 31 2026): allow n=1 for single-speaker cinematic-sync.
      // STAGE 3-Speaker (May 31 2026): explicit group-shot framing for n≥3 so
      // Nano Banana 2 lines all faces up left-to-right with equal screen
      // share — required for slot-based face targeting in
      // compose-dialog-segments.
      const n = Math.max(cleanNames.length, fallbackCount, 1);
      const named =
        cleanNames.length > 0 ? `: ${cleanNames.join(", ")}` : "";
      const subject = n === 1 ? "Exactly 1 person" : `Exactly ${n} distinct people`;
      const visibility = n === 1
        ? "framed in a clean front, three-quarter or natural profile angle (sync-3 handles profile and partial-occlusion natively) so the mouth and jaw remain clearly visible and unobstructed by hands, microphones or props"
        : n === 2
          ? "each visible exactly once, in a natural two-shot — front, three-quarter, profile or over-the-shoulder angles are all acceptable (sync-3 handles profile/OTS natively); the mouth and jaw of every person must stay clearly visible and unobstructed by hands, microphones or props"
          : n >= 4
            ? `all four standing in a single horizontal line facing the camera, evenly spaced with clear vertical gaps between neighbours, no overlap and no depth stacking. Each head occupies at least 18% of the frame width and is centred on a shared eye-line; every face is front- or three-quarter-facing with mouth and jaw clearly visible and unobstructed by hands, microphones or props. Identical ambient lighting across the whole line, waist-up framing captured in one continuous cinematic frame by a single locked camera in one take`
            : `all standing together in the same physical room as a natural group, captured in one continuous cinematic frame by a single locked camera in one take. Wide medium group shot, ensemble composition: every person occupies real shared 3D space (overlapping depth planes, natural personal distance around shoulder-width, slight depth stagger so nobody is perfectly side-by-side). Each face stays clearly visible, front- or three-quarter-facing, mouth and jaw unobstructed by hands, microphones or props. Identical ambient lighting across the whole room`;

      // v173 (Jun 28 2026) — Single-speaker carve-out (revised v166): the
      // previous wrapper forced a tripod-locked camera AND "heads stay
      // steady" for N=1, which read as a rigid talking-head bust. v166
      // re-adds the camera-only lock (the v163 static face-crop overlay
      // requires it) but keeps body / head / gesture motion free so the
      // scene performance still surfaces.
      if (n === 1) {
        return `${subject}${named}, ${visibility}. Lips soft, clearly visible and unobstructed (lip-ready so the downstream lipsync model can drive the mouth cleanly in post), but the mouth stays softly closed in a natural neutral resting position on the raw plate — no idle mouth motion, no jaw motion, no lip-flap, no muttering, no chewing. Eyes open, alert and clearly visible throughout the entire clip with gaze softly engaged with the scene (only very rare natural blinks — eyes are NEVER held closed, NEVER squinting, NEVER sleepy). Natural neutral facial expression. LOCKED static camera on a fixed tripod for the entire clip — no zoom in, no zoom out, no push-in, no pull-out, no dolly, no crane, no pan, no tilt, no reframing, no shot change; the focal length, framing and the subject's position and size in the frame stay identical from the first frame to the last frame. Natural body motion, gestures and head motion driven by the scene performance are allowed, but the camera itself never moves. No other humans, no background bystanders, no posters or screens showing people. No rendered text.`;
      }

      return `${subject}${named}, ${visibility}. Lips relaxed and softly closed in a neutral resting position with a soft, clearly visible lip-line (mouth area unobstructed by hands, microphones or props — lip-ready so a downstream lipsync model can drive it cleanly in post). EVERY visible person continuously shows subtle idle BODY motion throughout the entire clip — visible breathing (chest and shoulders rising and falling), subtle natural weight shifts and tiny shoulder/torso adjustments (NO repeated head nodding, NO up-and-down head bobbing, heads stay steady), eyes stay open, alert and clearly visible throughout the entire clip with gaze softly engaged with the scene (only very rare natural blinks — eyes are NEVER held closed, NEVER squinting, NEVER sleepy), no person ever fully static or statue-like. Non-speakers stay silently at rest — lips softly closed, breathing calmly through the nose, only micro facial life (occasional blinks, tiny weight shifts, a soft swallow at most). No lip-flap, no chewing pattern, no rhythmic mouth motion, no whispering shapes; a non-speaker's mouth never forms syllables. Only the speaker driven by the lipsync model in post will open their mouth; everyone else listens attentively with closed lips. Natural neutral facial expressions. LOCKED static camera mounted on a tripod for the entire shot — no cuts, no zoom, no push-in, no pull-out, no dolly, no pan, no tilt, no reframing, no shot change. The framing, focal length and every person's position in the frame stay identical from the first frame to the last frame. Soft cinematic lighting. No other humans, no background bystanders, no posters or screens showing people. No rendered text.`;
    };

    /**
     * v172 (Jun 24 2026) — Face-Occlusion-Sanitizer for cinematic-sync plates.
     * Studio-Director scene prompts often contain face-blocking pose
     * descriptors ("hand on forehead", "looking down at laptop", "eyes
     * closed", …). For dialog plates those guarantee a v153_preflight_block
     * because `plate-face-detect` can't find a frontal face at the
     * mid-frame sample. The DB scene text stays untouched; only the prompt
     * sent to Hailuo is sanitized.
     */
    const stripFaceOcclusionForPlate = (text: string): string => {
      if (!text) return text;
      let out = text;
      const replacements: Array<[RegExp, string]> = [
        [/\bhands?\s+on\s+forehead\b/gi, ""],
        [/\bhands?\s+(?:over|covering)\s+(?:the\s+)?face\b/gi, ""],
        [/\bface\s+in\s+(?:the\s+)?hands?\b/gi, ""],
        [/\bhead\s+in\s+(?:the\s+)?hands?\b/gi, ""],
        [/\b(?:looking|gazing|staring)\s+down\s+at\s+(?:a\s+|the\s+)?(?:laptop|phone|smartphone|mobile|desk|screen|keyboard|notebook|tablet|monitor)\b/gi, "at a cluttered desk"],
        [/\bhead\s+down\b/gi, ""],
        [/\blooking\s+away\b/gi, ""],
        [/\bback\s+to\s+camera\b/gi, ""],
        [/\bfacing\s+away\b/gi, ""],
        [/\bfrom\s+behind\b/gi, ""],
        [/\beyes\s+closed\b/gi, "eyes open, looking at the camera"],
        [/\bcovering\s+(?:their|his|her)\s+face\b/gi, ""],
        [/\brubbing\s+(?:their|his|her)\s+(?:eyes|forehead|temples)\b/gi, ""],
      ];
      for (const [re, rep] of replacements) out = out.replace(re, rep);
      // Tidy up dangling commas/whitespace left behind.
      out = out.replace(/\s*,\s*,/g, ",").replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").trim();
      return out;
    };

    /**
     * v166 (Jun 29 2026) — Camera-Motion-Sanitizer for cinematic-sync plates.
     * The v163 preclip pipeline overlays the lipsynced face-crop at STATIC
     * (cropX, cropY, cropSize). If the AI plate pushes in / dollies / zooms,
     * the underlying face drifts while the overlay stays glued to its initial
     * position → mouth no longer aligns → lip-sync looks "off" even at t=0
     * and gets worse over time. We strip every camera-push token from the
     * positive prompt before composing the plate prompt. The negative block
     * (CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE) already lists the same tokens
     * so the model gets a consistent "do not move the camera" signal on both
     * sides. Applied for N=1..N (the previous N≥2 LOCKED static suffix
     * already covered multi-speaker; this closes the N=1 hole).
     */
    const stripCameraMotionForPlate = (text: string): { out: string; stripped: string[] } => {
      if (!text) return { out: text, stripped: [] };
      const stripped: string[] = [];
      let out = text;
      const patterns: RegExp[] = [
        /\bslow(?:\s+|-)(?:push[- ]?in|zoom[- ]?in|dolly[- ]?in|pull[- ]?in|creep[- ]?in)\b/gi,
        /\bpush[- ]?in(?:ning)?\b/gi,
        /\bpush(?:es|ing)?\s+in\b/gi,
        /\bpull[- ]?out\b/gi,
        /\bzoom[- ]?in(?:ning)?\b/gi,
        /\bzoom(?:s|ing)?\s+in\b/gi,
        /\bzoom[- ]?out\b/gi,
        /\bdolly(?:\s+(?:in|out|forward|back(?:wards?)?))?\b/gi,
        /\bcrane(?:\s+(?:up|down))?\b/gi,
        /\btracking\s+shot\b/gi,
        /\btruck(?:ing)?\s+(?:in|out|left|right)\b/gi,
        /\bsteadicam\s+(?:push|pull|move|glide)\b/gi,
        /\b(?:camera\s+)?move(?:s|ment)?\s+(?:closer|in|forward|toward(?:s)?)\b/gi,
        /\bmoves?\s+closer\s+to\s+(?:the\s+)?(?:subject|character|face)\b/gi,
        /\bcamera\s+(?:push|pull|dolly|crane|zoom|tracks?|moves?)\b/gi,
        /\breframe(?:s|ing)?\b/gi,
        /\bwhip\s+pan\b/gi,
        /\bpan(?:s|ning)?\s+(?:left|right|across)\b/gi,
        /\btilt(?:s|ing)?\s+(?:up|down)\b/gi,
        /\bdrift(?:s|ing)?\s+(?:closer|inward|forward)\b/gi,
      ];
      for (const re of patterns) {
        out = out.replace(re, (match) => {
          stripped.push(match);
          return "";
        });
      }
      // Tidy up dangling commas / double spaces left behind.
      out = out
        .replace(/\s*,\s*,+/g, ",")
        .replace(/\s{2,}/g, " ")
        .replace(/\s+([,.])/g, "$1")
        .replace(/^[\s,.;]+|[\s,;]+$/g, "")
        .trim();
      return { out, stripped };
    };

    const buildCinematicSyncMasterPrompt = (scene: ClipScene): string => {
      const speakerSlugs = uniqueSpeakerSlugsFromScript(scene.dialogScript);
      const cleanedVisualPromptRaw = stripDialogForAnchor(scene.aiPrompt || "");
      const occlusionSanitized = stripFaceOcclusionForPlate(cleanedVisualPromptRaw);
      // v166 — strip camera-push tokens so the AI plate stays framed
      // identically frame-to-frame. The v163 preclip overlay sits at a
      // static crop; any plate push-in drifts the underlying face away
      // from the overlay → lipsync looks misaligned.
      const cameraSanitized = stripCameraMotionForPlate(occlusionSanitized);
      if (cameraSanitized.stripped.length > 0) {
        console.log(
          `[compose-video-clips] v166_camera_lock_sanitize scene=${scene.id ?? "?"} n=${speakerSlugs.length} stripped=${JSON.stringify(cameraSanitized.stripped.slice(0, 12))}`,
        );
      }
      const cleanedVisualPrompt = cameraSanitized.out;
      // v172 — N=0 (no speakers): nothing to lip-sync, fall through unchanged
      // so non-dialog cinematic-sync plates are not over-constrained.
      if (speakerSlugs.length === 0)
        return cleanedVisualPrompt || scene.aiPrompt || "cinematic footage";
      const castShots = (scene.characterShots ?? []).filter(
        (s) => s && s.shotType !== "absent" && s.characterId,
      );
      // v246 — Cast-Union: build the visible-cast union (speakers first, then
      // remaining non-absent cast). Prevents silent cast members from being
      // dropped out of the master prompt (collapsing "Exactly 4 people" to
      // "Exactly 1 person" when only one character has dialog lines).
      // Dedup strictly by characterId; name-fallback only when no id resolves.
      const unionIds: string[] = [];
      const unionNames: string[] = [];
      const seenId = new Set<string>();
      const seenNameKey = new Set<string>();
      const pushMember = (characterId: string | undefined, name: string | undefined) => {
        const nm = (name || "").trim();
        const nameKey = nm.toLowerCase();
        if (characterId) {
          if (seenId.has(characterId)) return;
          seenId.add(characterId);
        } else if (nameKey) {
          if (seenNameKey.has(nameKey)) return;
          seenNameKey.add(nameKey);
        } else {
          return;
        }
        if (nm) {
          unionNames.push(nm);
          if (nameKey) seenNameKey.add(nameKey);
        }
        if (characterId) unionIds.push(characterId);
      };
      // 1) Speakers from the script (in first-appearance order)
      for (const slug of speakerSlugs) {
        const shot = resolveSpeakerToShot(slug, castShots);
        const cid = shot?.characterId;
        const nm = cid ? charById.get(cid)?.name : undefined;
        pushMember(cid, nm || slug);
      }
      // 2) Remaining non-absent cast members
      for (const shot of castShots) {
        const cid = shot.characterId;
        const nm = charById.get(cid)?.name;
        pushMember(cid, nm);
      }
      const unionCount = Math.max(unionIds.length, unionNames.length);
      // Guard — if union collapses to empty, fall back to old speaker-only path
      const useUnion = unionCount > 0;
      const promptNames = useUnion ? unionNames : [];
      const promptCount = useUnion ? unionCount : speakerSlugs.length;
      try {
        console.log(
          `[compose-video-clips] v246_cast_union_prompt scene=${scene.id ?? "?"} speakers=${speakerSlugs.length} cast=${castShots.length} union=${unionCount} ids=${JSON.stringify(unionIds.slice(0, 8))}`,
        );
      } catch (_) { /* noop */ }
      // v172 — N=1 now also gets the frontal/lip-ready wrapper (was only
      // applied for N≥2 before). `neutralTwoShotPrompt` has a built-in n===1
      // branch that forces "front, three-quarter or natural profile angle …
      // mouth and jaw remain clearly visible and unobstructed".
      const neutralPlate = neutralTwoShotPrompt(
        promptNames,
        promptCount,
      );
      const sceneDescription =
        cleanedVisualPrompt || "modern cinematic interior scene";

      // "Lip-ready" plate: natural, animatable face — NOT a frozen one. The
      // negative prompt forbids talking/mouth-flap, but the positive prompt
      // must not over-constrain the mouth or Sync.so produces ventriloquist
      // motion.
      //
      // v112 — Append the official Sync.so AI-video hint verbatim
      // (sync.so/docs/compatibility-and-tips/media-content-tips):
      // *"the character should be speaking naturally"* — this produces the
      // small idle mouth/jaw motion that sync-3 requires to drive
      // lipsync on AI-generated plates. Without it, plates render with a
      // statically closed mouth and sync-3 returns the input unchanged.
      // v171 (Jun 22 2026) — Ghost-Speaker fix. The closing clause used to ask
      // every character to "speak naturally with subtle idle mouth/jaw motion"
      // throughout the clip. With all N passes now running in parallel, that
      // makes non-active speakers visibly mouth along ("ghost speaking") on
      // top of their pass-overlay. We keep the lip-ready *geometry* (soft,
      // visible, unobstructed lip-line) — which is what sync-3 actually needs
      // to drive lipsync — but remove the *motion* instruction. Plate mouths
      // stay still; only the per-pass lipsync model opens the active mouth.
      // v173 (Jun 28 2026) — Single-speaker closing clause: drop the
      // "heads stay steady / no nodding" instruction for n=1 so scene
      // performance, gestik and actionBeat from the Briefing-Plan actually
      // surface visibly. The multi-speaker plate still needs the steady-head
      // lock because parallel lipsync passes share one base frame.
      // v166 (Jun 29 2026) — N=1 static-camera lock. The v173 N=1 carve-out
      // dropped the "LOCKED static camera" clause to let scene performance
      // surface, but it also let push-ins / dolly-ins from the user prompt
      // through. Because the v163 preclip overlays the lipsynced face at a
      // STATIC crop, any plate camera motion drifts the underlying face
      // away from the overlay and visibly breaks lipsync from t=0. We
      // re-add a camera-only lock (no zoom, no push-in, no dolly, no pan,
      // no tilt, no reframing) while still allowing natural body / gesture
      // / facial-performance motion driven by the scene description.
      if (promptCount === 1) {
        // v175 (Jun 30 2026) — Closed-mouth N=1 plate. v167 had asked for
        // "small, continuous idle mouth and jaw motion" on the plate so
        // sync-3 had something to drive. Combined with v169-Overlay-Mode
        // disable that worked, but with v175 we re-enable Overlay-Mode for
        // N=1 to fix `generation_unknown_error` via tight-slice — and idle
        // mouth motion outside the speech window becomes visible Tail-Talk.
        // Sync-3 animates closed-mouth plates fine (built-in obstruction +
        // face-open). We therefore force the plate mouth to stay softly
        // closed; sync-3 opens it during the speech window only.
        console.log(`[compose-video-clips] v182_n1_closed_mouth_prompt scene=${scene.id ?? "?"} enabled=true`);
        return `Lip-ready single-subject plate: ${neutralPlate} Visual setting: ${sceneDescription}. Keep the facial expression natural and animatable, with the mouth area soft, clearly visible and unobstructed. The character keeps the mouth softly closed in a natural neutral resting position throughout the plate — NO idle mouth motion, NO jaw motion, NO lip-flap, NO muttering, NO chewing; the downstream sync-3 lipsync model opens the mouth in post only during the actual speech window. Eyes stay open and alert throughout. LOCKED static camera on a fixed tripod for the entire clip — the focal length, framing and the speaker's position and size in the frame stay identical from the first frame to the last frame: no zoom in, no zoom out, no push-in, no pull-out, no dolly, no crane, no pan, no tilt, no reframing, no second camera. The camera does not move closer to or further from the subject. Body posture, gestures, facial performance and any on-set action follow the scene description faithfully, but the camera itself never moves.`;
      }

      return `Lip-ready neutral master plate: ${neutralPlate} Visual setting: ${sceneDescription}. Keep facial expressions natural and animatable, with the mouth area soft, clearly visible and unobstructed (lip-ready so the downstream lipsync model can open the active speaker's mouth in post). All visible characters keep their mouths softly closed in a natural listening pose throughout the plate — no character produces idle mouth, jaw or lip motion in the plate itself. Non-speakers stay silently at rest: breathing calmly through the nose, only micro facial life (occasional blinks, tiny weight shifts) — no lip-flap, no rhythmic mouth motion, no whispering shapes, mouths never form syllables. Eyes stay open and alert throughout the entire plate; heads stay steady — no nodding, no head bobbing.`;
    };

    /** Inject character description based on shotType (Sherlock-Holmes anchor). */
    const injectCharacter = (
      prompt: string,
      shot?: { characterId: string; shotType: CharacterShotType },
    ): string => {
      if (!shot || !shot.characterId || shot.shotType === "absent")
        return prompt;
      const char = charById.get(shot.characterId);
      if (!char) return prompt;
      const appearance = (char.appearance || "").trim();
      const items = (char.signatureItems || "").trim();
      const identityCard = (char.identityCardPrompt || "").trim();
      let prefix = "";
      const lowerPrompt = prompt.toLowerCase();

      // Brand-Character path: a Gemini-built identity card carries far more
      // signal than appearance+items text. Prefer it whenever present and use
      // it for ALL non-absent shot types so face anchoring is consistent.
      if (identityCard) {
        const idProbe = identityCard.slice(0, 40).toLowerCase();
        const hasId = lowerPrompt.includes(idProbe);
        if (!hasId)
          prefix += identityCard.endsWith(",")
            ? identityCard + " "
            : identityCard + ", ";
        return prefix ? prefix + prompt : prompt;
      }

      // Legacy free-text Sherlock-Holmes anchor.
      const itemsProbe = items.slice(0, 30).toLowerCase();
      const appearanceProbe = appearance.slice(0, 30).toLowerCase();
      const hasItems = items && lowerPrompt.includes(itemsProbe);
      const hasAppearance = appearance && lowerPrompt.includes(appearanceProbe);
      switch (shot.shotType) {
        case "full":
          if (!hasAppearance && appearance) prefix += appearance + ", ";
          if (!hasItems && items) prefix += "wearing " + items + ", ";
          break;
        case "profile":
        case "back":
        case "silhouette":
        case "detail":
        case "pov":
          if (!hasItems && items) prefix += items + ", ";
          break;
      }
      return prefix ? prefix + prompt : prompt;
    };

    const enrichPrompt = (
      prompt?: string,
      shot?: { characterId: string; shotType: CharacterShotType },
      isImageToVideo = false,
    ): string => {
      const base = (prompt || "cinematic footage").trim();
      const withChar = injectCharacter(base, shot);
      // Strip any old "no on-screen text..." negative suffix that the wizard/storyboard
      // may have appended — those words trigger the very thing we want to avoid.
      let result = withChar
        .replace(/,?\s*no on-screen text[\s\S]*$/i, "")
        .trim()
        .replace(/[,.]\s*$/, "");
      const lower = result.toLowerCase();
      if (STYLE_HINT) {
        const probe = STYLE_HINT.replace(/^,\s*/, "")
          .slice(0, 30)
          .toLowerCase();
        if (!lower.includes(probe)) result += STYLE_HINT;
      }
      // Append a short positive cue (no negation words!) to bias the model
      // toward clean, text-free, environment-rich frames.
      if (!lower.includes("clean cinematic composition")) {
        result = result.replace(/[,.]\s*$/, "") + POSITIVE_CLEAN_CUE;
      }
      // i2v-only: nudge model to start motion immediately (anti-freeze-frame).
      if (isImageToVideo && !lower.includes("motion already in progress")) {
        result = result.replace(/[,.]\s*$/, "") + POSITIVE_I2V_MOTION_CUE;
      }
      // i2v-only: HARD identity lock — biggest source of "character morphs/ages
      // during the clip" with Hailuo/Kling/Wan. Appended last for recency bias.
      if (
        isImageToVideo &&
        !lower.includes("preserve the exact facial identity")
      ) {
        result =
          result.replace(/[,.]\s*$/, "") +
          ", preserve the exact facial identity, age, skin tone, hair style and hair color of the people from the reference image throughout the entire shot, do not age them, do not morph their faces, do not change face shape, the same recognizable individuals from start to end";
      }
      return result;
    };
    const negativeFor = (
      isImageToVideo: boolean,
      sceneNegative?: string,
    ): string => {
      const base = isImageToVideo
        ? NEGATIVE_PROMPT_PARAM + NEGATIVE_PROMPT_I2V_EXTRA
        : NEGATIVE_PROMPT_PARAM;
      const extra = (sceneNegative || "").trim();
      if (!extra) return base;
      // De-dup: only append phrases that aren't already covered by base.
      const baseLower = base.toLowerCase();
      const extras = extra
        .split(/,\s*/)
        .map((s) => s.trim())
        .filter((s) => s && !baseLower.includes(s.toLowerCase()));
      return extras.length > 0 ? `${base}, ${extras.join(", ")}` : base;
    };

    // Provider-specific lead-in trim defaults (seconds). i2v models hold the
    // reference image static for a few frames before motion starts — these
    // values are cut from the start of the clip during preview & stitching.
    // Calibrated conservatively so we never cut into real motion.
    const I2V_TRIM_DEFAULTS: Record<string, number> = {
      "ai-hailuo": 0.25,
      "ai-kling": 0.15,
      "ai-wan": 0.2,
      "ai-seedance": 0.15,
      "ai-luma": 0.1,
      "ai-veo": 0.1,
      "ai-sora": 0.15,
      "ai-pika": 0.2,
      "ai-happyhorse": 0.15,
    };
    const computeLeadInTrim = (
      clipSource: string,
      hasReference: boolean,
    ): number => (hasReference ? (I2V_TRIM_DEFAULTS[clipSource] ?? 0) : 0);

    const results: Array<{
      sceneId: string;
      status: string;
      predictionId?: string;
      clipUrl?: string;
      error?: string;
    }> = [];

    // Helper: extract a useful error message from Replicate / generic errors
    const errorToString = (err: unknown): string => {
      if (!err) return "Unknown error";
      if (err instanceof Error) {
        // Replicate errors often have .response.data with details
        const anyErr = err as any;
        const detail =
          anyErr?.response?.data?.detail ||
          anyErr?.response?.data?.error ||
          anyErr?.response?.statusText;
        if (detail)
          return `${err.message} — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
        return err.message;
      }
      try {
        return JSON.stringify(err);
      } catch {
        return String(err);
      }
    };

    // Engines that compose-video-clips actually implements. Anything outside
    // this set (e.g. legacy 'ai-sora' after the OpenAI Sunset 2026) gets
    // normalized to a working default so an upstream planner (Auto-Director,
    // manual choice) can never leave a scene stranded in 'pending' forever.
    const SUPPORTED_AI_SOURCES = new Set([
      "ai-hailuo",
      "ai-kling",
      "ai-wan",
      "ai-seedance",
      "ai-luma",
      "ai-veo",
      "ai-runway",
      "ai-pika",
      "ai-happyhorse",
      "ai-image",
    ]);

    // ── Optimistic pre-mark + background dispatch ─────────────────────────
    // The original synchronous per-scene loop could take 60+ seconds per scene
    // (Nano Banana 2 anchor compose + face/identity audits + provider dispatch).
    // The supabase-js client gives up after ~30s, the UI then sees no provider
    // job, the pipeline bar disappears, and the user thinks "the pipeline
    // didn't start". Fix: pre-mark every AI scene as `generating` in DB so the
    // UI keeps showing the working state, then run the actual loop in the
    // background via EdgeRuntime.waitUntil and return immediately.
    const optimisticResults = scenes.map((s) => ({
      sceneId: s.id,
      status: s.clipSource?.startsWith("ai-") ? "generating" : "pending",
    }));
    try {
      const aiSceneIds = scenes
        .filter((s) => s.clipSource?.startsWith("ai-"))
        .map((s) => s.id);
      if (aiSceneIds.length > 0) {
        await supabaseAdmin
          .from("composer_scenes")
          .update({
            clip_status: "generating",
            clip_error: null,
            updated_at: new Date().toISOString(),
          })
          .in("id", aiSceneIds);
      }
    } catch (preMarkErr) {
      console.warn(
        "[compose-video-clips] optimistic pre-mark failed (non-fatal):",
        preMarkErr,
      );
    }

    const processScenes = async () => {
    // Process each scene
    for (const scene of scenes) {
      // ── HARD-GUARD: legacy `heygen` override → `auto` ───────────────────
      // The Composer's HeyGen/Talking-Head portrait route was removed. Any
      // scene still carrying `engineOverride='heygen'` (stale UI state,
      // older briefings, cached plans) is normalised to `auto`. It is
      // deliberately NOT rerouted to `cinematic-sync` — that would silently
      // opt the user into Sync.so lip-sync costs they never asked for.
      // If the user really wants lip-sync on this scene they toggle it and
      // the `__clientWantsComposerLipSync` block below picks it up.
      if ((scene.engineOverride as string) === "heygen") {
        console.warn(
          `[compose-video-clips] scene ${scene.id}: legacy engineOverride='heygen' → normalising to 'auto' (no implicit lip-sync opt-in)`,
        );
        scene.engineOverride = "auto";
        try {
          await supabaseAdmin
            .from("composer_scenes")
            .update({
              engine_override: "auto",
              updated_at: new Date().toISOString(),
            })
            .eq("id", scene.id);
        } catch (heygenNormalizeErr) {
          console.warn(
            `[compose-video-clips] scene ${scene.id}: heygen→auto persist failed`,
            heygenNormalizeErr,
          );
        }
      }

      // ── HARD-GUARD: cinematic-sync ohne User-Opt-in → auto ─────────────
      // Single Source of Truth: Lip-Sync läuft nur wenn der User explizit
      // via Toggle (`lipSyncWithVoiceover`), `dialogMode`, oder manuellem
      // Engine-Override opt-in gemacht hat. Alt-Zeilen aus der HeyGen-
      // Migration können weiter mit `engine_override='cinematic-sync'` in
      // der DB stehen — hier fangen wir sie ab bevor irgendwelche
      // Sync.so-Kosten entstehen. `dialog_shots` != null bedeutet: es
      // läuft bereits eine Pipeline (Retry, Reset) → nicht anfassen.
      {
        const eo = (scene.engineOverride ?? "auto") as string;
        const isLipSyncEngine =
          eo === "cinematic-sync" || eo === "sync-segments" || eo === "native-dialogue";
        const hasOptIn =
          (scene as any).lipSyncWithVoiceover === true ||
          (scene as any).dialogMode === true;
        if (isLipSyncEngine && !hasOptIn) {
          try {
            const { data: dbRow } = await supabaseAdmin
              .from("composer_scenes")
              .select("lip_sync_applied_at, dialog_shots")
              .eq("id", scene.id)
              .maybeSingle();
            const alreadyApplied = !!(dbRow as any)?.lip_sync_applied_at;
            const hasActiveRun =
              !!(dbRow as any)?.dialog_shots &&
              Object.keys((dbRow as any).dialog_shots).length > 0;
            if (!alreadyApplied && !hasActiveRun) {
              console.warn(
                `[compose-video-clips] scene ${scene.id}: cinematic_sync_without_opt_in_downgraded_to_broll (engine=${eo})`,
              );
              scene.engineOverride = "auto";
              try {
                await supabaseAdmin
                  .from("composer_scenes")
                  .update({
                    engine_override: "auto",
                    lip_sync_with_voiceover: false,
                    lip_sync_status: null,
                    twoshot_stage: null,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", scene.id);
              } catch (downgradeErr) {
                console.warn(
                  `[compose-video-clips] scene ${scene.id}: downgrade persist failed`,
                  downgradeErr,
                );
              }
            }
          } catch (guardErr) {
            console.warn(
              `[compose-video-clips] scene ${scene.id}: lip-sync intent guard read failed`,
              guardErr,
            );
          }
        }
      }


      // ── HARD-GUARD: legacy `/talking-head-renders/` clip_url ───────────
      // Composer scenes must never carry a raw talking-head-renders URL as
      // their master output. Mark them failed so the UI can re-render via
      // the current Cinematic-Sync pipeline.
      if (
        typeof (scene as any).uploadUrl === "string" &&
        ((scene as any).uploadUrl as string).includes("/talking-head-renders/")
      ) {
        console.warn(
          `[compose-video-clips] scene ${scene.id}: blocked legacy talking-head-renders upload URL`,
        );
        await supabaseAdmin
          .from("composer_scenes")
          .update({
            clip_status: "failed",
            clip_error: "legacy_talking_head_route_blocked",
            updated_at: new Date().toISOString(),
          })
          .eq("id", scene.id);
        results.push({
          sceneId: scene.id,
          status: "failed",
          error: "legacy_talking_head_route_blocked",
        });
        continue;
      }

      // Sora 2 sunset: silently migrate any legacy 'ai-sora' scene to Veo 3.1
      // ── SRS Lip-Sync Guard ─────────────────────────────────────────────
      // Sub-scenes spawned by SceneDialogStudio's "split" flow are already
      // dispatched directly to generate-talking-head with a pinned audioUrl
      // and a specific speaker portrait. They MUST NOT be re-rendered as
      // generic AI B-roll here — that would discard the per-speaker audio
      // and reuse the wrong voice/timing (root cause of "Matthew with
      // Sarah's voice"). We detect them by their cinematic_preset_slug
      // marker `dialog-srs:<parentId>` and skip them.
      try {
        const { data: dbRow } = await supabaseAdmin
          .from("composer_scenes")
          .select(
            "cinematic_preset_slug, engine_override, clip_status, clip_url, character_audio_url",
          )
          .eq("id", scene.id)
          .maybeSingle();
        const slug = (dbRow as any)?.cinematic_preset_slug as string | null;
        const dbEngine = (dbRow as any)?.engine_override as string | null;
        const status = (dbRow as any)?.clip_status as string | null;
        const hasAudio = !!(dbRow as any)?.character_audio_url;
        if (
          dbEngine !== "cinematic-sync" &&
          slug &&
          slug.startsWith("dialog-srs:") &&
          (hasAudio || status === "generating" || status === "ready")
        ) {
          console.log(
            `[compose-video-clips] Skipping SRS lip-sync sub-scene ${scene.id} (slug=${slug}, status=${status})`,
          );
          results.push({
            sceneId: scene.id,
            status: status === "ready" ? "ready" : "generating",
          });
          continue;
        }
      } catch (e) {
        console.warn(
          "[compose-video-clips] SRS guard query failed (continuing):",
          e instanceof Error ? e.message : String(e),
        );
      }

      // (audio + cinematic) since OpenAI is sunsetting Sora 2 in 2026.
      if ((scene.clipSource as string) === "ai-sora") {
        console.warn(
          `[compose-video-clips] Scene ${scene.id} clipSource 'ai-sora' is sunset — migrating to ai-veo.`,
        );
        scene.clipSource = "ai-veo";
        await supabaseAdmin
          .from("composer_scenes")
          .update({
            clip_source: "ai-veo",
            updated_at: new Date().toISOString(),
          })
          .eq("id", scene.id);
      }

      // Pika 2.2 maintenance window: silently migrate ai-pika scenes to ai-hailuo
      // until Pika Labs API is stable again. Reverse: remove this block.
      if ((scene.clipSource as string) === "ai-pika") {
        console.warn(
          `[compose-video-clips] Scene ${scene.id} clipSource 'ai-pika' is in maintenance — migrating to ai-hailuo.`,
        );
        scene.clipSource = "ai-hailuo";
        await supabaseAdmin
          .from("composer_scenes")
          .update({
            clip_source: "ai-hailuo",
            updated_at: new Date().toISOString(),
          })
          .eq("id", scene.id);
      }

      // June 26 2026 — SILENT MIGRATION REMOVED.
      // Previously HappyHorse + cinematic-sync / sync-segments was silently
      // rewritten to ai-hailuo whenever ≥2 speakers were detected. That
      // change collapsed user-picked durations (7s/8s/9s/15s) to Hailuo's
      // 6/10s buckets and made the UI show "10s hailuo" even though the
      // user picked "7s happyhorse". The dialog-segments pipeline is
      // provider-agnostic (see compose-dialog-segments comment line 897:
      // "Hailuo/HappyHorse i2v"), so the migration is not technically
      // required. If HappyHorse multi-cast plates fail face-detection in
      // Sync.so the user now sees the real error and credits are refunded
      // idempotently — no silent provider switch.
      const __clientWantsComposerLipSync =
        (scene as any).lipSyncWithVoiceover === true ||
        (scene as any).dialogMode === true;
      if (__clientWantsComposerLipSync && (scene.engineOverride ?? "auto") === "auto") {
        scene.engineOverride = "cinematic-sync";
        try {
          await supabaseAdmin
            .from("composer_scenes")
            .update({
              engine_override: "cinematic-sync",
              lip_sync_with_voiceover: true,
              lip_sync_status: "pending",
              twoshot_stage: "audio",
              clip_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", scene.id);
        } catch (normalizeErr) {
          console.warn(
            `[compose-video-clips] scene ${scene.id}: failed to persist cinematic-sync normalization`,
            normalizeErr,
          );
        }
      }

      const __engineForHHGuard = scene.engineOverride ?? "auto";

      // Lip-Sync master-plate allowlist (July 2026 expansion).
      // Sync.so operates on a finished MP4, so any provider whose output is a
      // standard video URL can act as a master plate. Certified providers:
      //   - ai-happyhorse (primary, 3–15s)
      //   - ai-hailuo (fallback, 6/10s)
      //   - ai-kling (3–15s)
      //   - ai-wan (3–10s)
      //   - ai-seedance (3–12s)
      //   - ai-luma (5s or 9s)
      // Other providers (Runway/Vidu/Pika/Veo/Sora/Grok) remain excluded until
      // individually validated.
      const LIPSYNC_PROVIDERS = new Set([
        "ai-happyhorse",
        "ai-hailuo",
        "ai-kling",
        "ai-wan",
        "ai-seedance",
        "ai-luma",
      ]);

      if (
        LIPSYNC_PROVIDERS.has(scene.clipSource as string) &&
        (__engineForHHGuard === "cinematic-sync" ||
          __engineForHHGuard === "sync-segments")
      ) {
        console.log(
          `[compose-video-clips] Scene ${scene.id}: ${scene.clipSource} + ${__engineForHHGuard} — keeping as master plate. Duration ${scene.durationSeconds}s preserved.`,
        );
      }

      // Defense-in-depth: reject non-certified providers in the lip-sync
      // pipeline with a clear 400 so the frontend can route the user back
      // to the provider picker.
      if (
        (__engineForHHGuard === "cinematic-sync" ||
          __engineForHHGuard === "sync-segments") &&
        !LIPSYNC_PROVIDERS.has(scene.clipSource as string)
      ) {
        return new Response(
          JSON.stringify({
            error: "invalid_provider_for_lipsync",
            message:
              `Lip-Sync ist aktuell nur mit HappyHorse (3–15s), Hailuo (6/10s), Kling (3–15s), Wan (3–10s), Seedance (3–12s) oder Luma (5/9s) möglich. Aktuell: ${scene.clipSource}. Bitte Provider wechseln oder Lip-Sync deaktivieren.`,
            scene_id: scene.id,
            picked: scene.clipSource,
            allowed: Array.from(LIPSYNC_PROVIDERS),
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Duration guard — surface mismatches instead of silently snapping.
      if (scene.clipSource === "ai-hailuo") {
        const d = Number(scene.durationSeconds);
        if (d !== 6 && d !== 10) {
          return new Response(
            JSON.stringify({
              error: "invalid_duration_for_provider",
              message: `Hailuo unterstützt nur 6s oder 10s. Gewählt: ${d}s. Bitte Szenenlänge auf 6 oder 10 setzen oder Provider wechseln.`,
              scene_id: scene.id,
              provider: "ai-hailuo",
              picked: d,
              allowed: [6, 10],
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } else if (scene.clipSource === "ai-happyhorse") {
        const d = Number(scene.durationSeconds);
        if (!Number.isFinite(d) || d < 3 || d > 15) {
          return new Response(
            JSON.stringify({
              error: "invalid_duration_for_provider",
              message: `HappyHorse unterstützt 3–15 Sekunden. Gewählt: ${d}s.`,
              scene_id: scene.id,
              provider: "ai-happyhorse",
              picked: d,
              allowed: { min: 3, max: 15 },
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } else if (scene.clipSource === "ai-kling") {
        const d = Number(scene.durationSeconds);
        if (!Number.isFinite(d) || d < 3 || d > 15) {
          return new Response(
            JSON.stringify({
              error: "invalid_duration_for_provider",
              message: `Kling unterstützt 3–15 Sekunden. Gewählt: ${d}s.`,
              scene_id: scene.id,
              provider: "ai-kling",
              picked: d,
              allowed: { min: 3, max: 15 },
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } else if (scene.clipSource === "ai-wan") {
        const d = Number(scene.durationSeconds);
        if (!Number.isFinite(d) || d < 3 || d > 10) {
          return new Response(
            JSON.stringify({
              error: "invalid_duration_for_provider",
              message: `Wan unterstützt 3–10 Sekunden. Gewählt: ${d}s.`,
              scene_id: scene.id,
              provider: "ai-wan",
              picked: d,
              allowed: { min: 3, max: 10 },
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } else if (scene.clipSource === "ai-seedance") {
        const d = Number(scene.durationSeconds);
        if (!Number.isFinite(d) || d < 3 || d > 12) {
          return new Response(
            JSON.stringify({
              error: "invalid_duration_for_provider",
              message: `Seedance unterstützt 3–12 Sekunden. Gewählt: ${d}s.`,
              scene_id: scene.id,
              provider: "ai-seedance",
              picked: d,
              allowed: { min: 3, max: 12 },
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } else if (scene.clipSource === "ai-luma") {
        const d = Number(scene.durationSeconds);
        if (d !== 5 && d !== 9) {
          return new Response(
            JSON.stringify({
              error: "invalid_duration_for_provider",
              message: `Luma Ray 2 unterstützt nur 5s oder 9s. Gewählt: ${d}s.`,
              scene_id: scene.id,
              provider: "ai-luma",
              picked: d,
              allowed: [5, 9],
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }


      // Defensive: rewrite unsupported AI engines to a working default.
      if (
        scene.clipSource.startsWith("ai-") &&
        !SUPPORTED_AI_SOURCES.has(scene.clipSource)
      ) {
        console.warn(
          `[compose-video-clips] Scene ${scene.id} clipSource '${scene.clipSource}' not supported by composer — falling back to ai-hailuo.`,
        );
        scene.clipSource = "ai-hailuo";
        // Persist the rewrite so the UI reflects reality
        await supabaseAdmin
          .from("composer_scenes")
          .update({
            clip_source: "ai-hailuo",
            updated_at: new Date().toISOString(),
          })
          .eq("id", scene.id);
      }

      const quality: Quality = scene.clipQuality === "pro" ? "pro" : "standard";

      // ── Cinematic-Sync auto-extend ────────────────────────────────────────
      // When engineOverride === 'cinematic-sync', the user wants the avatar
      // re-rendered into the real scene with Sync.so lip-sync. If the scene's
      // voiceover is LONGER than the configured scene duration, we'd lose
      // dialog (Sync.so cut_off). Auto-extend the scene to the smallest
      // Hailuo-allowed duration (6s or 10s) that fits VO + 0.4s padding.
      // Pre-flight audio prep runs for BOTH dialog engines: legacy
      // `cinematic-sync` and the new `sync-segments` (Sync.so sync-3 Fast
      // Dialog) default. Without this, single-speaker sync-segments scenes
      // ship with a moving Hailuo plate but no `audio_plan.twoshot.url`,
      // and `compose-dialog-segments` skips the lipsync dispatch — exactly
      // the "Voiceover plays but lips don't move" regression.
      const __dialogEngine = scene.engineOverride ?? "auto";
      if (__dialogEngine === "cinematic-sync" || __dialogEngine === "sync-segments") {
        __stage = `cinematic_sync_prep:${scene.id}`;
        try {
          // Two-Shot prep: if this scene has a multi-speaker dialog_script,
          // synthesize a merged voiceover (one WAV with all speakers in
          // sequence) BEFORE the auto-extend logic looks for VO duration.
          // This is what makes the "Artlist Two-Shot Hook" work end-to-end:
          // Hailuo renders the 10s two-shot, then Sync.so lip-syncs against
          // the merged audio.
          try {
            const dlg = String((scene as any).dialogScript ?? "");
            const speakerLines = dlg
              .split(/\r?\n/)
              .filter((l) =>
                /^\s*\[?[A-Za-zÀ-ÿ][\w\s.'-]{1,40}?\]?\s*[:：]/.test(l),
              );
            if (speakerLines.length >= 1) {
              // Mark stage = 'audio' so the UI can show step 1/6.
              await supabaseAdmin
                .from("composer_scenes")
                .update({
                  twoshot_stage: "audio",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", scene.id);
              const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/compose-twoshot-audio`;
              const r = await fetch(fnUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify({ scene_id: scene.id }),
              });
              // Drain body to avoid leak; capture text on failure for logs.
              const respText = await r.text().catch(() => "");
              if (!r.ok) {
                console.warn(
                  `[compose-video-clips] twoshot-audio prep failed for ${scene.id}: HTTP ${r.status} ${respText.slice(0, 300)}`,
                );
              } else {
                console.log(
                  `[compose-video-clips] twoshot-audio prep OK for ${scene.id}`,
                );
                // Stage = 'master_clip' — Hailuo render begins next.
                await supabaseAdmin
                  .from("composer_scenes")
                  .update({
                    twoshot_stage: "master_clip",
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", scene.id);
              }
            }
          } catch (twoshotErr) {
            console.warn(
              `[compose-video-clips] twoshot-audio prep exception for ${scene.id}:`,
              twoshotErr,
            );
          }

          const { data: voClips } = await supabaseAdmin
            .from("scene_audio_clips")
            .select("duration")
            .eq("scene_id", scene.id)
            .eq("kind", "voiceover")
            .order("duration", { ascending: false })
            .limit(1);
          const voDur = Number(voClips?.[0]?.duration ?? 0);
          if (voDur > 0) {
            const required = voDur + 0.4;
            const currentDur = Number(scene.durationSeconds || 0);
            // June 26 2026 — DURATION-FIX: never silently overwrite the user's
            // picked duration. If the VO is longer than the picked scene
            // length, Sync.so handles it via `cut_off` (or the user can extend
            // the slider). Previously this block would bump 7s → 10s on Hailuo
            // and even DB-persist that change, which broke the slider for
            // every subsequent render. We now only log diagnostics.
            if (required > currentDur) {
              const isHailuo = (scene.clipSource as string) === "ai-hailuo";
              console.log(
                `[compose-video-clips] Cinematic-Sync scene ${scene.id}: VO ${voDur.toFixed(2)}s > picked ${currentDur}s — honouring user pick (provider=${scene.clipSource}). Sync.so cut_off will trim.`,
              );
              if (isHailuo && required > 10) {
                console.warn(
                  `[compose-video-clips] Cinematic-Sync scene ${scene.id}: VO (${voDur.toFixed(2)}s) exceeds Hailuo 10s limit — Sync.so will cut_off.`,
                );
              }
            }
          }


          // ── Server-side multi-cast anchor safety net ────────────────────
          // ALWAYS audit when 2+ cast members, even if a /scene-anchors/ image
          // is already pinned — a previously composed anchor can still contain
          // an extra/cloned person from an older pipeline version. We only
          // reuse an existing anchor when audit_version matches and ok===true.
          try {
            const castShotsRaw = (scene.characterShots ?? []).filter(
              (s) => s && s.shotType !== "absent" && s.characterId,
            );

            // STAGE 6 (Jun 24 2026): unified mention library exposes saved
            // outfit looks as virtual mention IDs `outfit:<look_id>`. When
            // such an ID lands in characterShots[].characterId it cannot be
            // resolved against brand_characters and the cinematic-sync anchor
            // step fails with `missing_single_speaker` even though the user
            // clearly picked an avatar+outfit. Resolve the prefix here once
            // (lazy migration) so the rest of the pipeline sees the real
            // brand_character UUID and gets a portrait.
            const castShots: typeof castShotsRaw = [];
            for (const shot of castShotsRaw) {
              const id = String(shot.characterId ?? "");
              if (id.startsWith("outfit:")) {
                const lookId = id.slice("outfit:".length);
                try {
                  const { data: look } = await supabaseAdmin
                    .from("avatar_outfit_looks")
                    .select("id, avatar_id, front_url, cover_url")
                    .eq("id", lookId)
                    .maybeSingle();
                  if (look?.avatar_id) {
                    const avatarId = String(look.avatar_id);
                    if (!charById.has(avatarId)) {
                      const { data: brand } = await supabaseAdmin
                        .from("brand_characters")
                        .select("id, name, reference_image_url")
                        .eq("id", avatarId)
                        .maybeSingle();
                      if (brand) {
                        charById.set(avatarId, {
                          id: avatarId,
                          name: String((brand as any).name ?? ""),
                          // Prefer the outfit's front_url so the look is
                          // actually carried into the anchor / i2v.
                          referenceImageUrl:
                            (look as any).front_url ??
                            (look as any).cover_url ??
                            (brand as any).reference_image_url,
                        } as ComposerCharacter);
                      }
                    }
                    castShots.push({ characterId: avatarId, shotType: shot.shotType });
                    continue;
                  }
                } catch (outfitErr) {
                  console.warn(
                    `[compose-video-clips] outfit-prefix resolve failed for ${id}`,
                    outfitErr,
                  );
                }
              }
              castShots.push(shot);
            }

            // ID-Only Cast Resolution (v200) --------------------------------
            // When `dialog_turns` is populated for this scene, use it as the
            // single source of truth: the visual cast = deduped characterIds
            // in first-appearance order. NO name parsing, NO fuzzy match.
            // Falls back to the legacy script-slug resolver only for scenes
            // whose dialog_turns row is empty (legacy scenes pre-migration).
            const turnsForScene = dialogTurnsByScene.get(scene.id);
            const scriptSpeakers = uniqueSpeakerSlugsFromScript(
              scene.dialogScript,
            );
            let effectiveShots = castShots;

            if (turnsForScene && turnsForScene.length > 0) {
              const fromTurns = effectiveShotsFromTurns(turnsForScene, castShots);
              if (fromTurns && fromTurns.length >= 1) {
                effectiveShots = fromTurns as typeof castShots;
                console.log(
                  `[compose-video-clips] v200_id_only_cast scene=${scene.id} cast=[${effectiveShots.map((s) => s.characterId).join(",")}] source=dialog_turns`,
                );
              }
            } else if (scriptSpeakers.length > 0) {
              const remapped = scriptSpeakers
                .map((slug) => resolveSpeakerToShot(slug, castShots))
                .filter(
                  (
                    x,
                  ): x is {
                    characterId: string;
                    shotType: CharacterShotType;
                  } => !!x,
                );
              if (remapped.length >= 1) effectiveShots = remapped;
            }


            // STAGE 5 (May 30 2026): when the script declares speakers but
            // the cast is empty (single-speaker quick-flows often skip the
            // cast picker), resolve each speaker slug against brand_characters
            // and synthesize a virtual shot so the anchor step can still run.
            // Without this fallback the single-speaker cinematic-sync path
            // silently skips composition → Hailuo invents a stranger OR a
            // stale talking-head URL leaks into v5 lipsync.
            // Also trigger this fallback when castShots exist but NONE of
            // them resolves to a portrait (e.g. legacy `outfit:`/`catalog:`
            // prefixed IDs that survived the resolver above with a broken
            // look reference). Without this, the anchor step throws
            // `missing_single_speaker` even though brand_characters contains
            // a perfectly usable portrait under the speaker's name.
            const effectiveHasPortrait = effectiveShots.some((s) => {
              const c = charById.get(String(s.characterId));
              return !!(c && (c as any).referenceImageUrl);
            });
            if (
              !(turnsForScene && turnsForScene.length > 0) &&
              scriptSpeakers.length > 0 &&
              (effectiveShots.length === 0 || !effectiveHasPortrait)
            ) {

              try {
                const { data: brandRows } = await supabaseAdmin
                  .from("brand_characters")
                  .select("id, name, reference_image_url");
                const synthesized: Array<{ characterId: string; shotType: CharacterShotType }> = [];
                for (const slug of scriptSpeakers) {
                  const lower = slug.toLowerCase();
                  const first = lower.split("-")[0];
                  const match = (brandRows ?? []).find((r: any) => {
                    const n = String(r.name ?? "").toLowerCase().trim();
                    const nSlug = n.replace(/\s+/g, "-");
                    return nSlug === lower || n.split(/\s+/)[0] === first;
                  });
                  if (match && (match as any).reference_image_url) {
                    const id = String((match as any).id);
                    if (!charById.has(id)) {
                      charById.set(id, {
                        id,
                        name: String((match as any).name ?? ""),
                        referenceImageUrl: (match as any).reference_image_url,
                      } as ComposerCharacter);
                    }
                    synthesized.push({ characterId: id, shotType: "full" });
                  }
                }
                if (synthesized.length > 0) {
                  console.log(
                    `[compose-video-clips] cinematic-sync scene ${scene.id}: synthesized ${synthesized.length} shot(s) from script speakers`,
                  );
                  effectiveShots = synthesized;
                }
              } catch (resolveErr) {
                console.warn(
                  `[compose-video-clips] cinematic-sync scene ${scene.id}: brand-character speaker resolution failed`,
                  resolveErr,
                );
              }
            }

            // STAGE 3 (May 30 2026): also enforce scene-aware anchor for
            // SINGLE-speaker cinematic-sync. Without this, a 1-speaker scene
            // with a portrait would skip composition entirely and Hailuo /
            // HappyHorse would either invent the scene from text (drift) or
            // — far worse — a stale `lip_sync_source_clip_url` from a previous
            // Talking-Head render would survive into v5 lipsync, making the
            // final video a raw avatar bust instead of the prompted scene.
            if (effectiveShots.length >= 1) {
              // Resolve outfit-look cover images so the anchor renders the
              // user-picked Casual/Brand outfit (instead of the bare portrait
              // photo). Falls back to the avatar's base portrait when no
              // outfit look is selected or the lookup fails.
              const outfitLookIds = effectiveShots
                .map((cs) => (cs as any).outfitLookId)
                .filter((id): id is string => typeof id === "string" && id.length > 0);
              const outfitUrlById = new Map<string, string>();
              if (outfitLookIds.length > 0) {
                try {
                  const { data: outfitRows } = await supabaseAdmin
                    .from("avatar_outfit_looks")
                    .select("id, cover_url, front_url")
                    .in("id", outfitLookIds);
                  for (const row of outfitRows ?? []) {
                    const url = (row as any).cover_url || (row as any).front_url;
                    if (typeof url === "string" && url.length > 0) {
                      outfitUrlById.set(String((row as any).id), url);
                    }
                  }
                } catch (e) {
                  console.warn(
                    `[compose-video-clips] cinematic-sync scene ${scene.id}: outfit lookup failed`,
                    e,
                  );
                }
              }
              const portraitUrls = effectiveShots
                .map((cs) => {
                  const outfitId = (cs as any).outfitLookId as string | undefined;
                  const outfitUrl = outfitId ? outfitUrlById.get(outfitId) : undefined;
                  return (
                    outfitUrl || charById.get(cs.characterId)?.referenceImageUrl
                  );
                })
                .filter(
                  (u): u is string => typeof u === "string" && u.length > 0,
                )
                .slice(0, 4);
              // v111 — canonical face-only identity refs, aligned 1:1 with
              // portraitUrls. When the primary slot is an outfit cover (which
              // sometimes drifts in identity), this gives Nano Banana 2 the
              // real face as a separate ground-truth image.
              const identityPortraitUrls = effectiveShots
                .slice(0, portraitUrls.length)
                .map((cs) => charById.get(cs.characterId)?.referenceImageUrl)
                .filter((u): u is string => typeof u === "string" && u.length > 0);
              const characterNames = effectiveShots
                .map((cs) => charById.get(cs.characterId)?.name)
                .filter(
                  (n): n is string => typeof n === "string" && n.length > 0,
                );
              // Wardrobe-Lock: which cast members have a user-picked outfit?
              // Their wardrobe must override the scene description (e.g. Roman
              // armor inside a "business meeting").
              const wardrobeLockNamesCS = effectiveShots
                .filter((cs) => {
                  const id = (cs as any).outfitLookId as string | undefined;
                  return id && outfitUrlById.has(id);
                })
                .map((cs) => charById.get(cs.characterId)?.name)
                .filter((n): n is string => typeof n === "string" && n.length > 0);
              // Cinematic-Sync REQUIRES a portrait. If we got speakers from
              // the script but couldn't resolve any portrait (no cast picker
              // used + no matching brand_character), fail loud BEFORE Hailuo
              // ever dispatches — otherwise the UI sees a silent 30s timeout.
              if (portraitUrls.length === 0 && scriptSpeakers.length > 0) {
                const msg = `cinematic_sync_anchor_missing_single_speaker: Konnte für die Sprecher [${scriptSpeakers.join(", ")}] keine Portraits aus den Brand Characters auflösen. Bitte einen Brand Character mit Portrait im Cast zuweisen.`;
                console.warn(
                  `[compose-video-clips] cinematic-sync scene ${scene.id}: ${msg}`,
                );
                await supabaseAdmin
                  .from("composer_scenes")
                  .update({
                    clip_status: "failed",
                    clip_error: msg,
                    twoshot_stage: "failed",
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", scene.id);
                results.push({ sceneId: scene.id, status: "failed", error: msg });
                continue;
              }
              if (portraitUrls.length >= 1) {
                const expectedFaces = portraitUrls.length;
                const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
                // Mark anchor stage so the progress bar reflects what's
                // actually happening — without this the UI shows "audio…"
                // for the full Nano Banana 2 composition window.
                try {
                  await supabaseAdmin
                    .from("composer_scenes")
                    .update({ twoshot_stage: "anchor", updated_at: new Date().toISOString() })
                    .eq("id", scene.id);
                } catch (_) { /* non-fatal */ }

                // Has the currently-pinned anchor passed the current audit version?
                const prevAuditRaw =
                  (scene as any).audioPlan?.twoshot?.anchor_face_audit ?? null;
                const prevAuditOk =
                  prevAuditRaw &&
                  prevAuditRaw.ok === true &&
                  Number(prevAuditRaw.version) === ANCHOR_AUDIT_VERSION;
                const existingRefUrl = String(scene.referenceImageUrl ?? "");
                const existingLooksComposed =
                  existingRefUrl.includes("/scene-anchors/") ||
                  existingRefUrl.includes("/composer-anchors/");

                // composeAnchor — single attempt at compose-scene-anchor.
                const composeAnchor = async (
                  label: string,
                  strict = false,
                  swap = false,
                  swapMismatches: string[] = [],
                  faceLock = false,
                ): Promise<string | null> => {
                  console.log(
                    `[compose-video-clips] cinematic-sync scene ${scene.id}: composing multi-cast anchor (${portraitUrls.length} portraits, identityRefs=${identityPortraitUrls.length}, outfits=${outfitUrlById.size}/${outfitLookIds.length}) [${label}${strict ? ", strict" : ""}${swap ? ", swap" : ""}${faceLock ? ", face-lock" : ""}]`,
                  );
                  const sceneDesc = stripExtraHumansForAnchor(
                    stripDialogForAnchor(scene.aiPrompt || ""),
                  );
                  const framing = neutralTwoShotPrompt(
                    characterNames,
                    portraitUrls.length,
                  );
                  const anchorPrompt = sceneDesc
                    ? `${framing} Visual setting: ${sceneDesc}. Keep all selected outfits intact; do not change clothing.`
                    : framing;
                  const r = await fetch(
                    `${Deno.env.get("SUPABASE_URL")}/functions/v1/compose-scene-anchor`,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: authHeader,
                      },
                      body: JSON.stringify({
                        sceneId: scene.id,
                        portraitUrl: portraitUrls[0],
                        portraitUrls,
                        identityPortraitUrls,
                        characterNames,
                        scenePrompt: anchorPrompt,
                        aspectRatio: "16:9",
                        shotType: scene.characterShot?.shotType,
                        strictNoDuplicates: strict,
                        strictSwapMode: swap || faceLock,
                        swapMismatches,
                        faceLockMode: faceLock,
                        wardrobeLock: wardrobeLockNamesCS.length > 0,
                        wardrobeLockNames: wardrobeLockNamesCS,
                      }),
                    },
                  );
                  if (!r.ok) {
                    const errTxt = await r.text().catch(() => "");
                    console.warn(
                      `[compose-video-clips] cinematic-sync scene ${scene.id}: compose-scene-anchor failed ${r.status} ${errTxt.slice(0, 200)}`,
                    );
                    return null;
                  }
                  const aj = await r.json().catch(() => ({}));
                  return typeof aj?.composedUrl === "string"
                    ? aj.composedUrl
                    : null;
                };

                const invalidateCache = async () => {
                  await supabaseAdmin
                    .from("scene_anchor_cache")
                    .delete()
                    .eq("scene_id", scene.id);
                };

                // Evaluate: cast-integrity audit (no clone, no swap, no missing).
                // v170 — headcount checks (countFaces/countHumans) are kept as
                // pure telemetry; they no longer block. Bystanders, crowd, and
                // depicted persons (screens/posters/photos/mirrors) are allowed.
                const evaluate = async (url: string, label: string) => {
                  const [fc, hc] = await Promise.all([
                    countFacesInImage(url, LOVABLE_API_KEY!, { kind: "image" }),
                    countHumansInImage(url, LOVABLE_API_KEY!),
                  ]);
                  let identity:
                    | "clone"
                    | "extra"
                    | "missing"
                    | "ambiguous"
                    | "swap"
                    | null = null;
                  let notes = "";
                  let mismatched: string[] = [];
                  if (portraitUrls.length >= 1) {
                    // v170 — audit runs for N=1 too (extras ignored, clones/swap/missing still caught).
                    const auditRefs = identityPortraitUrls.length === portraitUrls.length
                      ? identityPortraitUrls
                      : portraitUrls;
                    const audit = await auditAnchorIdentity(
                      url,
                      auditRefs,
                      characterNames,
                      LOVABLE_API_KEY!,
                    );
                    if (audit && !audit.ok) {
                      identity = (audit.reason as typeof identity) ?? "ambiguous";
                      notes = audit.detail || notes;
                      if (audit.reason === "swap" && Array.isArray(audit.mismatched)) {
                        mismatched = audit.mismatched;
                      }
                    }
                  }
                  console.log(
                    `[compose-video-clips] anchor audit scene ${scene.id} ${label}: cast=${identity ?? "ok"} mismatched=[${mismatched.join(",")}] telemetry(faces=${fc} humans=${hc}/${expectedFaces}) notes="${notes.slice(0, 120)}"`,
                  );
                  return { faceCount: fc, humanCount: hc, identity, notes, mismatched };
                };


                let composedUrl: string | null = null;
                let faceCount: number | null = null;
                let humanCount: number | null = null;
                let identityFailure:
                  | "clone"
                  | "extra"
                  | "missing"
                  | "ambiguous"
                  | "swap"
                  | null = null;
                let identityNotes = "";
                let identityMismatched: string[] = [];
                let skipAuditPersist = false;

                if (prevAuditOk && existingLooksComposed) {
                  console.log(
                    `[compose-video-clips] cinematic-sync scene ${scene.id}: reusing pinned anchor (audit v${ANCHOR_AUDIT_VERSION} ok)`,
                  );
                  composedUrl = existingRefUrl;
                  faceCount = Number.isFinite(Number(prevAuditRaw?.detected))
                    ? Number(prevAuditRaw.detected)
                    : null;
                  humanCount = Number.isFinite(Number(prevAuditRaw?.humans))
                    ? Number(prevAuditRaw.humans)
                    : null;
                  skipAuditPersist = true;
                } else {
                  if (existingLooksComposed) {
                    console.log(
                      `[compose-video-clips] cinematic-sync scene ${scene.id}: pinned anchor missing audit v${ANCHOR_AUDIT_VERSION} → re-composing`,
                    );
                  }
                  await invalidateCache();
                  const anchorAttempts: Array<Record<string, unknown>> = [];
                  composedUrl = await composeAnchor("attempt-1");

                  if (composedUrl && LOVABLE_API_KEY) {
                    const e1 = await evaluate(composedUrl, "attempt-1");
                    faceCount = e1.faceCount;
                    humanCount = e1.humanCount;
                    identityFailure = e1.identity;
                    identityNotes = e1.notes;
                    identityMismatched = e1.mismatched ?? [];
                    anchorAttempts.push({
                      attempt: 1, mode: "normal",
                      identity: identityFailure ?? "ok",
                      faces: faceCount, humans: humanCount,
                      mismatched: identityMismatched,
                      at: new Date().toISOString(),
                    });

                    // v170 — retry only on real cast-integrity failures.
                    // Headcount differences alone (extras/bystanders) are OK.
                    const needsRetry = identityFailure !== null;
                    if (needsRetry) {
                      const isSwap = identityFailure === "swap";
                      console.log(
                        `[compose-video-clips] anchor scene ${scene.id}: attempt-1 failed (faces=${faceCount}/${expectedFaces} humans=${humanCount}/${expectedFaces} identity=${identityFailure}) → ${isSwap ? "swap" : "strict"} retry`,
                      );
                      await invalidateCache();
                      const retryUrl = await composeAnchor(
                        "attempt-2",
                        !isSwap,
                        isSwap,
                        isSwap ? identityMismatched : [],
                      );
                      if (retryUrl) {
                        const e2 = await evaluate(retryUrl, "attempt-2");
                        composedUrl = retryUrl;
                        faceCount = e2.faceCount;
                        humanCount = e2.humanCount;
                        identityFailure = e2.identity;
                        identityNotes = e2.notes;
                        identityMismatched = e2.mismatched ?? [];
                        anchorAttempts.push({
                          attempt: 2, mode: isSwap ? "swap" : "strict",
                          identity: identityFailure ?? "ok",
                          faces: faceCount, humans: humanCount,
                          mismatched: identityMismatched,
                          at: new Date().toISOString(),
                        });
                      }

                      // v131.6 — third (final) auto-recovery attempt with
                      // FACE-LOCK mode when attempt-2 still shows an
                      // identity SWAP. Clones/extras/missing are not
                      // retried again because they need different fixes
                      // (count or composition, not face-pixel-copy).
                      if (
                        identityFailure === "swap" &&
                        identityPortraitUrls.length === portraitUrls.length
                      ) {
                        console.log(
                          `[compose-video-clips] anchor scene ${scene.id}: attempt-2 still swap → attempt-3 face-lock`,
                        );
                        await invalidateCache();
                        const lockUrl = await composeAnchor(
                          "attempt-3",
                          false,
                          true,
                          identityMismatched,
                          true, // faceLock
                        );
                        if (lockUrl) {
                          const e3 = await evaluate(lockUrl, "attempt-3");
                          composedUrl = lockUrl;
                          faceCount = e3.faceCount;
                          humanCount = e3.humanCount;
                          identityFailure = e3.identity;
                          identityNotes = e3.notes;
                          identityMismatched = e3.mismatched ?? [];
                          anchorAttempts.push({
                            attempt: 3, mode: "face-lock",
                            identity: identityFailure ?? "ok",
                            faces: faceCount, humans: humanCount,
                            mismatched: identityMismatched,
                            at: new Date().toISOString(),
                          });
                        }
                      }
                    }
                  }
                  (scene as any).__anchorAttempts = anchorAttempts;
                }

                if (composedUrl) {
                  scene.referenceImageUrl = composedUrl;
                  if (!skipAuditPersist) {
                    // v170 — okFinal is cast-integrity only. Headcount diffs
                    // (extras/bystanders) are no longer failures.
                    const okFinal = identityFailure === null;
                    const auditMeta = {
                      anchor_face_audit: {
                        version: ANCHOR_AUDIT_VERSION,
                        detected: faceCount,
                        humans: humanCount,
                        expected: expectedFaces,
                        ok: okFinal,
                        identityFailure,
                        notes: identityNotes || undefined,
                        at: new Date().toISOString(),
                      },
                      // v131.6 — forensic trail per compose attempt.
                      anchor_attempts:
                        ((scene as any).__anchorAttempts as Array<Record<string, unknown>>) ?? [],
                    };
                    const { data: currentPlanRow } = await supabaseAdmin
                      .from("composer_scenes")
                      .select("audio_plan")
                      .eq("id", scene.id)
                      .maybeSingle();
                    const baseAudioPlan = ((currentPlanRow as any)
                      ?.audio_plan ??
                      (scene as any).audioPlan ??
                      {}) as Record<string, any>;
                    const {
                      faceMap: _staleFaceMap,
                      syncJobs: _staleSyncJobs,
                      heartbeat: _staleHeartbeat,
                      anchor_face_audit: _oldAnchorAudit,
                      anchor_attempts: _oldAnchorAttempts,
                      ...twoshotWithoutAnchorDerivedState
                    } = (baseAudioPlan.twoshot ?? {}) as Record<string, any>;
                    await supabaseAdmin
                      .from("composer_scenes")
                      .update({
                        reference_image_url: composedUrl,
                        updated_at: new Date().toISOString(),
                        audio_plan: {
                          ...baseAudioPlan,
                          twoshot: {
                            ...twoshotWithoutAnchorDerivedState,
                            ...auditMeta,
                          },
                        },
                      })
                      .eq("id", scene.id);
                  }
                  console.log(
                    `[compose-video-clips] cinematic-sync scene ${scene.id}: anchor pinned (faces=${faceCount ?? "?"}/${expectedFaces}, humans=${humanCount ?? "?"}/${expectedFaces}, identity=${identityFailure ?? "ok"}) → ${composedUrl.slice(0, 80)}…`,
                  );

                  // v170 — Hard-abort BEFORE Hailuo/Sync.so spend credits.
                  // Only true cast-integrity failures block: clone, swap, missing,
                  // ambiguous. "extra" reason and headcount-> checks are gone —
                  // bystanders, crowd, and depicted persons (screens/photos/
                  // mirrors) are allowed (Artlist parity).
                  const reasonMap: Record<string, string> = {
                    clone: "anchor_identity_duplicate_detected",
                    missing: "anchor_identity_missing_detected",
                    ambiguous: "anchor_identity_ambiguous",
                    swap: "anchor_identity_swap_detected",
                  };
                  if (identityFailure && identityFailure !== "extra") {
                    const code =
                      reasonMap[identityFailure] ?? "anchor_identity_failed";
                    const msg = `${code}: ${identityNotes || identityFailure} — Anchor wurde mehrfach neu gerendert und Cast-Integrität ist weiterhin nicht sauber (clone/swap/missing). Bitte "🎥 Clip + Lip-Sync neu rendern" drücken oder Charakter-Portraits prüfen.`;
                    await supabaseAdmin
                      .from("composer_scenes")
                      .update({
                        clip_status: "failed",
                        clip_error: msg,
                        updated_at: new Date().toISOString(),
                      })
                      .eq("id", scene.id);
                    results.push({
                      sceneId: scene.id,
                      status: "failed",
                      error: msg,
                    });
                    continue;
                  }
                }
              }
            }
          } catch (anchorErr) {
            console.warn(
              `[compose-video-clips] cinematic-sync scene ${scene.id}: multi-cast anchor safety net failed:`,
              anchorErr,
            );
          }
        } catch (extErr) {
          console.warn(
            `[compose-video-clips] Cinematic-Sync auto-extend failed for ${scene.id}:`,
            extErr,
          );
        }

        // ── v195 HARD-GUARD: cinematic-sync must have a composed anchor ────
        // Regressions kept slipping through when the anchor safety net threw
        // or when portraits were absent — the provider then rendered generic
        // strangers and the whole Sync.so pipeline chewed cycles on faces
        // that don't belong to any brand character. Fail loud here BEFORE
        // any provider credits are spent, so the user sees a clear error
        // instead of an "endless lip-sync".
        if (!scene.referenceImageUrl) {
          const msg =
            "cinematic_sync_anchor_missing: Für Cinematic-Sync konnte kein Charakter-Anchor komponiert werden (keine Portraits aufgelöst). Bitte einen Brand Character mit Portrait dem Cast zuweisen und erneut versuchen.";
          console.warn(
            `[compose-video-clips] scene ${scene.id}: v195_cinematic_sync_anchor_missing → hard-fail before provider dispatch`,
          );
          await supabaseAdmin
            .from("composer_scenes")
            .update({
              clip_status: "failed",
              clip_error: msg,
              twoshot_stage: "failed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", scene.id);
          results.push({ sceneId: scene.id, status: "failed", error: msg });
          continue;
        }
      }

      // ── Universal cast-anchor safety net (all i2v engines) ───────────────
      // Even outside cinematic-sync, if the scene has cast portraits and no
      // composed reference, Hailuo/Kling/Pika/Seedance/Luma/Wan/HappyHorse
      // will invent strangers. We pre-compose ALL cast portraits into a
      // scene-aware first frame via compose-scene-anchor and pin it as
      // reference_image_url so the provider locks identities.
      // Vidu uses subjectReferenceUrls[] instead → skip.
      // HeyGen has its own portrait flow → skip.
      // Skip if the user already pinned a reference manually.
      try {
        const engine = scene.engineOverride ?? "auto";
        const src = String(scene.clipSource ?? "");
        const isI2V = src.startsWith("ai-") && src !== "ai-vidu";
        const isHeygenRoute = false; // legacy HeyGen route removed; retained for readability.
        const isCinematicSync = engine === "cinematic-sync"; // already handled above
        const refUrl = String(scene.referenceImageUrl ?? "");
        const looksComposed =
          refUrl.includes("/scene-anchors/") ||
          refUrl.includes("/composer-anchors/");
        if (isI2V && !isHeygenRoute && !isCinematicSync && !refUrl) {
          const castShotsRaw = (scene.characterShots ?? []).filter(
            (s) => s && s.shotType !== "absent" && s.characterId,
          );
          // Also accept the legacy singular characterShot.
          if (
            castShotsRaw.length === 0 &&
            scene.characterShot &&
            scene.characterShot.shotType !== "absent"
          ) {
            castShotsRaw.push(scene.characterShot);
          }
          // ID-Only Cast Resolution (v200) — same logic as cinematic-sync
          // above: if dialog_turns are canonical for this scene, use IDs
          // directly. Otherwise fall back to script-slug fuzzy matching.
          const turnsForSceneUni = dialogTurnsByScene.get(scene.id);
          const scriptSpeakers = uniqueSpeakerSlugsFromScript(
            scene.dialogScript,
          );
          let castShots = castShotsRaw;
          if (turnsForSceneUni && turnsForSceneUni.length > 0) {
            const fromTurns = effectiveShotsFromTurns(
              turnsForSceneUni,
              castShotsRaw,
            );
            if (fromTurns && fromTurns.length >= 1) {
              castShots = fromTurns as typeof castShotsRaw;
              console.log(
                `[compose-video-clips] v200_id_only_cast (universal) scene=${scene.id} cast=[${castShots.map((s) => s.characterId).join(",")}] source=dialog_turns`,
              );
            }
          } else if (scriptSpeakers.length > 0) {
            const remapped = scriptSpeakers
              .map((slug) => resolveSpeakerToShot(slug, castShotsRaw))
              .filter(
                (
                  x,
                ): x is { characterId: string; shotType: CharacterShotType } =>
                  !!x,
              );
            if (remapped.length >= 1) castShots = remapped;
          }

          if (castShots.length >= 1 && !looksComposed) {
            // Outfit lookup — mirrors cinematic-sync (line 1232–1266).
            // Without this, a user-picked saved outfit (e.g. Roman armor)
            // is invisible to the universal anchor and the i2v provider
            // sees only the default portrait.
            const outfitLookIdsUni = castShots
              .map((cs) => (cs as any).outfitLookId)
              .filter((id): id is string => typeof id === "string" && id.length > 0);
            const outfitUrlByIdUni = new Map<string, string>();
            if (outfitLookIdsUni.length > 0) {
              try {
                const { data: outfitRows } = await supabaseAdmin
                  .from("avatar_outfit_looks")
                  .select("id, cover_url, front_url")
                  .in("id", outfitLookIdsUni);
                for (const row of outfitRows ?? []) {
                  const url = (row as any).cover_url || (row as any).front_url;
                  if (typeof url === "string" && url.length > 0) {
                    outfitUrlByIdUni.set(String((row as any).id), url);
                  }
                }
              } catch (e) {
                console.warn(
                  `[compose-video-clips] universal anchor scene ${scene.id}: outfit lookup failed`,
                  e,
                );
              }
            }
            const portraitsFromCast = castShots
              .map((cs) => {
                const outfitId = (cs as any).outfitLookId as string | undefined;
                const outfitUrl = outfitId ? outfitUrlByIdUni.get(outfitId) : undefined;
                return outfitUrl || charById.get(cs.characterId)?.referenceImageUrl;
              })
              .filter((u): u is string => typeof u === "string" && u.length > 0);
            // Identity refs — always the bare portrait (face-only ground truth)
            // so face-lock continues to work when the primary slot is an
            // outfit cover.
            const identityFromCast = castShots
              .map((cs) => charById.get(cs.characterId)?.referenceImageUrl)
              .filter((u): u is string => typeof u === "string" && u.length > 0);
            const wardrobeLockNamesUni = castShots
              .filter((cs) => {
                const id = (cs as any).outfitLookId as string | undefined;
                return id && outfitUrlByIdUni.has(id);
              })
              .map((cs) => charById.get(cs.characterId)?.name)
              .filter((n): n is string => typeof n === "string" && n.length > 0);
            // Phase C.1 — Continuity Auto-Lock: prepend the dialog-mode
            // continuity-lock frame (composed anchor of a previous same-cast
            // dialog scene) so Nano Banana 2 anchors the new composition to
            // the same Sarah/Matthew identity, wardrobe, and lighting.
            const lockRefUrl =
              scene.lockReferenceUrl && typeof scene.lockReferenceUrl === "string"
                ? scene.lockReferenceUrl.trim()
                : "";
            const portraitUrls = (
              lockRefUrl
                ? [lockRefUrl, ...portraitsFromCast.filter((u) => u !== lockRefUrl)]
                : portraitsFromCast
            ).slice(0, 4);
            const characterNames = castShots
              .map((cs) => charById.get(cs.characterId)?.name)
              .filter(
                (n): n is string => typeof n === "string" && n.length > 0,
              );
            if (portraitUrls.length >= 1) {
              const neutralFallback =
                portraitUrls.length >= 2
                  ? neutralTwoShotPrompt(characterNames, portraitUrls.length)
                  : "Natural cinematic scene, photorealistic, no rendered text.";
              const anchorPrompt =
                scriptSpeakers.length >= 2
                  ? neutralFallback
                  : stripDialogForAnchor(scene.aiPrompt || "") ||
                    neutralFallback;
              console.log(
                `[compose-video-clips] universal anchor for ${src} scene ${scene.id}: composing ${portraitUrls.length} portrait(s) (speakers=${scriptSpeakers.length}, outfits=${outfitUrlByIdUni.size}/${outfitLookIdsUni.length}${wardrobeLockNamesUni.length > 0 ? `, wardrobeLock=[${wardrobeLockNamesUni.join("/")}]` : ""})`,
              );
              try {
                const anchorResp = await fetch(
                  `${Deno.env.get("SUPABASE_URL")}/functions/v1/compose-scene-anchor`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: authHeader,
                    },
                    body: JSON.stringify({
                      sceneId: scene.id,
                      portraitUrl: portraitUrls[0],
                      portraitUrls,
                      identityPortraitUrls: identityFromCast.slice(0, portraitUrls.length),
                      characterNames,
                      scenePrompt: anchorPrompt,
                      aspectRatio: "16:9",
                      shotType: castShots[0]?.shotType,
                      wardrobeLock: wardrobeLockNamesUni.length > 0,
                      wardrobeLockNames: wardrobeLockNamesUni,
                    }),
                  },
                );
                if (anchorResp.ok) {
                  const aj = await anchorResp.json().catch(() => ({}));
                  if (aj?.composedUrl) {
                    scene.referenceImageUrl = aj.composedUrl;
                    // Phase C.1 — persist the freshly composed anchor as the
                    // dialog continuity-lock when:
                    //  - the scene is a dialog scene (has script), AND
                    //  - no lock is already set on this row.
                    // Future same-cast dialog scenes will inherit this via
                    // the client-side propagateDialogLock() helper.
                    const isDialogScene =
                      typeof scene.dialogScript === "string" &&
                      scene.dialogScript.trim().length > 0;
                    const updatePayload: Record<string, unknown> = {
                      reference_image_url: aj.composedUrl,
                      updated_at: new Date().toISOString(),
                    };
                    if (isDialogScene && !scene.lockReferenceUrl) {
                      updatePayload.lock_reference_url = aj.composedUrl;
                      scene.lockReferenceUrl = aj.composedUrl;
                    }
                    await supabaseAdmin
                      .from("composer_scenes")
                      .update(updatePayload)
                      .eq("id", scene.id);
                    console.log(
                      `[compose-video-clips] universal anchor scene ${scene.id}: composed → ${aj.composedUrl.slice(0, 80)}…${isDialogScene && updatePayload.lock_reference_url ? " (continuity-lock persisted)" : ""}`,
                    );
                  }
                } else {
                  const errTxt = await anchorResp.text().catch(() => "");
                  console.warn(
                    `[compose-video-clips] universal anchor scene ${scene.id}: compose-scene-anchor failed ${anchorResp.status} ${errTxt.slice(0, 200)}`,
                  );
                }

              } catch (anchorErr) {
                console.warn(
                  `[compose-video-clips] universal anchor scene ${scene.id} exception:`,
                  anchorErr,
                );
              }
            }
          }
        }
      } catch (universalAnchorErr) {
        console.warn(
          `[compose-video-clips] universal anchor outer failed for ${scene.id}:`,
          universalAnchorErr,
        );
      }

      // ── LEGACY HEYGEN / TALKING-HEAD ROUTE — REMOVED ─────────────────────
      // Previously `engineOverride === 'heygen'` (or a soft `auto + dialog +
      // cast` heuristic) routed Composer scenes to `generate-talking-head`,
      // which produced isolated portrait busts in the `talking-head-renders`
      // bucket instead of a real master plate + Sync.so lip-sync. That path
      // is gone.
      //
      // Any scene that carries `engineOverride === 'heygen'` is normalised
      // to Cinematic-Sync BEFORE this point (see the guard around L1157).
      // The standalone Talking-Head module (`/talking-head`) is unaffected —
      // only the Composer's auto-portrait dispatch was removed.
      try {
        if (scene.clipSource === "upload" && scene.uploadUrl) {

          // Upload: just mark as ready
          await supabaseAdmin
            .from("composer_scenes")
            .update({
              clip_url: scene.uploadUrl,
              clip_status: "ready",
              updated_at: new Date().toISOString(),
            })
            .eq("id", scene.id);
          results.push({
            sceneId: scene.id,
            status: "ready",
            clipUrl: scene.uploadUrl,
          });
        } else if (scene.clipSource === "stock" && scene.stockKeywords) {
          // Stock: search and pick best match
          const stockResponse = await fetch(
            `${supabaseUrl}/functions/v1/search-stock-videos`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ query: scene.stockKeywords, perPage: 5 }),
            },
          );

          const stockData = await stockResponse.json();
          const bestVideo = stockData.videos?.[0];

          if (bestVideo) {
            await supabaseAdmin
              .from("composer_scenes")
              .update({
                clip_url: bestVideo.url,
                clip_status: "ready",
                updated_at: new Date().toISOString(),
              })
              .eq("id", scene.id);
            results.push({
              sceneId: scene.id,
              status: "ready",
              clipUrl: bestVideo.url,
            });
          } else {
            await supabaseAdmin
              .from("composer_scenes")
              .update(failedClipUpdate(false))
              .eq("id", scene.id);
            results.push({
              sceneId: scene.id,
              status: "failed",
              error: "No stock videos found",
            });
          }
        } else if (scene.clipSource === "ai-hailuo") {
          // Hailuo via Replicate (Standard 768p / Pro 1080p)
          // STRICT: Hailuo only supports 6s or 10s buckets. Honour the user's
          // exact pick — only treat the scene as 10s when explicitly set to 10,
          // otherwise render 6s. Previously `>= 8 ? 10 : 6` silently rounded
          // 8s/9s scenes up to 10s and triggered Pro+10s API rejections.
          const duration = Number(scene.durationSeconds) === 10 ? 10 : 6;
          // Hailuo API constraint: 1080p is only accepted for 6s. 10s requires 768p.
          const resolution =
            duration === 10 ? "768p" : quality === "pro" ? "1080p" : "768p";
          if (quality === "pro" && duration === 10) {
            console.warn(
              `[compose-video-clips] Hailuo Pro+10s API-incompatible — downgrading resolution to 768p (Scene ${scene.id}).`,
            );
          }
          const isI2V = !!scene.referenceImageUrl;
          const isCinematicSyncScene =
            (scene.engineOverride ?? "auto") === "cinematic-sync" ||
            (scene.engineOverride ?? "auto") === "sync-segments";

          await supabaseAdmin
            .from("composer_scenes")
            .update({
              clip_status: "generating",
              clip_quality: quality,
              ...(isCinematicSyncScene
                ? {
                    lip_sync_source_clip_url: null,
                    lip_sync_status: "pending",
                    twoshot_stage: "master_clip",
                  }
                : {}),
              clip_lead_in_trim_seconds: computeLeadInTrim("ai-hailuo", isI2V),
              updated_at: new Date().toISOString(),
            })
            .eq("id", scene.id);

          const masterPrompt = isCinematicSyncScene
            ? buildCinematicSyncMasterPrompt(scene)
            : scene.aiPrompt;
          const masterNegative = isCinematicSyncScene
            ? `${negativeFor(isI2V, scene.negativePrompt)}${CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE}`
            : negativeFor(isI2V, scene.negativePrompt);
          const hailuoInput: Record<string, unknown> = {
            prompt: enrichPrompt(masterPrompt, undefined, isI2V),
            negative_prompt: masterNegative,
            duration: duration,
            resolution: resolution,
          };
          // Image-to-Video: use reference image as the first frame
          if (isI2V) {
            hailuoInput.first_frame_image = scene.referenceImageUrl;
            console.log(
              `[compose-video-clips] Hailuo scene ${scene.id} uses reference image (lead-in trim ${computeLeadInTrim("ai-hailuo", true)}s)`,
            );
          }

          const prediction = await replicate.predictions.create({
            model: "minimax/hailuo-2.3",
            input: hailuoInput,
            webhook: `${webhookUrl}&scene_id=${scene.id}&project_id=${projectId}`,
            webhook_events_filter: ["completed"],
          });

          await supabaseAdmin
            .from("composer_scenes")
            .update({
              replicate_prediction_id: prediction.id,
              ...(isCinematicSyncScene ? { twoshot_stage: "master_clip" } : {}),
            })
            .eq("id", scene.id);

          results.push({
            sceneId: scene.id,
            status: "generating",
            predictionId: prediction.id,
          });
        } else if (scene.clipSource === "ai-kling") {
          // Kling 3.0 Omni via Replicate — supports T2V, I2V, 3-15s
          const isI2V = !!scene.referenceImageUrl;
          await supabaseAdmin
            .from("composer_scenes")
            .update({
              clip_status: "generating",
              clip_quality: quality,
              clip_lead_in_trim_seconds: computeLeadInTrim("ai-kling", isI2V),
              updated_at: new Date().toISOString(),
            })
            .eq("id", scene.id);

          // Kling 3 Omni: Replicate accepts 3–15s. Snap to Toolkit-aligned buckets.
          const klingDuration = snapDuration(scene.durationSeconds, [3, 5, 8, 10, 15]);
          console.log(
            `[compose-video-clips] Kling scene ${scene.id}: requested ${scene.durationSeconds}s → snapped to ${klingDuration}s`,
          );
          const klingSpeakerCount = uniqueSpeakerSlugsFromScript(scene.dialogScript).length;
          const klingAntiCloneSuffix =
            "Exactly one instance of the selected character in one continuous frame. Single unbroken shot. No clones, no duplicate person, no triptych, no split-screen, no side-by-side variations, no mirror duplicate, no poster/photo/screen showing the same face as a second person.";
          const klingPrompt = klingSpeakerCount === 1
            ? `${scene.aiPrompt || "cinematic footage"}. ${klingAntiCloneSuffix}`
            : scene.aiPrompt;
          if (klingSpeakerCount === 1) {
            console.log(
              `[compose-video-clips] v182_kling_n1_anticlone scene=${scene.id} i2v=${isI2V}`,
            );
          }
          const klingInput: Record<string, unknown> = {
            prompt: enrichPrompt(klingPrompt, undefined, isI2V),
            duration: klingDuration,
            aspect_ratio: "16:9",
            mode: quality === "pro" ? "pro" : "standard",
            generate_audio: scene.withAudio !== false,
          };
          // Image-to-Video: optional start/end image
          if (isI2V) {
            klingInput.start_image = scene.referenceImageUrl;
            console.log(
              `[compose-video-clips] Kling scene ${scene.id} uses start_image (lead-in trim ${computeLeadInTrim("ai-kling", true)}s)`,
            );
          }

          if (scene.endReferenceImageUrl) {
            klingInput.end_image = scene.endReferenceImageUrl;
            console.log(
              `[compose-video-clips] Kling scene ${scene.id} uses end_image (backward extend / bridge)`,
            );
          }

          const prediction = await replicate.predictions.create({
            model: "kwaivgi/kling-v3-omni-video",
            input: klingInput,
            webhook: `${webhookUrl}&scene_id=${scene.id}&project_id=${projectId}`,
            webhook_events_filter: ["completed"],
          });

          await supabaseAdmin
            .from("composer_scenes")
            .update({
              replicate_prediction_id: prediction.id,
            })
            .eq("id", scene.id);

          results.push({
            sceneId: scene.id,
            status: "generating",
            predictionId: prediction.id,
          });
        } else if (scene.clipSource === "ai-image") {
          // AI Image (Gemini Nano Banana 2 / Pro) — synchronous, cheap (~€0.01)
          // Routed to dedicated edge function. The function uploads to
          // composer-uploads bucket and updates scene clip_url + status itself.
          await supabaseAdmin
            .from("composer_scenes")
            .update({
              clip_status: "generating",
              clip_quality: quality,
              updated_at: new Date().toISOString(),
            })
            .eq("id", scene.id);

          const enrichedPrompt = enrichPrompt(
            scene.aiPrompt,
            scene.characterShot,
          );

          const imgResp = await fetch(
            `${supabaseUrl}/functions/v1/generate-composer-image-scene`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: authHeader, // forward user JWT
              },
              body: JSON.stringify({
                projectId,
                sceneId: scene.id,
                prompt: enrichedPrompt,
                visualStyle,
                quality,
              }),
            },
          );

          if (!imgResp.ok) {
            const errBody = await imgResp.text();
            console.error(
              `[compose-video-clips] image scene ${scene.id} failed:`,
              imgResp.status,
              errBody,
            );
            await supabaseAdmin
              .from("composer_scenes")
              .update(
                failedClipUpdate(
                  (scene.engineOverride ?? "auto") === "cinematic-sync",
                  `Image generation failed (${imgResp.status})`,
                ),
              )
              .eq("id", scene.id);
            results.push({
              sceneId: scene.id,
              status: "failed",
              error: `Image generation failed (${imgResp.status})`,
            });
          } else {
            const imgData = await imgResp.json();
            results.push({
              sceneId: scene.id,
              status: "ready",
              clipUrl: imgData.clipUrl,
            });
          }
        } else if (scene.clipSource === "ai-wan") {
          // Wan 2.5 via Replicate — supports i2v when reference image present
          const isI2V = !!scene.referenceImageUrl;
          await supabaseAdmin
            .from("composer_scenes")
            .update({
              clip_status: "generating",
              clip_quality: quality,
              clip_lead_in_trim_seconds: computeLeadInTrim("ai-wan", isI2V),
              updated_at: new Date().toISOString(),
            })
            .eq("id", scene.id);

          const wanModel = isI2V
            ? "wan-video/wan-2.5-i2v"
            : "wan-video/wan-2.5-t2v";
          // Wan 2.5 only supports 5 or 10 seconds — snap to nearest allowed value
          const wanDuration = snapDuration(scene.durationSeconds, [5, 10]);
          const wanInput: Record<string, unknown> = {
            prompt: enrichPrompt(scene.aiPrompt, undefined, isI2V),
            negative_prompt: negativeFor(isI2V, scene.negativePrompt),
            duration: wanDuration,
            aspect_ratio: "16:9",
            resolution: quality === "pro" ? "1080p" : "720p",
          };
          console.log(
            `[compose-video-clips] Wan scene ${scene.id}: requested ${scene.durationSeconds}s → snapped to ${wanDuration}s`,
          );
          if (isI2V) {
            wanInput.image = scene.referenceImageUrl;
            console.log(
              `[compose-video-clips] Wan scene ${scene.id} uses i2v reference (lead-in trim ${computeLeadInTrim("ai-wan", true)}s)`,
            );
          }

          const prediction = await replicate.predictions.create({
            model: wanModel,
            input: wanInput,
            webhook: `${webhookUrl}&scene_id=${scene.id}&project_id=${projectId}`,
            webhook_events_filter: ["completed"],
          });

          await supabaseAdmin
            .from("composer_scenes")
            .update({ replicate_prediction_id: prediction.id })
            .eq("id", scene.id);

          results.push({
            sceneId: scene.id,
            status: "generating",
            predictionId: prediction.id,
          });
        } else if (scene.clipSource === "ai-seedance") {
          // Seedance 1 Lite via Replicate
          const isI2V = !!scene.referenceImageUrl;
          await supabaseAdmin
            .from("composer_scenes")
            .update({
              clip_status: "generating",
              clip_quality: quality,
              clip_lead_in_trim_seconds: computeLeadInTrim(
                "ai-seedance",
                isI2V,
              ),
              updated_at: new Date().toISOString(),
            })
            .eq("id", scene.id);

          // Seedance Lite supports 5/8/10/12s (Toolkit ground-truth) — snap to nearest.
          const seedDuration = snapDuration(scene.durationSeconds, [5, 8, 10, 12]);
          const seedInput: Record<string, unknown> = {
            prompt: enrichPrompt(scene.aiPrompt, undefined, isI2V),
            duration: seedDuration,
            aspect_ratio: "16:9",
            resolution: quality === "pro" ? "1080p" : "720p",
          };
          console.log(
            `[compose-video-clips] Seedance scene ${scene.id}: requested ${scene.durationSeconds}s → snapped to ${seedDuration}s`,
          );
          if (isI2V) {
            seedInput.image = scene.referenceImageUrl;
            console.log(
              `[compose-video-clips] Seedance scene ${scene.id} uses i2v reference (lead-in trim ${computeLeadInTrim("ai-seedance", true)}s)`,
            );
          }

          const prediction = await replicate.predictions.create({
            model: "bytedance/seedance-1-lite",
            input: seedInput,
            webhook: `${webhookUrl}&scene_id=${scene.id}&project_id=${projectId}`,
            webhook_events_filter: ["completed"],
          });

          await supabaseAdmin
            .from("composer_scenes")
            .update({ replicate_prediction_id: prediction.id })
            .eq("id", scene.id);

          results.push({
            sceneId: scene.id,
            status: "generating",
            predictionId: prediction.id,
          });
        } else if (scene.clipSource === "ai-luma") {
          // Luma Ray 2 via Replicate — supports start_image
          const isI2V = !!scene.referenceImageUrl;
          await supabaseAdmin
            .from("composer_scenes")
            .update({
              clip_status: "generating",
              clip_quality: quality,
              clip_lead_in_trim_seconds: computeLeadInTrim("ai-luma", isI2V),
              updated_at: new Date().toISOString(),
            })
            .eq("id", scene.id);

          // Luma Ray 2 only supports 5 or 9 seconds — snap to nearest allowed value
          const lumaDuration = snapDuration(scene.durationSeconds, [5, 9]);
          const lumaInput: Record<string, unknown> = {
            prompt: enrichPrompt(scene.aiPrompt, undefined, isI2V),
            duration: lumaDuration,
            aspect_ratio: "16:9",
          };
          console.log(
            `[compose-video-clips] Luma scene ${scene.id}: requested ${scene.durationSeconds}s → snapped to ${lumaDuration}s`,
          );
          if (isI2V) {
            lumaInput.start_image = scene.referenceImageUrl;
            console.log(
              `[compose-video-clips] Luma scene ${scene.id} uses start_image keyframe (lead-in trim ${computeLeadInTrim("ai-luma", true)}s)`,
            );
          }
          if (scene.endReferenceImageUrl) {
            lumaInput.end_image = scene.endReferenceImageUrl;
            console.log(
              `[compose-video-clips] Luma scene ${scene.id} uses end_image keyframe (backward extend / bridge)`,
            );
          }

          const prediction = await replicate.predictions.create({
            model: "luma/ray-2-720p",
            input: lumaInput,
            webhook: `${webhookUrl}&scene_id=${scene.id}&project_id=${projectId}`,
            webhook_events_filter: ["completed"],
          });

          await supabaseAdmin
            .from("composer_scenes")
            .update({ replicate_prediction_id: prediction.id })
            .eq("id", scene.id);

          results.push({
            sceneId: scene.id,
            status: "generating",
            predictionId: prediction.id,
          });
        } else if (scene.clipSource === "ai-veo") {
          // Google Veo 3.1 via Replicate — native audio
          // standard → google/veo-3.1-fast (Lite, $0.05/s 720p) | pro → google/veo-3.1 (Premium 1080p, $0.40/s)
          const isI2V = !!scene.referenceImageUrl;
          await supabaseAdmin
            .from("composer_scenes")
            .update({
              clip_status: "generating",
              clip_quality: quality,
              clip_lead_in_trim_seconds: computeLeadInTrim("ai-veo", isI2V),
              updated_at: new Date().toISOString(),
            })
            .eq("id", scene.id);

          const veoModel =
            quality === "pro" ? "google/veo-3.1" : "google/veo-3.1-fast";
          const veoResolution = quality === "pro" ? "1080p" : "720p";
          // Veo accepts 4 / 6 / 8 second clips — snap to nearest allowed bucket
          const veoDuration = snapDuration(scene.durationSeconds, [4, 6, 8]);
          console.log(
            `[compose-video-clips] Veo scene ${scene.id}: requested ${scene.durationSeconds}s → snapped to ${veoDuration}s`,
          );

          const veoInput: Record<string, unknown> = {
            prompt: enrichPrompt(scene.aiPrompt, undefined, isI2V),
            duration: veoDuration,
            aspect_ratio: "16:9",
            resolution: veoResolution,
            generate_audio: scene.withAudio !== false,
          };
          if (isI2V) {
            veoInput.image = scene.referenceImageUrl;
            console.log(
              `[compose-video-clips] Veo scene ${scene.id} uses i2v reference (${veoModel}, lead-in trim ${computeLeadInTrim("ai-veo", true)}s)`,
            );
          }

          const prediction = await replicate.predictions.create({
            model: veoModel,
            input: veoInput,
            webhook: `${webhookUrl}&scene_id=${scene.id}&project_id=${projectId}`,
            webhook_events_filter: ["completed"],
          });

          await supabaseAdmin
            .from("composer_scenes")
            .update({ replicate_prediction_id: prediction.id })
            .eq("id", scene.id);

          results.push({
            sceneId: scene.id,
            status: "generating",
            predictionId: prediction.id,
          });
        } else if (scene.clipSource === "ai-runway") {
          // Runway Gen-4 Aleph — V2V only. Requires a reference VIDEO (not image).
          // Composer convention: scene.uploadUrl OR a previously rendered scene clipUrl
          // can serve as the reference. We accept uploadUrl here as the V2V source.
          const referenceVideoUrl = scene.uploadUrl;
          if (!referenceVideoUrl) {
            console.warn(
              `[compose-video-clips] Runway scene ${scene.id} has no reference video — falling back to ai-hailuo.`,
            );
            scene.clipSource = "ai-hailuo";
            await supabaseAdmin
              .from("composer_scenes")
              .update({
                clip_source: "ai-hailuo",
                updated_at: new Date().toISOString(),
              })
              .eq("id", scene.id);
            // Re-route this scene to Hailuo by inserting a synthetic Hailuo call
            const fallbackDuration = scene.durationSeconds >= 8 ? 10 : 6;
            const fallbackPred = await replicate.predictions.create({
              model: "minimax/hailuo-2.3",
              input: {
                prompt: enrichPrompt(scene.aiPrompt, undefined, false),
                negative_prompt: negativeFor(false, scene.negativePrompt),
                duration: fallbackDuration,
                resolution: "768p",
              },
              webhook: `${webhookUrl}&scene_id=${scene.id}&project_id=${projectId}`,
              webhook_events_filter: ["completed"],
            });
            await supabaseAdmin
              .from("composer_scenes")
              .update({
                clip_status: "generating",
                clip_quality: "standard",
                replicate_prediction_id: fallbackPred.id,
              })
              .eq("id", scene.id);
            results.push({
              sceneId: scene.id,
              status: "generating",
              predictionId: fallbackPred.id,
            });
            continue;
          }

          await supabaseAdmin
            .from("composer_scenes")
            .update({
              clip_status: "generating",
              clip_quality: quality,
              updated_at: new Date().toISOString(),
            })
            .eq("id", scene.id);

          const runwayDuration = scene.durationSeconds >= 8 ? 10 : 5;
          const runwayResp = await fetch(
            `${supabaseUrl}/functions/v1/generate-runway-video`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: authHeader,
              },
              body: JSON.stringify({
                prompt: enrichPrompt(scene.aiPrompt, undefined, true),
                model: "runway-gen4-aleph",
                duration: runwayDuration,
                aspectRatio: "16:9",
                referenceVideoUrl,
              }),
            },
          );

          if (!runwayResp.ok) {
            const errBody = await runwayResp.text();
            console.error(
              `[compose-video-clips] Runway scene ${scene.id} failed:`,
              runwayResp.status,
              errBody,
            );
            await supabaseAdmin
              .from("composer_scenes")
              .update(
                failedClipUpdate(
                  (scene.engineOverride ?? "auto") === "cinematic-sync",
                  `Runway ${runwayResp.status}`,
                ),
              )
              .eq("id", scene.id);
            results.push({
              sceneId: scene.id,
              status: "failed",
              error: `Runway ${runwayResp.status}`,
            });
          } else {
            const runwayData = await runwayResp.json();
            // Runway is async-polled in its own edge function; the composer
            // webhook isn't called. Mark as generating; user polls scene later
            // via the regular ai_video_generations status pipeline.
            await supabaseAdmin
              .from("composer_scenes")
              .update({
                replicate_prediction_id:
                  runwayData.taskId ?? runwayData.generationId,
                updated_at: new Date().toISOString(),
              })
              .eq("id", scene.id);
            results.push({
              sceneId: scene.id,
              status: "generating",
              predictionId: runwayData.taskId,
            });
          }
        } else if (scene.clipSource === "ai-pika") {
          // Pika 2.2 via Replicate — supports T2V + I2V (Pikaframes via end_image)
          const isI2V = !!scene.referenceImageUrl;
          await supabaseAdmin
            .from("composer_scenes")
            .update({
              clip_status: "generating",
              clip_quality: quality,
              clip_lead_in_trim_seconds: computeLeadInTrim("ai-pika", isI2V),
              updated_at: new Date().toISOString(),
            })
            .eq("id", scene.id);

          const pikaDuration = snapDuration(scene.durationSeconds, [5, 10]);
          const pikaResp = await fetch(
            `${supabaseUrl}/functions/v1/generate-pika-video`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: authHeader,
              },
              body: JSON.stringify({
                prompt: enrichPrompt(scene.aiPrompt, undefined, isI2V),
                model: quality === "pro" ? "pika-2-2-pro" : "pika-2-2-standard",
                duration: pikaDuration,
                aspectRatio: "16:9",
                startImageUrl: scene.referenceImageUrl,
                endImageUrl: scene.endReferenceImageUrl,
              }),
            },
          );

          if (!pikaResp.ok) {
            const errBody = await pikaResp.text();
            console.error(
              `[compose-video-clips] Pika scene ${scene.id} failed:`,
              pikaResp.status,
              errBody,
            );
            await supabaseAdmin
              .from("composer_scenes")
              .update(
                failedClipUpdate(
                  (scene.engineOverride ?? "auto") === "cinematic-sync",
                  `Pika ${pikaResp.status}`,
                ),
              )
              .eq("id", scene.id);
            results.push({
              sceneId: scene.id,
              status: "failed",
              error: `Pika ${pikaResp.status}`,
            });
          } else {
            const pikaData = await pikaResp.json();
            await supabaseAdmin
              .from("composer_scenes")
              .update({
                replicate_prediction_id:
                  pikaData.predictionId ?? pikaData.generationId,
                updated_at: new Date().toISOString(),
              })
              .eq("id", scene.id);
            results.push({
              sceneId: scene.id,
              status: "generating",
              predictionId: pikaData.predictionId,
            });
          }
        } else if (scene.clipSource === "ai-happyhorse") {
          // HappyHorse 1.0 (Alibaba) via Replicate — direct call so the
          // composer-specific webhook fires and updates composer_scenes.
          // (Going through generate-happyhorse-video would only update the
          // toolkit's ai_video_generations table, leaving the scene stuck.)
          const isI2V = !!scene.referenceImageUrl;
          const isCinematicSyncHH =
            (scene.engineOverride ?? "auto") === "cinematic-sync";

          // v174 (Jun 30 2026) — RESPECT USER PROVIDER CHOICE.
          // Previously HH+cinematic-sync without composed anchor was silently
          // migrated to ai-hailuo. That changed the visible provider and kept
          // the original duration, so user-picked 7s/8s HH scenes then failed
          // on the next click with `invalid_duration_for_provider` 400 —
          // surfacing as the generic "Edge Function returned a non-2xx status
          // code" toast. Now we fail loudly with an actionable message and
          // KEEP clip_source on ai-happyhorse so the UI doesn't lie.
          if (isCinematicSyncHH && !isI2V) {
            const msg =
              "happyhorse_cinematic_sync_missing_anchor: HappyHorse Lip-Sync braucht einen Scene-Anchor (Cast-Portrait). Bitte mindestens einen Charakter mit Portrait dem Cast hinzufügen oder Engine auf Standard wechseln. HappyHorse wurde NICHT auf Hailuo umgestellt — deine Auswahl bleibt erhalten.";
            console.warn(
              `[compose-video-clips] HappyHorse Cinematic-Sync scene ${scene.id} — no composed reference_image_url, failing loud (v174, no silent Hailuo migration).`,
            );
            await supabaseAdmin
              .from("composer_scenes")
              .update({
                clip_status: "failed",
                clip_error: msg,
                updated_at: new Date().toISOString(),
              })
              .eq("id", scene.id);
            results.push({
              sceneId: scene.id,
              status: "failed",
              error: msg,
            });
            continue;
          }



          await supabaseAdmin
            .from("composer_scenes")
            .update({
              clip_status: "generating",
              clip_quality: quality,
              ...(isCinematicSyncHH
                ? {
                    lip_sync_source_clip_url: null,
                    lip_sync_status: "pending",
                    twoshot_stage: "master_clip",
                    dialog_shots: null,
                    replicate_prediction_id: null,
                    lip_sync_applied_at: null,
                  }
                : {}),
              clip_lead_in_trim_seconds: computeLeadInTrim(
                "ai-happyhorse",
                isI2V,
              ),
              updated_at: new Date().toISOString(),
            })
            .eq("id", scene.id);

          const hhDuration = Math.min(
            15,
            Math.max(3, Math.round(scene.durationSeconds)),
          );
          const hhResolution = quality === "pro" ? "1080p" : "720p";
          const hhPromptRaw = isCinematicSyncHH
            ? buildCinematicSyncMasterPrompt(scene)
            : scene.aiPrompt;
          // Pre-submit Green-Net sanitation: strip [SceneAction]/[Dialog]
          // tags, dark-bedroom/3-AM/laptop-screen triggers, duplicates.
          // The Alibaba content filter rejects raw prompts with these
          // tokens BEFORE GPU spend (DataInspectionFailed).
          const hhSan = sanitizeForHappyHorse(String(hhPromptRaw ?? ""));
          const hhCleanPrompt = hhSan.emptied ? String(hhPromptRaw ?? "") : hhSan.clean;
          if (hhSan.touched.length > 0) {
            console.log(
              `[compose-video-clips] HappyHorse scene ${scene.id} green-net sanitized: ${hhSan.touched.join(", ")}`,
            );
            // Persist cleaned prompt so the UI reflects what was actually
            // sent and future retries don't re-trigger Green-Net.
            try {
              await supabaseAdmin
                .from("composer_scenes")
                .update({ ai_prompt: hhCleanPrompt })
                .eq("id", scene.id);
            } catch (_e) { /* non-fatal */ }
          }
          const hhInput: Record<string, unknown> = {
            prompt: enrichPrompt(hhCleanPrompt, undefined, isI2V),
            duration: hhDuration,
            resolution: hhResolution,
            seed: Math.floor(Math.random() * 2_147_483_647),
          };
          if (isI2V) {
            hhInput.image = scene.referenceImageUrl;
            console.log(
              `[compose-video-clips] HappyHorse scene ${scene.id} uses image (lead-in trim ${computeLeadInTrim("ai-happyhorse", true)}s, cinematic-sync=${isCinematicSyncHH})`,
            );
          } else {
            hhInput.aspect_ratio = "16:9";
          }

          const prediction = await replicate.predictions.create({
            model: "alibaba/happyhorse-1.0",
            input: hhInput,
            webhook: `${webhookUrl}&scene_id=${scene.id}&project_id=${projectId}`,
            webhook_events_filter: ["completed"],
          });

          await supabaseAdmin
            .from("composer_scenes")
            .update({ replicate_prediction_id: prediction.id })
            .eq("id", scene.id);

          results.push({
            sceneId: scene.id,
            status: "generating",
            predictionId: prediction.id,
          });
        } else {
          // Unknown source, skip
          results.push({
            sceneId: scene.id,
            status: "skipped",
            error: `Unknown clip source: ${scene.clipSource}`,
          });
        }
      } catch (sceneError) {
        const errMsg = errorToString(sceneError);
        console.error(`[compose-video-clips] Scene ${scene.id} error:`, errMsg);
        await supabaseAdmin
          .from("composer_scenes")
          .update(
            failedClipUpdate(
              (scene.engineOverride ?? "auto") === "cinematic-sync",
              errMsg,
            ),
          )
          .eq("id", scene.id);
        results.push({ sceneId: scene.id, status: "failed", error: errMsg });
      }
    }

    // Deduct credits for AI scenes that started generating (video) OR
    // synchronously completed (ai-image returns status='ready' immediately).
    const billableResults = results.filter((r) => {
      if (r.status !== "generating" && r.status !== "ready") return false;
      const scene = scenes.find((s) => s.id === r.sceneId);
      return scene?.clipSource.startsWith("ai-");
    });
    const generatingCount = results.filter(
      (r) => r.status === "generating",
    ).length;
    let actualCost = 0;
    for (const r of billableResults) {
      const scene = scenes.find((s) => s.id === r.sceneId);
      if (!scene) continue;
      const q: Quality = scene.clipQuality === "pro" ? "pro" : "standard";
      actualCost +=
        scene.durationSeconds * (CLIP_COSTS[scene.clipSource]?.[q] ?? 0);
    }

    if (billableResults.length > 0 && actualCost > 0) {
      try {
        await supabaseAdmin.rpc("deduct_ai_video_credits", {
          p_user_id: user.id,
          p_amount: actualCost,
          p_generation_id: projectId,
        });
        console.log(
          `[compose-video-clips] Deducted €${actualCost.toFixed(2)} for ${billableResults.length} AI scenes (${generatingCount} async)`,
        );
      } catch (creditErr) {
        console.error(
          "[compose-video-clips] Credit deduction failed:",
          creditErr,
        );
      }
    }

    // Check if all scenes are already done (stock/upload only)
    const allDone = results.every(
      (r) => r.status === "ready" || r.status === "skipped",
    );
    if (allDone) {
      await supabaseAdmin
        .from("composer_projects")
        .update({ status: "preview", updated_at: new Date().toISOString() })
        .eq("id", projectId);
    }
    }; // end processScenes()

    // Kick off the heavy per-scene work in the background and return
    // immediately. The supabase-js client therefore never times out, the UI
    // keeps showing 'generating' (we pre-marked the DB above), and the user
    // sees the pipeline bar move while compose/dispatch run server-side.
    // @ts-ignore — EdgeRuntime is a Deno Deploy global on Supabase Edge
    if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(
        processScenes().catch((err) => {
          console.error(
            "[compose-video-clips] background processScenes failed:",
            err instanceof Error ? err.message : String(err),
          );
        }),
      );
    } else {
      // Local dev fallback — run inline.
      await processScenes();
    }

    return new Response(
      JSON.stringify({
        success: true,
        async: true,
        results: optimisticResults,
        generatingCount: optimisticResults.filter((r) => r.status === "generating").length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error(
      `[compose-video-clips] FATAL @ stage=${__stage}: ${msg}`,
      stack || "",
    );
    // Try to flip any scenes the client sent into a visible `failed` state so
    // the UI doesn't sit on `pending`/`generating` forever. Best-effort only —
    // if even the body parse failed we just return the error JSON.
    let failedSceneIds: string[] = [];
    try {
      failedSceneIds = (__parsedBody?.scenes ?? [])
        .map((s) => s?.id)
        .filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id));
      if (failedSceneIds.length > 0) {
        const adminUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        if (adminUrl && adminKey) {
          const admin = createClient(adminUrl, adminKey);
          const cinematicFailedSceneIds = (__parsedBody?.scenes ?? [])
            .filter((s) => s?.engineOverride === "cinematic-sync")
            .map((s) => s?.id)
            .filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id));
          await admin
            .from("composer_scenes")
            .update({
              clip_status: "failed",
              clip_error: `[${__stage}] ${msg}`.slice(0, 500),
              updated_at: new Date().toISOString(),
            })
            .in("id", failedSceneIds);
          if (cinematicFailedSceneIds.length > 0) {
            await admin
              .from("composer_scenes")
              .update({
                lip_sync_status: null,
                twoshot_stage: null,
                lip_sync_source_clip_url: null,
                dialog_shots: null,
                updated_at: new Date().toISOString(),
              })
              .in("id", cinematicFailedSceneIds);
          }
        }
      }
    } catch (markErr) {
      console.warn(
        "[compose-video-clips] post-fatal scene-mark failed:",
        markErr,
      );
    }
    // Return HTTP 200 with `ok:false` so supabase-js doesn't bury the message
    // behind a generic "Edge Function returned a non-2xx status code". The
    // client (useSceneGenerate / useGenerateAllClips / ClipsTab) reads
    // `data.ok === false` and surfaces `data.error` directly in the toast.
    return new Response(
      JSON.stringify({
        ok: false,
        success: false,
        error: msg || "Unknown error",
        message: msg || "Unknown error",
        code: "INTERNAL",
        stage: __stage,
        results: failedSceneIds.map((id) => ({
          sceneId: id,
          status: "failed",
          error: msg,
        })),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
