// compose-video-clips v2.3.0 — duration snap for Luma/Wan/Seedance
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/** Snap an arbitrary duration (seconds) to the nearest provider-allowed discrete value. */
function snapDuration(seconds: number, allowed: number[]): number {
  return allowed.reduce((best, val) =>
    Math.abs(val - seconds) < Math.abs(best - seconds) ? val : best
  , allowed[0]);
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

type Quality = 'standard' | 'pro';

// Cost per second by source × quality tier — synced with client (src/types/video-composer.ts)
const CLIP_COSTS: Record<string, Record<Quality, number>> = {
  'ai-hailuo':   { standard: 0.15, pro: 0.20 },
  'ai-kling':    { standard: 0.15, pro: 0.21 },
  'ai-sora':     { standard: 0.25, pro: 0.53 },
  'ai-wan':      { standard: 0.10, pro: 0.18 },
  'ai-seedance': { standard: 0.12, pro: 0.20 },
  'ai-luma':     { standard: 0.20, pro: 0.32 },
  'ai-veo':      { standard: 0.20, pro: 1.40 },
  'ai-runway':   { standard: 0.15, pro: 0.15 },
  'ai-pika':     { standard: 0.10, pro: 0.18 },
  'ai-image':    { standard: 0.01, pro: 0.015 },
};

interface ComposerCharacter {
  id: string;
  name: string;
  appearance: string;
  signatureItems: string;
}

type CharacterShotType = 'full' | 'profile' | 'back' | 'detail' | 'pov' | 'silhouette' | 'absent';

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
  characterShot?: { characterId: string; shotType: CharacterShotType };
  /** When false → request muted output (Veo/Kling generate_audio=false; Sora muted at stitch). Default true. */
  withAudio?: boolean;
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

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body: ClipRequest = await req.json();
    const { projectId, scenes, visualStyle, characters } = body;

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "MISSING_PROJECT_ID", message: "projectId is required — project must be saved before clips can be generated" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!scenes?.length) {
      return new Response(
        JSON.stringify({ error: "MISSING_SCENES", message: "At least one scene is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify project ownership
    const { data: project, error: projError } = await supabaseAdmin
      .from('composer_projects')
      .select('id, user_id, status')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (projError || !project) {
      return new Response(
        JSON.stringify({ error: "PROJECT_NOT_FOUND", message: "Project not found or you don't have access to it" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate total cost for AI scenes (quality-tier aware)
    const aiScenes = scenes.filter(s => s.clipSource.startsWith('ai-'));
    let totalCost = 0;
    for (const scene of aiScenes) {
      const quality: Quality = scene.clipQuality === 'pro' ? 'pro' : 'standard';
      const costPerSec = CLIP_COSTS[scene.clipSource]?.[quality] ?? 0.15;
      totalCost += scene.durationSeconds * costPerSec;
    }

    // Check wallet if AI scenes exist
    if (aiScenes.length > 0) {
      const { data: wallet } = await supabaseAdmin
        .from('ai_video_wallets')
        .select('balance_euros, currency')
        .eq('user_id', user.id)
        .single();

      if (!wallet) {
        return new Response(
          JSON.stringify({ error: "No AI Video wallet found", code: "NO_WALLET", needsPurchase: true }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (wallet.balance_euros < totalCost) {
        return new Response(
          JSON.stringify({
            error: `Insufficient credits. Need €${totalCost.toFixed(2)}, have €${wallet.balance_euros.toFixed(2)}`,
            code: "INSUFFICIENT_CREDITS", needsPurchase: true,
            required: totalCost, available: wallet.balance_euros
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Update project status
    await supabaseAdmin
      .from('composer_projects')
      .update({ status: 'generating', updated_at: new Date().toISOString() })
      .eq('id', projectId);

    const replicate = new Replicate({ auth: Deno.env.get("REPLICATE_API_KEY") });
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const webhookUrl = `${supabaseUrl}/functions/v1/compose-clip-webhook`;

    // IMPORTANT: We do NOT append negative words to the positive prompt.
    // Diffusion video models (Hailuo, Kling) treat words like "text", "captions",
    // "logos" as concepts to render, even when prefixed with "no". Instead we use
    // the dedicated `negative_prompt` API parameter (see hailuoInput / klingInput).
    // The positive prompt only carries a short positive cue.
    const NEGATIVE_PROMPT_PARAM = "text, captions, subtitles, watermark, logo, typography, written words, letters, signs with readable text, UI overlay, lower thirds, isolated product, plain white background, floating product, rotating product, blurry, low quality";
    // Extra negatives applied ONLY when a reference image is supplied (i2v).
    // i2v models tend to hold the reference image static for the first 3-12 frames
    // before motion kicks in. These tokens push the model to start motion at frame 1.
    const NEGATIVE_PROMPT_I2V_EXTRA = ", static first frame, frozen opening, still image hold at start, motionless beginning, freeze frame intro";
    const POSITIVE_CLEAN_CUE = ", clean cinematic composition, natural environment";
    // Positive cue appended ONLY for i2v requests — biases the model toward
    // immediate camera movement so the reference image doesn't appear as a still.
    const POSITIVE_I2V_MOTION_CUE = ", motion already in progress from frame one, immediate camera movement, no static opening frame";
    const STYLE_HINT = getVisualStyleHint(visualStyle);

    // Build a quick character lookup for the safety-net injection
    const charById = new Map<string, ComposerCharacter>();
    (characters || []).forEach(c => { if (c?.id) charById.set(c.id, c); });

    /** Inject character description based on shotType (Sherlock-Holmes anchor). */
    const injectCharacter = (prompt: string, shot?: { characterId: string; shotType: CharacterShotType }): string => {
      if (!shot || !shot.characterId || shot.shotType === 'absent') return prompt;
      const char = charById.get(shot.characterId);
      if (!char) return prompt;
      const appearance = (char.appearance || '').trim();
      const items = (char.signatureItems || '').trim();
      let prefix = '';
      // Skip if the prompt already contains the signatureItems verbatim
      const lowerPrompt = prompt.toLowerCase();
      const itemsProbe = items.slice(0, 30).toLowerCase();
      const appearanceProbe = appearance.slice(0, 30).toLowerCase();
      const hasItems = items && lowerPrompt.includes(itemsProbe);
      const hasAppearance = appearance && lowerPrompt.includes(appearanceProbe);
      switch (shot.shotType) {
        case 'full':
          if (!hasAppearance && appearance) prefix += appearance + ', ';
          if (!hasItems && items) prefix += 'wearing ' + items + ', ';
          break;
        case 'profile':
        case 'back':
        case 'silhouette':
        case 'detail':
        case 'pov':
          if (!hasItems && items) prefix += items + ', ';
          break;
      }
      return prefix ? prefix + prompt : prompt;
    };

    const enrichPrompt = (prompt?: string, shot?: { characterId: string; shotType: CharacterShotType }, isImageToVideo = false): string => {
      const base = (prompt || "cinematic footage").trim();
      const withChar = injectCharacter(base, shot);
      // Strip any old "no on-screen text..." negative suffix that the wizard/storyboard
      // may have appended — those words trigger the very thing we want to avoid.
      let result = withChar.replace(/,?\s*no on-screen text[\s\S]*$/i, "").trim().replace(/[,.]\s*$/, "");
      const lower = result.toLowerCase();
      if (STYLE_HINT) {
        const probe = STYLE_HINT.replace(/^,\s*/, "").slice(0, 30).toLowerCase();
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
      return result;
    };
    const negativeFor = (isImageToVideo: boolean, sceneNegative?: string): string => {
      const base = isImageToVideo ? (NEGATIVE_PROMPT_PARAM + NEGATIVE_PROMPT_I2V_EXTRA) : NEGATIVE_PROMPT_PARAM;
      const extra = (sceneNegative || '').trim();
      if (!extra) return base;
      // De-dup: only append phrases that aren't already covered by base.
      const baseLower = base.toLowerCase();
      const extras = extra
        .split(/,\s*/)
        .map((s) => s.trim())
        .filter((s) => s && !baseLower.includes(s.toLowerCase()));
      return extras.length > 0 ? `${base}, ${extras.join(', ')}` : base;
    };

    // Provider-specific lead-in trim defaults (seconds). i2v models hold the
    // reference image static for a few frames before motion starts — these
    // values are cut from the start of the clip during preview & stitching.
    // Calibrated conservatively so we never cut into real motion.
    const I2V_TRIM_DEFAULTS: Record<string, number> = {
      'ai-hailuo': 0.25,
      'ai-kling': 0.15,
      'ai-wan': 0.20,
      'ai-seedance': 0.15,
      'ai-luma': 0.10,
      'ai-veo': 0.10,
      'ai-sora': 0.15,
      'ai-pika': 0.20,
    };
    const computeLeadInTrim = (clipSource: string, hasReference: boolean): number =>
      hasReference ? (I2V_TRIM_DEFAULTS[clipSource] ?? 0) : 0;


    const results: Array<{ sceneId: string; status: string; predictionId?: string; clipUrl?: string; error?: string }> = [];

    // Helper: extract a useful error message from Replicate / generic errors
    const errorToString = (err: unknown): string => {
      if (!err) return 'Unknown error';
      if (err instanceof Error) {
        // Replicate errors often have .response.data with details
        const anyErr = err as any;
        const detail = anyErr?.response?.data?.detail || anyErr?.response?.data?.error || anyErr?.response?.statusText;
        if (detail) return `${err.message} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
        return err.message;
      }
      try { return JSON.stringify(err); } catch { return String(err); }
    };

    // Engines that compose-video-clips actually implements. Anything outside
    // this set (e.g. legacy 'ai-sora' after the OpenAI Sunset 2026) gets
    // normalized to a working default so an upstream planner (Auto-Director,
    // manual choice) can never leave a scene stranded in 'pending' forever.
    const SUPPORTED_AI_SOURCES = new Set([
      'ai-hailuo', 'ai-kling', 'ai-wan', 'ai-seedance', 'ai-luma', 'ai-veo', 'ai-runway', 'ai-pika', 'ai-image',
    ]);

    // Process each scene
    for (const scene of scenes) {
      // Sora 2 sunset: silently migrate any legacy 'ai-sora' scene to Veo 3.1
      // (audio + cinematic) since OpenAI is sunsetting Sora 2 in 2026.
      if ((scene.clipSource as string) === 'ai-sora') {
        console.warn(`[compose-video-clips] Scene ${scene.id} clipSource 'ai-sora' is sunset — migrating to ai-veo.`);
        scene.clipSource = 'ai-veo';
        await supabaseAdmin
          .from('composer_scenes')
          .update({ clip_source: 'ai-veo', updated_at: new Date().toISOString() })
          .eq('id', scene.id);
      }

      // Pika 2.2 maintenance window: silently migrate ai-pika scenes to ai-hailuo
      // until Pika Labs API is stable again. Reverse: remove this block.
      if ((scene.clipSource as string) === 'ai-pika') {
        console.warn(`[compose-video-clips] Scene ${scene.id} clipSource 'ai-pika' is in maintenance — migrating to ai-hailuo.`);
        scene.clipSource = 'ai-hailuo';
        await supabaseAdmin
          .from('composer_scenes')
          .update({ clip_source: 'ai-hailuo', updated_at: new Date().toISOString() })
          .eq('id', scene.id);
      }

      // Defensive: rewrite unsupported AI engines to a working default.
      if (scene.clipSource.startsWith('ai-') && !SUPPORTED_AI_SOURCES.has(scene.clipSource)) {
        console.warn(`[compose-video-clips] Scene ${scene.id} clipSource '${scene.clipSource}' not supported by composer — falling back to ai-hailuo.`);
        scene.clipSource = 'ai-hailuo';
        // Persist the rewrite so the UI reflects reality
        await supabaseAdmin
          .from('composer_scenes')
          .update({ clip_source: 'ai-hailuo', updated_at: new Date().toISOString() })
          .eq('id', scene.id);
      }

      const quality: Quality = scene.clipQuality === 'pro' ? 'pro' : 'standard';

      try {
        if (scene.clipSource === 'upload' && scene.uploadUrl) {
          // Upload: just mark as ready
          await supabaseAdmin
            .from('composer_scenes')
            .update({ clip_url: scene.uploadUrl, clip_status: 'ready', updated_at: new Date().toISOString() })
            .eq('id', scene.id);
          results.push({ sceneId: scene.id, status: 'ready', clipUrl: scene.uploadUrl });

        } else if (scene.clipSource === 'stock' && scene.stockKeywords) {
          // Stock: search and pick best match
          const stockResponse = await fetch(`${supabaseUrl}/functions/v1/search-stock-videos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ query: scene.stockKeywords, perPage: 5 }),
          });

          const stockData = await stockResponse.json();
          const bestVideo = stockData.videos?.[0];

          if (bestVideo) {
            await supabaseAdmin
              .from('composer_scenes')
              .update({ clip_url: bestVideo.url, clip_status: 'ready', updated_at: new Date().toISOString() })
              .eq('id', scene.id);
            results.push({ sceneId: scene.id, status: 'ready', clipUrl: bestVideo.url });
          } else {
            await supabaseAdmin
              .from('composer_scenes')
              .update({ clip_status: 'failed', updated_at: new Date().toISOString() })
              .eq('id', scene.id);
            results.push({ sceneId: scene.id, status: 'failed', error: 'No stock videos found' });
          }

        } else if (scene.clipSource === 'ai-hailuo') {
          // Hailuo via Replicate (Standard 768p / Pro 1080p)
          const duration = scene.durationSeconds >= 8 ? 10 : 6;
          const resolution = quality === 'pro' ? '1080p' : '768p';
          const isI2V = !!scene.referenceImageUrl;

          await supabaseAdmin
            .from('composer_scenes')
            .update({
              clip_status: 'generating',
              clip_quality: quality,
              clip_lead_in_trim_seconds: computeLeadInTrim('ai-hailuo', isI2V),
              updated_at: new Date().toISOString(),
            })
            .eq('id', scene.id);

          const hailuoInput: Record<string, unknown> = {
            prompt: enrichPrompt(scene.aiPrompt, undefined, isI2V),
            negative_prompt: negativeFor(isI2V, scene.negativePrompt),
            duration: duration,
            resolution: resolution,
          };
          // Image-to-Video: use reference image as the first frame
          if (isI2V) {
            hailuoInput.first_frame_image = scene.referenceImageUrl;
            console.log(`[compose-video-clips] Hailuo scene ${scene.id} uses reference image (lead-in trim ${computeLeadInTrim('ai-hailuo', true)}s)`);
          }


          const prediction = await replicate.predictions.create({
            model: "minimax/hailuo-2.3",
            input: hailuoInput,
            webhook: `${webhookUrl}?scene_id=${scene.id}&project_id=${projectId}`,
            webhook_events_filter: ["completed"],
          });

          await supabaseAdmin
            .from('composer_scenes')
            .update({ replicate_prediction_id: prediction.id })
            .eq('id', scene.id);

          results.push({ sceneId: scene.id, status: 'generating', predictionId: prediction.id });

        } else if (scene.clipSource === 'ai-kling') {
          // Kling 3.0 Omni via Replicate — supports T2V, I2V, 3-15s
          const isI2V = !!scene.referenceImageUrl;
          await supabaseAdmin
            .from('composer_scenes')
            .update({
              clip_status: 'generating',
              clip_quality: quality,
              clip_lead_in_trim_seconds: computeLeadInTrim('ai-kling', isI2V),
              updated_at: new Date().toISOString(),
            })
            .eq('id', scene.id);

          // Kling 3 Omni accepts 3..15 seconds (integer)
          const klingDuration = Math.min(15, Math.max(3, Math.round(scene.durationSeconds)));
          const klingInput: Record<string, unknown> = {
            prompt: enrichPrompt(scene.aiPrompt, undefined, isI2V),
            duration: klingDuration,
            aspect_ratio: "16:9",
            mode: quality === 'pro' ? 'pro' : 'standard',
            generate_audio: scene.withAudio !== false,
          };
          // Image-to-Video: optional start/end image
          if (isI2V) {
            klingInput.start_image = scene.referenceImageUrl;
            console.log(`[compose-video-clips] Kling scene ${scene.id} uses start_image (lead-in trim ${computeLeadInTrim('ai-kling', true)}s)`);
          }

          if (scene.endReferenceImageUrl) {
            klingInput.end_image = scene.endReferenceImageUrl;
            console.log(`[compose-video-clips] Kling scene ${scene.id} uses end_image (backward extend / bridge)`);
          }

          const prediction = await replicate.predictions.create({
            model: "kwaivgi/kling-v3-omni-video",
            input: klingInput,
            webhook: `${webhookUrl}?scene_id=${scene.id}&project_id=${projectId}`,
            webhook_events_filter: ["completed"],
          });

          await supabaseAdmin
            .from('composer_scenes')
            .update({ replicate_prediction_id: prediction.id })
            .eq('id', scene.id);

          results.push({ sceneId: scene.id, status: 'generating', predictionId: prediction.id });

        } else if (scene.clipSource === 'ai-image') {
          // AI Image (Gemini Nano Banana 2 / Pro) — synchronous, cheap (~€0.01)
          // Routed to dedicated edge function. The function uploads to
          // composer-uploads bucket and updates scene clip_url + status itself.
          await supabaseAdmin
            .from('composer_scenes')
            .update({ clip_status: 'generating', clip_quality: quality, updated_at: new Date().toISOString() })
            .eq('id', scene.id);

          const enrichedPrompt = enrichPrompt(scene.aiPrompt, scene.characterShot);

          const imgResp = await fetch(`${supabaseUrl}/functions/v1/generate-composer-image-scene`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': authHeader, // forward user JWT
            },
            body: JSON.stringify({
              projectId,
              sceneId: scene.id,
              prompt: enrichedPrompt,
              visualStyle,
              quality,
            }),
          });

          if (!imgResp.ok) {
            const errBody = await imgResp.text();
            console.error(`[compose-video-clips] image scene ${scene.id} failed:`, imgResp.status, errBody);
            await supabaseAdmin
              .from('composer_scenes')
              .update({ clip_status: 'failed', updated_at: new Date().toISOString() })
              .eq('id', scene.id);
            results.push({ sceneId: scene.id, status: 'failed', error: `Image generation failed (${imgResp.status})` });
          } else {
            const imgData = await imgResp.json();
            results.push({
              sceneId: scene.id,
              status: 'ready',
              clipUrl: imgData.clipUrl,
            });
          }

        } else if (scene.clipSource === 'ai-wan') {
          // Wan 2.5 via Replicate — supports i2v when reference image present
          const isI2V = !!scene.referenceImageUrl;
          await supabaseAdmin
            .from('composer_scenes')
            .update({
              clip_status: 'generating',
              clip_quality: quality,
              clip_lead_in_trim_seconds: computeLeadInTrim('ai-wan', isI2V),
              updated_at: new Date().toISOString(),
            })
            .eq('id', scene.id);

          const wanModel = isI2V
            ? 'wan-video/wan-2.5-i2v'
            : 'wan-video/wan-2.5-t2v';
          // Wan 2.5 only supports 5 or 10 seconds — snap to nearest allowed value
          const wanDuration = snapDuration(scene.durationSeconds, [5, 10]);
          const wanInput: Record<string, unknown> = {
            prompt: enrichPrompt(scene.aiPrompt, undefined, isI2V),
            negative_prompt: negativeFor(isI2V, scene.negativePrompt),
            duration: wanDuration,
            aspect_ratio: '16:9',
            resolution: quality === 'pro' ? '1080p' : '720p',
          };
          console.log(`[compose-video-clips] Wan scene ${scene.id}: requested ${scene.durationSeconds}s → snapped to ${wanDuration}s`);
          if (isI2V) {
            wanInput.image = scene.referenceImageUrl;
            console.log(`[compose-video-clips] Wan scene ${scene.id} uses i2v reference (lead-in trim ${computeLeadInTrim('ai-wan', true)}s)`);
          }


          const prediction = await replicate.predictions.create({
            model: wanModel,
            input: wanInput,
            webhook: `${webhookUrl}?scene_id=${scene.id}&project_id=${projectId}`,
            webhook_events_filter: ["completed"],
          });

          await supabaseAdmin
            .from('composer_scenes')
            .update({ replicate_prediction_id: prediction.id })
            .eq('id', scene.id);

          results.push({ sceneId: scene.id, status: 'generating', predictionId: prediction.id });

        } else if (scene.clipSource === 'ai-seedance') {
          // Seedance 1 Lite via Replicate
          const isI2V = !!scene.referenceImageUrl;
          await supabaseAdmin
            .from('composer_scenes')
            .update({
              clip_status: 'generating',
              clip_quality: quality,
              clip_lead_in_trim_seconds: computeLeadInTrim('ai-seedance', isI2V),
              updated_at: new Date().toISOString(),
            })
            .eq('id', scene.id);

          // Seedance Lite supports 5 or 10 seconds — snap to nearest allowed value
          const seedDuration = snapDuration(scene.durationSeconds, [5, 10]);
          const seedInput: Record<string, unknown> = {
            prompt: enrichPrompt(scene.aiPrompt, undefined, isI2V),
            duration: seedDuration,
            aspect_ratio: '16:9',
            resolution: quality === 'pro' ? '1080p' : '720p',
          };
          console.log(`[compose-video-clips] Seedance scene ${scene.id}: requested ${scene.durationSeconds}s → snapped to ${seedDuration}s`);
          if (isI2V) {
            seedInput.image = scene.referenceImageUrl;
            console.log(`[compose-video-clips] Seedance scene ${scene.id} uses i2v reference (lead-in trim ${computeLeadInTrim('ai-seedance', true)}s)`);
          }


          const prediction = await replicate.predictions.create({
            model: 'bytedance/seedance-1-lite',
            input: seedInput,
            webhook: `${webhookUrl}?scene_id=${scene.id}&project_id=${projectId}`,
            webhook_events_filter: ["completed"],
          });

          await supabaseAdmin
            .from('composer_scenes')
            .update({ replicate_prediction_id: prediction.id })
            .eq('id', scene.id);

          results.push({ sceneId: scene.id, status: 'generating', predictionId: prediction.id });

        } else if (scene.clipSource === 'ai-luma') {
          // Luma Ray 2 via Replicate — supports start_image
          const isI2V = !!scene.referenceImageUrl;
          await supabaseAdmin
            .from('composer_scenes')
            .update({
              clip_status: 'generating',
              clip_quality: quality,
              clip_lead_in_trim_seconds: computeLeadInTrim('ai-luma', isI2V),
              updated_at: new Date().toISOString(),
            })
            .eq('id', scene.id);

          // Luma Ray 2 only supports 5 or 9 seconds — snap to nearest allowed value
          const lumaDuration = snapDuration(scene.durationSeconds, [5, 9]);
          const lumaInput: Record<string, unknown> = {
            prompt: enrichPrompt(scene.aiPrompt, undefined, isI2V),
            duration: lumaDuration,
            aspect_ratio: '16:9',
          };
          console.log(`[compose-video-clips] Luma scene ${scene.id}: requested ${scene.durationSeconds}s → snapped to ${lumaDuration}s`);
          if (isI2V) {
            lumaInput.start_image = scene.referenceImageUrl;
            console.log(`[compose-video-clips] Luma scene ${scene.id} uses start_image keyframe (lead-in trim ${computeLeadInTrim('ai-luma', true)}s)`);
          }
          if (scene.endReferenceImageUrl) {
            lumaInput.end_image = scene.endReferenceImageUrl;
            console.log(`[compose-video-clips] Luma scene ${scene.id} uses end_image keyframe (backward extend / bridge)`);
          }


          const prediction = await replicate.predictions.create({
            model: 'luma/ray-2-720p',
            input: lumaInput,
            webhook: `${webhookUrl}?scene_id=${scene.id}&project_id=${projectId}`,
            webhook_events_filter: ["completed"],
          });

          await supabaseAdmin
            .from('composer_scenes')
            .update({ replicate_prediction_id: prediction.id })
            .eq('id', scene.id);

          results.push({ sceneId: scene.id, status: 'generating', predictionId: prediction.id });

        } else if (scene.clipSource === 'ai-veo') {
          // Google Veo 3.1 via Replicate — native audio
          // standard → google/veo-3.1-fast (Lite, $0.05/s 720p) | pro → google/veo-3.1 (Premium 1080p, $0.40/s)
          const isI2V = !!scene.referenceImageUrl;
          await supabaseAdmin
            .from('composer_scenes')
            .update({
              clip_status: 'generating',
              clip_quality: quality,
              clip_lead_in_trim_seconds: computeLeadInTrim('ai-veo', isI2V),
              updated_at: new Date().toISOString(),
            })
            .eq('id', scene.id);

          const veoModel = quality === 'pro' ? 'google/veo-3.1' : 'google/veo-3.1-fast';
          const veoResolution = quality === 'pro' ? '1080p' : '720p';
          // Veo accepts 4 / 6 / 8 second clips
          const veoDuration = scene.durationSeconds >= 7 ? 8 : scene.durationSeconds >= 5 ? 6 : 4;

          const veoInput: Record<string, unknown> = {
            prompt: enrichPrompt(scene.aiPrompt, undefined, isI2V),
            duration: veoDuration,
            aspect_ratio: '16:9',
            resolution: veoResolution,
            generate_audio: scene.withAudio !== false,
          };
          if (isI2V) {
            veoInput.image = scene.referenceImageUrl;
            console.log(`[compose-video-clips] Veo scene ${scene.id} uses i2v reference (${veoModel}, lead-in trim ${computeLeadInTrim('ai-veo', true)}s)`);
          }


          const prediction = await replicate.predictions.create({
            model: veoModel,
            input: veoInput,
            webhook: `${webhookUrl}?scene_id=${scene.id}&project_id=${projectId}`,
            webhook_events_filter: ["completed"],
          });

          await supabaseAdmin
            .from('composer_scenes')
            .update({ replicate_prediction_id: prediction.id })
            .eq('id', scene.id);

          results.push({ sceneId: scene.id, status: 'generating', predictionId: prediction.id });

        } else if (scene.clipSource === 'ai-runway') {
          // Runway Gen-4 Aleph — V2V only. Requires a reference VIDEO (not image).
          // Composer convention: scene.uploadUrl OR a previously rendered scene clipUrl
          // can serve as the reference. We accept uploadUrl here as the V2V source.
          const referenceVideoUrl = scene.uploadUrl;
          if (!referenceVideoUrl) {
            console.warn(`[compose-video-clips] Runway scene ${scene.id} has no reference video — falling back to ai-hailuo.`);
            scene.clipSource = 'ai-hailuo';
            await supabaseAdmin
              .from('composer_scenes')
              .update({ clip_source: 'ai-hailuo', updated_at: new Date().toISOString() })
              .eq('id', scene.id);
            // Re-route this scene to Hailuo by inserting a synthetic Hailuo call
            const fallbackDuration = scene.durationSeconds >= 8 ? 10 : 6;
            const fallbackPred = await replicate.predictions.create({
              model: "minimax/hailuo-2.3",
              input: {
                prompt: enrichPrompt(scene.aiPrompt, undefined, false),
                negative_prompt: negativeFor(false, scene.negativePrompt),
                duration: fallbackDuration,
                resolution: '768p',
              },
              webhook: `${webhookUrl}?scene_id=${scene.id}&project_id=${projectId}`,
              webhook_events_filter: ["completed"],
            });
            await supabaseAdmin
              .from('composer_scenes')
              .update({ clip_status: 'generating', clip_quality: 'standard', replicate_prediction_id: fallbackPred.id })
              .eq('id', scene.id);
            results.push({ sceneId: scene.id, status: 'generating', predictionId: fallbackPred.id });
            continue;
          }

          await supabaseAdmin
            .from('composer_scenes')
            .update({
              clip_status: 'generating',
              clip_quality: quality,
              updated_at: new Date().toISOString(),
            })
            .eq('id', scene.id);

          const runwayDuration = scene.durationSeconds >= 8 ? 10 : 5;
          const runwayResp = await fetch(`${supabaseUrl}/functions/v1/generate-runway-video`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': authHeader,
            },
            body: JSON.stringify({
              prompt: enrichPrompt(scene.aiPrompt, undefined, true),
              model: 'runway-gen4-aleph',
              duration: runwayDuration,
              aspectRatio: '16:9',
              referenceVideoUrl,
            }),
          });

          if (!runwayResp.ok) {
            const errBody = await runwayResp.text();
            console.error(`[compose-video-clips] Runway scene ${scene.id} failed:`, runwayResp.status, errBody);
            await supabaseAdmin
              .from('composer_scenes')
              .update({ clip_status: 'failed', updated_at: new Date().toISOString() })
              .eq('id', scene.id);
            results.push({ sceneId: scene.id, status: 'failed', error: `Runway ${runwayResp.status}` });
          } else {
            const runwayData = await runwayResp.json();
            // Runway is async-polled in its own edge function; the composer
            // webhook isn't called. Mark as generating; user polls scene later
            // via the regular ai_video_generations status pipeline.
            await supabaseAdmin
              .from('composer_scenes')
              .update({
                replicate_prediction_id: runwayData.taskId ?? runwayData.generationId,
                updated_at: new Date().toISOString(),
              })
              .eq('id', scene.id);
            results.push({ sceneId: scene.id, status: 'generating', predictionId: runwayData.taskId });
          }

        } else if (scene.clipSource === 'ai-pika') {
          // Pika 2.2 via Replicate — supports T2V + I2V (Pikaframes via end_image)
          const isI2V = !!scene.referenceImageUrl;
          await supabaseAdmin
            .from('composer_scenes')
            .update({
              clip_status: 'generating',
              clip_quality: quality,
              clip_lead_in_trim_seconds: computeLeadInTrim('ai-pika', isI2V),
              updated_at: new Date().toISOString(),
            })
            .eq('id', scene.id);

          const pikaDuration = snapDuration(scene.durationSeconds, [5, 10]);
          const pikaResp = await fetch(`${supabaseUrl}/functions/v1/generate-pika-video`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': authHeader,
            },
            body: JSON.stringify({
              prompt: enrichPrompt(scene.aiPrompt, undefined, isI2V),
              model: quality === 'pro' ? 'pika-2-2-pro' : 'pika-2-2-standard',
              duration: pikaDuration,
              aspectRatio: '16:9',
              startImageUrl: scene.referenceImageUrl,
              endImageUrl: scene.endReferenceImageUrl,
            }),
          });

          if (!pikaResp.ok) {
            const errBody = await pikaResp.text();
            console.error(`[compose-video-clips] Pika scene ${scene.id} failed:`, pikaResp.status, errBody);
            await supabaseAdmin
              .from('composer_scenes')
              .update({ clip_status: 'failed', updated_at: new Date().toISOString() })
              .eq('id', scene.id);
            results.push({ sceneId: scene.id, status: 'failed', error: `Pika ${pikaResp.status}` });
          } else {
            const pikaData = await pikaResp.json();
            await supabaseAdmin
              .from('composer_scenes')
              .update({
                replicate_prediction_id: pikaData.predictionId ?? pikaData.generationId,
                updated_at: new Date().toISOString(),
              })
              .eq('id', scene.id);
            results.push({ sceneId: scene.id, status: 'generating', predictionId: pikaData.predictionId });
          }

        } else {
          // Unknown source, skip
          results.push({ sceneId: scene.id, status: 'skipped', error: `Unknown clip source: ${scene.clipSource}` });
        }
      } catch (sceneError) {
        const errMsg = errorToString(sceneError);
        console.error(`[compose-video-clips] Scene ${scene.id} error:`, errMsg);
        await supabaseAdmin
          .from('composer_scenes')
          .update({ clip_status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', scene.id);
        results.push({ sceneId: scene.id, status: 'failed', error: errMsg });
      }
    }

    // Deduct credits for AI scenes that started generating (video) OR
    // synchronously completed (ai-image returns status='ready' immediately).
    const billableResults = results.filter(r => {
      if (r.status !== 'generating' && r.status !== 'ready') return false;
      const scene = scenes.find(s => s.id === r.sceneId);
      return scene?.clipSource.startsWith('ai-');
    });
    const generatingCount = results.filter(r => r.status === 'generating').length;
    let actualCost = 0;
    for (const r of billableResults) {
      const scene = scenes.find(s => s.id === r.sceneId);
      if (!scene) continue;
      const q: Quality = scene.clipQuality === 'pro' ? 'pro' : 'standard';
      actualCost += scene.durationSeconds * (CLIP_COSTS[scene.clipSource]?.[q] ?? 0);
    }

    if (billableResults.length > 0 && actualCost > 0) {
      try {
        await supabaseAdmin.rpc('deduct_ai_video_credits', {
          p_user_id: user.id,
          p_amount: actualCost,
          p_generation_id: projectId,
        });
        console.log(`[compose-video-clips] Deducted €${actualCost.toFixed(2)} for ${billableResults.length} AI scenes (${generatingCount} async)`);
      } catch (creditErr) {
        console.error('[compose-video-clips] Credit deduction failed:', creditErr);
      }
    }

    // Check if all scenes are already done (stock/upload only)
    const allDone = results.every(r => r.status === 'ready' || r.status === 'skipped');
    if (allDone) {
      await supabaseAdmin
        .from('composer_projects')
        .update({ status: 'preview', updated_at: new Date().toISOString() })
        .eq('id', projectId);
    }

    return new Response(
      JSON.stringify({ success: true, results, totalCost: actualCost, generatingCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[compose-video-clips] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
