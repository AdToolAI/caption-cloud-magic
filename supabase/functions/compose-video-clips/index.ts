// compose-video-clips v2.3.0 — duration snap for Luma/Wan/Seedance
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";

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
import { countFacesInImage, countHumansInImage } from "../_shared/face-count.ts";
import { auditAnchorIdentity } from "../_shared/identity-audit.ts";

const ANCHOR_AUDIT_VERSION = 4;


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
  /** Optional pre-built identity-card prompt from the Brand Character library. */
  identityCardPrompt?: string;
  /** Optional anchor portrait — surfaced for logging; the i2v wiring stays on `scene.referenceImageUrl`. */
  referenceImageUrl?: string;
  brandCharacterId?: string;
}

type DialogVoiceCfg = { engine?: string; voiceId?: string; voiceName?: string; provider?: string };

/** ── HeyGen routing helpers (mirrors src/lib/video-composer/sceneEngineRouter.ts) ── */
function sceneHasDialogText(script?: string | null): boolean {
  return !!(script && script.trim().length > 0);
}
function countDialogSpeakers(script?: string | null): number {
  const s = (script ?? '').trim();
  if (!s) return 0;
  const speakers = new Set<string>();
  for (const line of s.split('\n')) {
    const m = line.match(/^\s*\[?([A-Za-zÀ-ÿ][\w\s.'-]{1,40}?)\]?\s*[:：]/);
    if (m) speakers.add(m[1].trim().toLowerCase());
  }
  return speakers.size;
}
/** Strip "NAME:" / "[NAME]:" speaker prefixes — leaves clean spoken text. */
function stripSpeakerPrefixes(script: string): string {
  return script
    .split('\n')
    .map((line) => line.replace(/^\s*\[?[A-Za-zÀ-ÿ][\w\s.'-]{1,40}?\]?\s*[:：]\s*/, '').trim())
    .filter((l) => l.length > 0)
    .join(' ');
}
function resolveDialogVoiceId(cfg?: string | DialogVoiceCfg): string | undefined {
  if (!cfg) return undefined;
  if (typeof cfg === 'string') return cfg;
  return cfg.voiceId;
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
  characterShots?: Array<{ characterId: string; shotType: CharacterShotType }>;
  /** Per-scene dialog screenplay ("NAME: text" per line). Triggers HeyGen routing. */
  dialogScript?: string;
  /** Map of characterId → voice (string voiceId or { voiceId }). */
  dialogVoices?: Record<string, string | DialogVoiceCfg>;
  /** Render-engine override: 'auto' | 'heygen' | 'broll' | 'sync-polish'. */
  engineOverride?: 'auto' | 'heygen' | 'broll' | 'sync-polish' | 'cinematic-sync';
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

  // Stage marker for diagnostics — updated as we progress so a fatal
  // error in any branch surfaces the exact phase that failed.
  let __stage = 'init';

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

    __stage = 'parse_body';
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
    __stage = 'verify_project';
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
    __stage = 'cost_calc';
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
    const webhookUrl = appendWebhookToken(`${supabaseUrl}/functions/v1/compose-clip-webhook`);

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
    const CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE = ", talking mouth, lip movement, speaking animation, open mouth speech, mouthing words, mouth flapping, exaggerated facial talking, dialogue performance, singing, yelling";
    const POSITIVE_CLEAN_CUE = ", clean cinematic composition, natural environment";
    // Positive cue appended ONLY for i2v requests — biases the model toward
    // immediate camera movement so the reference image doesn't appear as a still.
    const POSITIVE_I2V_MOTION_CUE = ", motion already in progress from frame one, immediate camera movement, no static opening frame";
    const STYLE_HINT = getVisualStyleHint(visualStyle);

    // Build a quick character lookup for the safety-net injection
    const charById = new Map<string, ComposerCharacter>();
    (characters || []).forEach(c => { if (c?.id) charById.set(c.id, c); });

    /**
     * Strip spoken-dialog patterns from a scene prompt BEFORE handing it to
     * the image anchor renderer. Mirrors `compose-scene-anchor`'s server-side
     * sanitizer but applied early so the Dialog-block leak cannot reach Nano
     * Banana (which would otherwise paint the same speaker twice when a
     * script repeats a name across lines).
     */
    const stripDialogForAnchor = (raw: string): string => {
      if (!raw) return '';
      const cleaned = raw
        .replace(/\[\s*dialog\s*\][\s\S]*?\[\s*\/\s*dialog\s*\]/gi, '')
        // Drop server-injected "Featuring NAME (shotType): ..." / "Featuring NAME and NAME: ..." prefixes —
        // they often pair a slot NAME with a DIFFERENT character description in the
        // following sentence, which the image model interprets as "render Slot-Name
        // visually as Other-Name", producing wrong/duplicated faces.
        .replace(/^\s*featuring\s+[^:\n]{1,200}:\s*/gim, '')
        .replace(/^\s*[-*•]\s*[\p{L}][\p{L}\s.'\-]{0,60}\s+(says?|speaks?|tells|asks|whispers|shouts|replies|responds)\s*:?\s.*$/gimu, '')
        .replace(/^\s*[-*•]\s*[\p{L}][\p{L}\s.'\-]{0,60}\s*:\s.*$/gmu, '')
        .replace(/^.*\b(speak\s+to\s+camera\s+in\s+turns|lip[- ]?sync\s+mouth\s+movement|timing\s+must\s+follow|speaker\s+order|in\s+turns|dialogue\s*:|conversation\s+script).*$/gim, '')
        .replace(/^[\p{Lu}][\p{L}\s'\-]{0,40}\s*[:\-—]\s.*$/gmu, '')
        .replace(/"[^"]{1,400}"/g, '')
        .replace(/„[^"]{1,400}"/g, '')
        .replace(/«[^»]{1,400}»/g, '')
        .replace(/'[^']{2,400}'/g, '')
        .replace(/\n{2,}/g, '\n')
        .trim();
      const meaningful = cleaned.replace(/[\s.\-,;:!?]/g, '').length >= 10;
      return meaningful ? cleaned : '';
    };

    /**
     * Parse a dialog script ("NAME: text" per line) and return the unique
     * speaker slugs in first-appearance order. Used to override the visual
     * cast for anchor composition: even if `character_shots` lists more
     * slots than the script actually uses, the anchor should only render
     * the people who actually speak (and each exactly ONCE).
     */
    const uniqueSpeakerSlugsFromScript = (script?: string | null): string[] => {
      const s = (script ?? '').trim();
      if (!s) return [];
      const out: string[] = [];
      const seen = new Set<string>();
      for (const line of s.split('\n')) {
        const m = line.match(/^\s*\[?([A-Za-zÀ-ÿ][\w\s.'-]{1,40}?)\]?\s*[:：]/);
        if (!m) continue;
        const slug = m[1].trim().toLowerCase().replace(/\s+/g, '-');
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
      const first = lower.split('-')[0];
      // 1) exact match
      let hit = shots.find((s) => String(s.characterId).toLowerCase() === lower);
      if (hit) return hit;
      // 2) first-name match against characterId
      hit = shots.find((s) => String(s.characterId).toLowerCase().split('-')[0] === first);
      if (hit) return hit;
      // 3) match via brand character name
      hit = shots.find((s) => {
        const c = charById.get(s.characterId);
        const cn = (c?.name || '').toLowerCase();
        return cn === lower || cn.split(/\s+/)[0] === first;
      });
      return hit;
    };

    const neutralTwoShotPrompt = (names: string[], fallbackCount: number) => {
      const cleanNames = names.filter(Boolean);
      const n = Math.max(cleanNames.length, fallbackCount, 2);
      const named = cleanNames.length > 0 ? `: ${cleanNames.join(' and ')}` : '';
      return `Exactly ${n} distinct people${named}, each visible exactly once, in a modern office conversation scene. Both people hold relaxed listening expressions with calm resting mouth posture and closed relaxed lips, subtle natural head and eye movement, cinematic plate for later dialogue dubbing. No other humans, no background bystanders, no posters or screens showing people. No rendered text.`;
    };

    const buildCinematicSyncMasterPrompt = (scene: ClipScene): string => {
      const speakerSlugs = uniqueSpeakerSlugsFromScript(scene.dialogScript);
      const cleanedVisualPrompt = stripDialogForAnchor(scene.aiPrompt || '');
      if (speakerSlugs.length < 2) return cleanedVisualPrompt || (scene.aiPrompt || 'cinematic footage');
      const castShots = (scene.characterShots ?? []).filter((s) => s && s.shotType !== 'absent' && s.characterId);
      const speakerNames = speakerSlugs
        .map((slug) => resolveSpeakerToShot(slug, castShots))
        .map((shot) => shot ? charById.get(shot.characterId)?.name : null)
        .filter((name): name is string => typeof name === 'string' && name.length > 0);
      const neutralPlate = neutralTwoShotPrompt(speakerNames, speakerSlugs.length);
      const sceneDescription = cleanedVisualPrompt || 'modern cinematic interior scene';
      return `Silent neutral master plate: ${neutralPlate}. Visual setting: ${sceneDescription}. Hold calm facial expressions and resting mouth posture throughout the shot; use only subtle breathing, eye movement, posture shifts and gentle camera motion.`;
    };

    /** Inject character description based on shotType (Sherlock-Holmes anchor). */
    const injectCharacter = (prompt: string, shot?: { characterId: string; shotType: CharacterShotType }): string => {
      if (!shot || !shot.characterId || shot.shotType === 'absent') return prompt;
      const char = charById.get(shot.characterId);
      if (!char) return prompt;
      const appearance = (char.appearance || '').trim();
      const items = (char.signatureItems || '').trim();
      const identityCard = (char.identityCardPrompt || '').trim();
      let prefix = '';
      const lowerPrompt = prompt.toLowerCase();

      // Brand-Character path: a Gemini-built identity card carries far more
      // signal than appearance+items text. Prefer it whenever present and use
      // it for ALL non-absent shot types so face anchoring is consistent.
      if (identityCard) {
        const idProbe = identityCard.slice(0, 40).toLowerCase();
        const hasId = lowerPrompt.includes(idProbe);
        if (!hasId) prefix += identityCard.endsWith(',') ? identityCard + ' ' : identityCard + ', ';
        return prefix ? prefix + prompt : prompt;
      }

      // Legacy free-text Sherlock-Holmes anchor.
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
      // i2v-only: HARD identity lock — biggest source of "character morphs/ages
      // during the clip" with Hailuo/Kling/Wan. Appended last for recency bias.
      if (isImageToVideo && !lower.includes("preserve the exact facial identity")) {
        result = result.replace(/[,.]\s*$/, "") +
          ", preserve the exact facial identity, age, skin tone, hair style and hair color of the people from the reference image throughout the entire shot, do not age them, do not morph their faces, do not change face shape, the same recognizable individuals from start to end";
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
      'ai-happyhorse': 0.15,
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
      'ai-hailuo', 'ai-kling', 'ai-wan', 'ai-seedance', 'ai-luma', 'ai-veo', 'ai-runway', 'ai-pika', 'ai-happyhorse', 'ai-image',
    ]);

    // Process each scene
    for (const scene of scenes) {
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
          .from('composer_scenes')
          .select('cinematic_preset_slug, engine_override, clip_status, clip_url, character_audio_url')
          .eq('id', scene.id)
          .maybeSingle();
        const slug = (dbRow as any)?.cinematic_preset_slug as string | null;
        const dbEngine = (dbRow as any)?.engine_override as string | null;
        const status = (dbRow as any)?.clip_status as string | null;
        const hasAudio = !!(dbRow as any)?.character_audio_url;
        if (dbEngine !== 'cinematic-sync' && slug && slug.startsWith('dialog-srs:') && (hasAudio || status === 'generating' || status === 'ready')) {
          console.log(`[compose-video-clips] Skipping SRS lip-sync sub-scene ${scene.id} (slug=${slug}, status=${status})`);
          results.push({ sceneId: scene.id, status: status === 'ready' ? 'ready' : 'generating' });
          continue;
        }
      } catch (e) {
        console.warn('[compose-video-clips] SRS guard query failed (continuing):', e instanceof Error ? e.message : String(e));
      }

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

      // ── Cinematic-Sync auto-extend ────────────────────────────────────────
      // When engineOverride === 'cinematic-sync', the user wants the avatar
      // re-rendered into the real scene with Sync.so lip-sync. If the scene's
      // voiceover is LONGER than the configured scene duration, we'd lose
      // dialog (Sync.so cut_off). Auto-extend the scene to the smallest
      // Hailuo-allowed duration (6s or 10s) that fits VO + 0.4s padding.
      if ((scene.engineOverride ?? 'auto') === 'cinematic-sync') {
        __stage = `cinematic_sync_prep:${scene.id}`;
        try {
          // Two-Shot prep: if this scene has a multi-speaker dialog_script,
          // synthesize a merged voiceover (one WAV with all speakers in
          // sequence) BEFORE the auto-extend logic looks for VO duration.
          // This is what makes the "Artlist Two-Shot Hook" work end-to-end:
          // Hailuo renders the 10s two-shot, then Sync.so lip-syncs against
          // the merged audio.
          try {
            const dlg = String((scene as any).dialogScript ?? '');
            const speakerLines = dlg.split(/\r?\n/).filter((l) => /^\s*\[?[A-Za-zÀ-ÿ][\w\s.'-]{1,40}?\]?\s*[:：]/.test(l));
            if (speakerLines.length >= 2) {
              // Mark stage = 'audio' so the UI can show step 1/6.
              await supabaseAdmin
                .from('composer_scenes')
                .update({ twoshot_stage: 'audio', updated_at: new Date().toISOString() })
                .eq('id', scene.id);
              const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/compose-twoshot-audio`;
              const r = await fetch(fnUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                },
                body: JSON.stringify({ scene_id: scene.id }),
              });
              // Drain body to avoid leak; capture text on failure for logs.
              const respText = await r.text().catch(() => '');
              if (!r.ok) {
                console.warn(`[compose-video-clips] twoshot-audio prep failed for ${scene.id}: HTTP ${r.status} ${respText.slice(0, 300)}`);
              } else {
                console.log(`[compose-video-clips] twoshot-audio prep OK for ${scene.id}`);
                // Stage = 'master_clip' — Hailuo render begins next.
                await supabaseAdmin
                  .from('composer_scenes')
                  .update({ twoshot_stage: 'master_clip', updated_at: new Date().toISOString() })
                  .eq('id', scene.id);
              }
            }
          } catch (twoshotErr) {
            console.warn(`[compose-video-clips] twoshot-audio prep exception for ${scene.id}:`, twoshotErr);
          }

          const { data: voClips } = await supabaseAdmin
            .from('scene_audio_clips')
            .select('duration')
            .eq('scene_id', scene.id)
            .eq('kind', 'voiceover')
            .order('duration', { ascending: false })
            .limit(1);
          const voDur = Number(voClips?.[0]?.duration ?? 0);
          if (voDur > 0) {
            const required = voDur + 0.4;
            const currentDur = Number(scene.durationSeconds || 0);
            // Hailuo allowed durations: 6 or 10. Respect user's pick — only
            // extend if VO actually needs MORE than what they chose.
            const fitDur = required <= 6 ? 6 : 10;
            const targetDur = Math.max(currentDur, fitDur);
            if (targetDur > currentDur) {
              console.log(`[compose-video-clips] Cinematic-Sync scene ${scene.id}: VO ${voDur.toFixed(2)}s > scene ${currentDur}s → extending to ${targetDur}s`);
              scene.durationSeconds = targetDur;
              await supabaseAdmin
                .from('composer_scenes')
                .update({ duration_seconds: targetDur, updated_at: new Date().toISOString() })
                .eq('id', scene.id);
            }
            if (required > 10) {
              console.warn(`[compose-video-clips] Cinematic-Sync scene ${scene.id}: VO (${voDur.toFixed(2)}s) exceeds Hailuo 10s limit — Sync.so will cut_off.`);
            }
          }

          // ── Server-side multi-cast anchor safety net ────────────────────
          // ALWAYS audit when 2+ cast members, even if a /scene-anchors/ image
          // is already pinned — a previously composed anchor can still contain
          // an extra/cloned person from an older pipeline version. We only
          // reuse an existing anchor when audit_version matches and ok===true.
          try {
            const castShots = (scene.characterShots ?? []).filter(
              (s) => s && s.shotType !== 'absent' && s.characterId,
            );
            // Speaker-list override: when a dialog script is present, the
            // visual cast MUST equal the deduplicated set of actual speakers,
            // in script order. This prevents the "Samuel speaks twice → 3
            // people in frame" failure mode by only sending portraits of
            // people who actually speak.
            const scriptSpeakers = uniqueSpeakerSlugsFromScript(scene.dialogScript);
            let effectiveShots = castShots;
            if (scriptSpeakers.length > 0) {
              const remapped = scriptSpeakers
                .map((slug) => resolveSpeakerToShot(slug, castShots))
                .filter((x): x is { characterId: string; shotType: CharacterShotType } => !!x);
              if (remapped.length >= 1) effectiveShots = remapped;
            }
            if (effectiveShots.length >= 2) {
              const portraitUrls = effectiveShots
                .map((cs) => charById.get(cs.characterId)?.referenceImageUrl)
                .filter((u): u is string => typeof u === 'string' && u.length > 0)
                .slice(0, 4);
              const characterNames = effectiveShots
                .map((cs) => charById.get(cs.characterId)?.name)
                .filter((n): n is string => typeof n === 'string' && n.length > 0);
              if (portraitUrls.length >= 2) {
                const expectedFaces = portraitUrls.length;
                const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

                // Has the currently-pinned anchor passed the current audit version?
                const prevAuditRaw = ((scene as any).audioPlan?.twoshot?.anchor_face_audit) ?? null;
                const prevAuditOk =
                  prevAuditRaw &&
                  prevAuditRaw.ok === true &&
                  Number(prevAuditRaw.version) === ANCHOR_AUDIT_VERSION;
                const existingRefUrl = String(scene.referenceImageUrl ?? '');
                const existingLooksComposed =
                  existingRefUrl.includes('/scene-anchors/') ||
                  existingRefUrl.includes('/composer-anchors/');

                // composeAnchor — single attempt at compose-scene-anchor.
                const composeAnchor = async (label: string, strict = false): Promise<string | null> => {
                  console.log(`[compose-video-clips] cinematic-sync scene ${scene.id}: composing multi-cast anchor (${portraitUrls.length} portraits) [${label}${strict ? ', strict' : ''}]`);
                  const anchorPrompt = scriptSpeakers.length >= 2
                    ? neutralTwoShotPrompt(characterNames, portraitUrls.length)
                    : (stripDialogForAnchor(scene.aiPrompt || '') || neutralTwoShotPrompt(characterNames, portraitUrls.length));
                  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/compose-scene-anchor`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': authHeader,
                    },
                    body: JSON.stringify({
                      sceneId: scene.id,
                      portraitUrl: portraitUrls[0],
                      portraitUrls,
                      characterNames,
                      scenePrompt: anchorPrompt,
                      aspectRatio: '16:9',
                      shotType: scene.characterShot?.shotType,
                      strictNoDuplicates: strict,
                    }),
                  });
                  if (!r.ok) {
                    const errTxt = await r.text().catch(() => '');
                    console.warn(`[compose-video-clips] cinematic-sync scene ${scene.id}: compose-scene-anchor failed ${r.status} ${errTxt.slice(0, 200)}`);
                    return null;
                  }
                  const aj = await r.json().catch(() => ({}));
                  return typeof aj?.composedUrl === 'string' ? aj.composedUrl : null;
                };

                const invalidateCache = async () => {
                  await supabaseAdmin.from('scene_anchor_cache').delete().eq('scene_id', scene.id);
                };

                // Evaluate: face count + human count + identity audit.
                const evaluate = async (url: string, label: string) => {
                  const [fc, hc] = await Promise.all([
                    countFacesInImage(url, LOVABLE_API_KEY!, { kind: 'image' }),
                    countHumansInImage(url, LOVABLE_API_KEY!),
                  ]);
                  let identity: 'clone' | 'extra' | 'missing' | 'ambiguous' | null = null;
                  let notes = "";
                  // Human-count is the strictest signal — catches profile/background extras.
                  if (hc !== null && hc > expectedFaces) {
                    identity = 'extra';
                    notes = `human count ${hc} > expected ${expectedFaces}`;
                  } else if (fc !== null && fc > expectedFaces) {
                    identity = 'extra';
                    notes = `face count ${fc} > expected ${expectedFaces}`;
                  }
                  // Deep identity audit (only meaningful for multi-portrait).
                  if (portraitUrls.length >= 2) {
                    const audit = await auditAnchorIdentity(url, portraitUrls, characterNames, LOVABLE_API_KEY!);
                    if (audit && !audit.ok) {
                      identity = audit.reason ?? identity ?? 'ambiguous';
                      notes = audit.detail || notes;
                    }
                  }
                  console.log(`[compose-video-clips] anchor audit scene ${scene.id} ${label}: faces=${fc}/${expectedFaces} humans=${hc}/${expectedFaces} identity=${identity ?? 'ok'} notes="${notes.slice(0, 120)}"`);
                  return { faceCount: fc, humanCount: hc, identity, notes };
                };

                let composedUrl: string | null = null;
                let faceCount: number | null = null;
                let humanCount: number | null = null;
                let identityFailure: 'clone' | 'extra' | 'missing' | 'ambiguous' | null = null;
                let identityNotes = "";
                let skipAuditPersist = false;

                // 1) Reuse existing anchor only if it passed current audit version.
                if (prevAuditOk && existingLooksComposed) {
                  console.log(`[compose-video-clips] cinematic-sync scene ${scene.id}: reusing pinned anchor (audit v${ANCHOR_AUDIT_VERSION} ok)`);
                  composedUrl = existingRefUrl;
                  faceCount = Number.isFinite(Number(prevAuditRaw?.detected)) ? Number(prevAuditRaw.detected) : null;
                  humanCount = Number.isFinite(Number(prevAuditRaw?.humans)) ? Number(prevAuditRaw.humans) : null;
                  skipAuditPersist = true;
                } else {
                  // 2) Stale or missing anchor → invalidate cache and re-compose.
                  // Always delete cache for cinematic-sync before composing: older
                  // client-side anchors used the same scene/cache key while carrying
                  // 3 portrait/person prompts, so a null DB reference alone is not
                  // enough to guarantee a fresh 2-speaker anchor.
                  if (existingLooksComposed) {
                    console.log(`[compose-video-clips] cinematic-sync scene ${scene.id}: pinned anchor missing audit v${ANCHOR_AUDIT_VERSION} → re-composing`);
                  }
                  await invalidateCache();
                  composedUrl = await composeAnchor('attempt-1');

                  if (composedUrl && LOVABLE_API_KEY) {
                    const e1 = await evaluate(composedUrl, 'attempt-1');
                    faceCount = e1.faceCount;
                    humanCount = e1.humanCount;
                    identityFailure = e1.identity;
                    identityNotes = e1.notes;

                    const needsRetry =
                      identityFailure !== null ||
                      (faceCount !== null && faceCount !== expectedFaces) ||
                      (humanCount !== null && humanCount !== expectedFaces);
                    if (needsRetry) {
                      console.log(`[compose-video-clips] anchor scene ${scene.id}: attempt-1 failed (faces=${faceCount}/${expectedFaces} humans=${humanCount}/${expectedFaces} identity=${identityFailure}) → strict retry`);
                      await invalidateCache();
                      const retryUrl = await composeAnchor('attempt-2', true);
                      if (retryUrl) {
                        const e2 = await evaluate(retryUrl, 'attempt-2');
                        composedUrl = retryUrl;
                        faceCount = e2.faceCount;
                        humanCount = e2.humanCount;
                        identityFailure = e2.identity;
                        identityNotes = e2.notes;
                      }
                    }
                  }
                }

                if (composedUrl) {
                  scene.referenceImageUrl = composedUrl;
                  if (!skipAuditPersist) {
                    const okFinal =
                      identityFailure === null &&
                      (faceCount === null || faceCount === expectedFaces) &&
                      (humanCount === null || humanCount === expectedFaces);
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
                    };
                    const { data: currentPlanRow } = await supabaseAdmin
                      .from('composer_scenes')
                      .select('audio_plan')
                      .eq('id', scene.id)
                      .maybeSingle();
                    const baseAudioPlan = ((currentPlanRow as any)?.audio_plan ?? (scene as any).audioPlan ?? {}) as Record<string, any>;
                    const {
                      faceMap: _staleFaceMap,
                      syncJobs: _staleSyncJobs,
                      heartbeat: _staleHeartbeat,
                      anchor_face_audit: _oldAnchorAudit,
                      ...twoshotWithoutAnchorDerivedState
                    } = ((baseAudioPlan.twoshot ?? {}) as Record<string, any>);
                    await supabaseAdmin
                      .from('composer_scenes')
                      .update({
                        reference_image_url: composedUrl,
                        updated_at: new Date().toISOString(),
                        audio_plan: { ...baseAudioPlan, twoshot: { ...twoshotWithoutAnchorDerivedState, ...auditMeta } },
                      })
                      .eq('id', scene.id);
                  }
                  console.log(`[compose-video-clips] cinematic-sync scene ${scene.id}: anchor pinned (faces=${faceCount ?? '?'}/${expectedFaces}, humans=${humanCount ?? '?'}/${expectedFaces}, identity=${identityFailure ?? 'ok'}) → ${composedUrl.slice(0, 80)}…`);

                  // Hard-abort BEFORE Hailuo/Sync.so spend credits.
                  const reasonMap: Record<string, string> = {
                    clone: 'anchor_identity_duplicate_detected',
                    extra: 'anchor_extra_person_detected',
                    missing: 'anchor_identity_missing_detected',
                    ambiguous: 'anchor_identity_ambiguous',
                  };
                  if (identityFailure) {
                    const code = reasonMap[identityFailure] ?? 'anchor_identity_failed';
                    const msg = `${code}: ${identityNotes || identityFailure} (faces=${faceCount ?? '?'}/${expectedFaces}, humans=${humanCount ?? '?'}/${expectedFaces}) — Anchor wurde 2× neu gerendert und ist weiterhin nicht sauber. Bitte "🎥 Clip + Lip-Sync neu rendern" drücken oder Charakter-Portraits prüfen.`;
                    await supabaseAdmin.from('composer_scenes').update({ clip_status: 'failed', clip_error: msg, updated_at: new Date().toISOString() }).eq('id', scene.id);
                    results.push({ sceneId: scene.id, status: 'failed', error: msg });
                    continue;
                  }
                  if (humanCount !== null && humanCount > expectedFaces) {
                    const msg = `anchor_extra_person_detected: ${humanCount}/${expectedFaces} Personen sichtbar — ein zusätzlicher Mensch wurde in die Szene gerendert (eventuell im Profil/Hintergrund).`;
                    await supabaseAdmin.from('composer_scenes').update({ clip_status: 'failed', clip_error: msg, updated_at: new Date().toISOString() }).eq('id', scene.id);
                    results.push({ sceneId: scene.id, status: 'failed', error: msg });
                    continue;
                  }
                  if (faceCount !== null && faceCount < expectedFaces && (humanCount === null || humanCount < expectedFaces)) {
                    const msg = `anchor_missing_speakers: ${faceCount}/${expectedFaces} Gesichter sichtbar nach 2 Compose-Versuchen`;
                    console.warn(`[compose-video-clips] cinematic-sync scene ${scene.id}: aborting — ${msg}`);
                    await supabaseAdmin
                      .from('composer_scenes')
                      .update({
                        clip_status: 'failed',
                        clip_error: msg,
                        updated_at: new Date().toISOString(),
                      })
                      .eq('id', scene.id);
                    results.push({ sceneId: scene.id, status: 'failed', error: msg });
                    continue;
                  }
                  if (faceCount !== null && faceCount > expectedFaces) {
                    const msg = `anchor_extra_person_detected: ${faceCount}/${expectedFaces} Gesichter sichtbar — eine zusätzliche Person wurde gerendert.`;
                    await supabaseAdmin.from('composer_scenes').update({ clip_status: 'failed', clip_error: msg, updated_at: new Date().toISOString() }).eq('id', scene.id);
                    results.push({ sceneId: scene.id, status: 'failed', error: msg });
                    continue;
                  }
                }

              }
            }
          } catch (anchorErr) {
            console.warn(`[compose-video-clips] cinematic-sync scene ${scene.id}: multi-cast anchor safety net failed:`, anchorErr);
          }
        } catch (extErr) {
          console.warn(`[compose-video-clips] Cinematic-Sync auto-extend failed for ${scene.id}:`, extErr);
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
        const engine = scene.engineOverride ?? 'auto';
        const src = String(scene.clipSource ?? '');
        const isI2V = src.startsWith('ai-') && src !== 'ai-vidu';
        const isHeygenRoute = engine === 'heygen';
        const isCinematicSync = engine === 'cinematic-sync'; // already handled above
        const refUrl = String(scene.referenceImageUrl ?? '');
        const looksComposed = refUrl.includes('/scene-anchors/') || refUrl.includes('/composer-anchors/');
        if (isI2V && !isHeygenRoute && !isCinematicSync && !refUrl) {
          const castShotsRaw = (scene.characterShots ?? []).filter(
            (s) => s && s.shotType !== 'absent' && s.characterId,
          );
          // Also accept the legacy singular characterShot.
          if (castShotsRaw.length === 0 && scene.characterShot && scene.characterShot.shotType !== 'absent') {
            castShotsRaw.push(scene.characterShot);
          }
          // Speaker-list override (same logic as cinematic-sync above): when
          // a dialog script is present, only the people who actually speak
          // get a portrait slot in the anchor.
          const scriptSpeakers = uniqueSpeakerSlugsFromScript(scene.dialogScript);
          let castShots = castShotsRaw;
          if (scriptSpeakers.length > 0) {
            const remapped = scriptSpeakers
              .map((slug) => resolveSpeakerToShot(slug, castShotsRaw))
              .filter((x): x is { characterId: string; shotType: CharacterShotType } => !!x);
            if (remapped.length >= 1) castShots = remapped;
          }
          if (castShots.length >= 1 && !looksComposed) {
            const portraitUrls = castShots
              .map((cs) => charById.get(cs.characterId)?.referenceImageUrl)
              .filter((u): u is string => typeof u === 'string' && u.length > 0)
              .slice(0, 4);
            const characterNames = castShots
              .map((cs) => charById.get(cs.characterId)?.name)
              .filter((n): n is string => typeof n === 'string' && n.length > 0);
            if (portraitUrls.length >= 1) {
              const neutralFallback =
                portraitUrls.length >= 2
                  ? neutralTwoShotPrompt(characterNames, portraitUrls.length)
                  : 'Natural cinematic scene, photorealistic, no rendered text.';
              const anchorPrompt = scriptSpeakers.length >= 2
                ? neutralFallback
                : (stripDialogForAnchor(scene.aiPrompt || '') || neutralFallback);
              console.log(`[compose-video-clips] universal anchor for ${src} scene ${scene.id}: composing ${portraitUrls.length} portrait(s) (speakers=${scriptSpeakers.length})`);
              try {
                const anchorResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/compose-scene-anchor`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader,
                  },
                  body: JSON.stringify({
                    sceneId: scene.id,
                    portraitUrl: portraitUrls[0],
                    portraitUrls,
                    characterNames,
                    scenePrompt: anchorPrompt,
                    aspectRatio: '16:9',
                    shotType: castShots[0]?.shotType,
                  }),
                });
                if (anchorResp.ok) {
                  const aj = await anchorResp.json().catch(() => ({}));
                  if (aj?.composedUrl) {
                    scene.referenceImageUrl = aj.composedUrl;
                    await supabaseAdmin
                      .from('composer_scenes')
                      .update({ reference_image_url: aj.composedUrl, updated_at: new Date().toISOString() })
                      .eq('id', scene.id);
                    console.log(`[compose-video-clips] universal anchor scene ${scene.id}: composed → ${aj.composedUrl.slice(0, 80)}…`);
                  }
                } else {
                  const errTxt = await anchorResp.text().catch(() => '');
                  console.warn(`[compose-video-clips] universal anchor scene ${scene.id}: compose-scene-anchor failed ${anchorResp.status} ${errTxt.slice(0, 200)}`);
                }
              } catch (anchorErr) {
                console.warn(`[compose-video-clips] universal anchor scene ${scene.id} exception:`, anchorErr);
              }
            }
          }
        }
      } catch (universalAnchorErr) {
        console.warn(`[compose-video-clips] universal anchor outer failed for ${scene.id}:`, universalAnchorErr);
      }

      // ── HeyGen routing branch ─────────────────────────────────────────────
      // Triggered when:
      //   • engineOverride === 'heygen'  OR
      //   • engineOverride === 'auto' AND scene has dialog text AND a cast character
      // Multi-speaker MVP: renders the FIRST speaker's portion (full text in
      // their voice). Per-speaker stitching is future work.
      try {
        const override = scene.engineOverride ?? 'auto';
        const hasDialog = sceneHasDialogText(scene.dialogScript);
        const primaryShot = scene.characterShots?.find((s) => s && s.shotType !== 'absent')
          ?? (scene.characterShot && scene.characterShot.shotType !== 'absent' ? scene.characterShot : undefined);
        const dialogSpeakers = countDialogSpeakers(scene.dialogScript);
        // Multi-speaker scenes must NEVER auto-route to HeyGen — that would
        // make the first speaker's portrait lip-sync the FULL dialog text
        // (i.e. "one character speaks for both"). Multi-speaker dialog plays
        // as voiceover overlay over the regular AI clip; explicit
        // shot-reverse-shot split scenes (each with 1 speaker) handle real
        // per-person lip-sync.
        const wantsHeygen =
          (override === 'heygen' && dialogSpeakers <= 1) ||
          (override === 'auto' && hasDialog && !!primaryShot && dialogSpeakers <= 1);

        if (wantsHeygen) {
          if (!hasDialog) {
            console.warn(`[compose-video-clips] Scene ${scene.id} forced HeyGen but has no dialogScript — falling back to ${scene.clipSource}.`);
          } else if (!primaryShot) {
            console.warn(`[compose-video-clips] Scene ${scene.id} wants HeyGen but no cast character — falling back to ${scene.clipSource}.`);
          } else {
            const character = charById.get(primaryShot.characterId);
            const portraitUrl = character?.referenceImageUrl;
            const voiceCfg = scene.dialogVoices?.[primaryShot.characterId];
            const voiceCfgObj = (typeof voiceCfg === 'object' && voiceCfg) ? voiceCfg as DialogVoiceCfg : undefined;
            const voiceId = resolveDialogVoiceId(voiceCfg);
            const voiceProvider = (voiceCfgObj?.provider || '').toString().toUpperCase();
            const voiceEngine = (voiceCfgObj?.engine || '').toString().toLowerCase();
            const isHumeVoice = voiceProvider === 'HUME_AI' || voiceProvider === 'CUSTOM_VOICE' || voiceEngine === 'hume';
            const cleanText = stripSpeakerPrefixes(scene.dialogScript!);
            const speakerCount = Math.max(1, countDialogSpeakers(scene.dialogScript));

            if (!portraitUrl) {
              console.warn(`[compose-video-clips] Scene ${scene.id} HeyGen route — character ${primaryShot.characterId} has no portrait, falling back to ${scene.clipSource}.`);
            } else if (!cleanText) {
              console.warn(`[compose-video-clips] Scene ${scene.id} HeyGen route — empty cleaned dialog, falling back to ${scene.clipSource}.`);
            } else {
              if (speakerCount > 1) {
                console.warn(`[compose-video-clips] Scene ${scene.id} HeyGen route: ${speakerCount} speakers detected — MVP uses first speaker only.`);
              }

              await supabaseAdmin
                .from('composer_scenes')
                .update({
                  clip_status: 'generating',
                  clip_quality: quality,
                  clip_error: null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', scene.id);

              // ── Pre-synthesize audio for non-ElevenLabs voices ──
              // HeyGen's text-mode TTS path only supports ElevenLabs voice IDs.
              // If the user picked a Hume voice, synthesize it first via
              // generate-voiceover-hume and pass the resulting audioUrl
              // to generate-talking-head (which supports the audioUrl path).
              let preSynthAudioUrl: string | undefined;
              if (isHumeVoice) {
                const humeVoiceName = voiceCfgObj?.voiceName || voiceCfgObj?.voiceId;
                if (!humeVoiceName) {
                  const msg = `Hume-Stimme für "${character?.name || primaryShot.characterId}" hat keinen Voice-Namen. Bitte im Voiceover-Tab erneut wählen.`;
                  console.error(`[compose-video-clips] Scene ${scene.id} Hume voice has no name`, voiceCfgObj);
                  await supabaseAdmin
                    .from('composer_scenes')
                    .update({ clip_status: 'failed', clip_error: msg, updated_at: new Date().toISOString() })
                    .eq('id', scene.id);
                  results.push({ sceneId: scene.id, status: 'failed', error: msg });
                  continue;
                }
                try {
                  const humeResp = await fetch(`${supabaseUrl}/functions/v1/generate-voiceover-hume`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': authHeader,
                    },
                    body: JSON.stringify({
                      text: cleanText,
                      voiceName: humeVoiceName,
                      provider: voiceProvider === 'CUSTOM_VOICE' ? 'CUSTOM_VOICE' : 'HUME_AI',
                      projectId,
                    }),
                  });
                  if (!humeResp.ok) {
                    const errTxt = await humeResp.text();
                    throw new Error(`Hume TTS ${humeResp.status}: ${errTxt.slice(0, 300)}`);
                  }
                  const humeData = await humeResp.json();
                  preSynthAudioUrl = humeData?.audioUrl;
                  if (!preSynthAudioUrl) throw new Error('Hume response missing audioUrl');
                  console.log(`[compose-video-clips] Scene ${scene.id} Hume TTS ok → ${preSynthAudioUrl.substring(0, 80)}…`);
                } catch (humeErr) {
                  const msg = `Hume-Stimme "${humeVoiceName}" konnte nicht synthetisiert werden — bitte im Voiceover-Tab eine andere Stimme wählen. (${humeErr instanceof Error ? humeErr.message : String(humeErr)})`;
                  console.error(`[compose-video-clips] Scene ${scene.id} Hume synth failed:`, humeErr);
                  await supabaseAdmin
                    .from('composer_scenes')
                    .update({ clip_status: 'failed', clip_error: msg, updated_at: new Date().toISOString() })
                    .eq('id', scene.id);
                  results.push({ sceneId: scene.id, status: 'failed', error: msg });
                  continue;
                }
              } else if (voiceId && voiceId.length < 16) {
                // Defensive: voiceIds that look like display names (short, contain spaces)
                // are almost certainly NOT ElevenLabs IDs (which are 20+ char alnum).
                const looksLikeName = /\s/.test(voiceId) || /[^A-Za-z0-9]/.test(voiceId);
                if (looksLikeName) {
                  const msg = `Stimme "${voiceId}" ist keine gültige ElevenLabs-Voice-ID. Bitte im Voiceover-Tab eine ElevenLabs-Stimme oder eine Hume-Stimme wählen.`;
                  console.error(`[compose-video-clips] Scene ${scene.id} suspicious voiceId:`, voiceId, voiceCfgObj);
                  await supabaseAdmin
                    .from('composer_scenes')
                    .update({ clip_status: 'failed', clip_error: msg, updated_at: new Date().toISOString() })
                    .eq('id', scene.id);
                  results.push({ sceneId: scene.id, status: 'failed', error: msg });
                  continue;
                }
              }

              const heygenBody: Record<string, unknown> = {
                sceneId: scene.id,
                projectId,
                imageUrl: portraitUrl,
                aspectRatio: '16:9',
                resolution: '720p',
                composerCharacterId: character?.id,
              };
              if (preSynthAudioUrl) {
                heygenBody.audioUrl = preSynthAudioUrl;
              } else {
                heygenBody.text = cleanText;
                if (voiceId) heygenBody.voiceId = voiceId;
              }

              const heygenResp = await fetch(`${supabaseUrl}/functions/v1/generate-talking-head`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': authHeader,
                },
                body: JSON.stringify(heygenBody),
              });

              if (!heygenResp.ok) {
                const errBody = await heygenResp.text();
                console.error(`[compose-video-clips] HeyGen scene ${scene.id} failed:`, heygenResp.status, errBody);
                let userMsg = `HeyGen-Render fehlgeschlagen (${heygenResp.status}).`;
                if (errBody.includes('invalid_uid') || errBody.includes('An invalid ID has been received')) {
                  userMsg = `Die gewählte Stimme ist keine gültige ElevenLabs-Voice. Bitte im Voiceover-Tab eine ElevenLabs- oder Hume-Stimme wählen.`;
                }
                await supabaseAdmin
                  .from('composer_scenes')
                  .update({ clip_status: 'failed', clip_error: userMsg, updated_at: new Date().toISOString() })
                  .eq('id', scene.id);
                results.push({ sceneId: scene.id, status: 'failed', error: userMsg });
              } else {
                const heygenData = await heygenResp.json();
                console.log(`[compose-video-clips] HeyGen scene ${scene.id} → video_id=${heygenData.predictionId}`);

                // Deduct HeyGen credits (~€0.30 per speaker; MVP single speaker = €0.30).
                try {
                  const heygenCost = 0.30 * Math.max(1, Math.min(4, speakerCount));
                  await supabaseAdmin.rpc('deduct_ai_video_credits', {
                    p_user_id: user.id,
                    p_amount: heygenCost,
                    p_generation_id: projectId,
                  });
                  console.log(`[compose-video-clips] Deducted €${heygenCost.toFixed(2)} for HeyGen scene ${scene.id}`);
                } catch (credErr) {
                  console.error('[compose-video-clips] HeyGen credit deduction failed:', credErr);
                }

                results.push({ sceneId: scene.id, status: 'generating', predictionId: heygenData.predictionId });
              }
              continue; // skip the regular per-source dispatch for this scene
            }
          }
        }

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
          const isCinematicSyncScene = (scene.engineOverride ?? 'auto') === 'cinematic-sync';

          await supabaseAdmin
            .from('composer_scenes')
            .update({
              clip_status: 'generating',
              clip_quality: quality,
              ...(isCinematicSyncScene ? { lip_sync_source_clip_url: null, lip_sync_status: 'pending', twoshot_stage: 'master_clip' } : {}),
              clip_lead_in_trim_seconds: computeLeadInTrim('ai-hailuo', isI2V),
              updated_at: new Date().toISOString(),
            })
            .eq('id', scene.id);

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
            console.log(`[compose-video-clips] Hailuo scene ${scene.id} uses reference image (lead-in trim ${computeLeadInTrim('ai-hailuo', true)}s)`);
          }


          const prediction = await replicate.predictions.create({
            model: "minimax/hailuo-2.3",
            input: hailuoInput,
            webhook: `${webhookUrl}&scene_id=${scene.id}&project_id=${projectId}`,
            webhook_events_filter: ["completed"],
          });

          await supabaseAdmin
            .from('composer_scenes')
            .update({ replicate_prediction_id: prediction.id, ...(isCinematicSyncScene ? { twoshot_stage: 'master_clip' } : {}) })
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
            webhook: `${webhookUrl}&scene_id=${scene.id}&project_id=${projectId}`,
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
            webhook: `${webhookUrl}&scene_id=${scene.id}&project_id=${projectId}`,
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
            webhook: `${webhookUrl}&scene_id=${scene.id}&project_id=${projectId}`,
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
            webhook: `${webhookUrl}&scene_id=${scene.id}&project_id=${projectId}`,
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
            webhook: `${webhookUrl}&scene_id=${scene.id}&project_id=${projectId}`,
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
              webhook: `${webhookUrl}&scene_id=${scene.id}&project_id=${projectId}`,
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

        } else if (scene.clipSource === 'ai-happyhorse') {
          // HappyHorse 1.0 (Alibaba) via Replicate — direct call so the
          // composer-specific webhook fires and updates composer_scenes.
          // (Going through generate-happyhorse-video would only update the
          // toolkit's ai_video_generations table, leaving the scene stuck.)
          const isI2V = !!scene.referenceImageUrl;
          await supabaseAdmin
            .from('composer_scenes')
            .update({
              clip_status: 'generating',
              clip_quality: quality,
              clip_lead_in_trim_seconds: computeLeadInTrim('ai-happyhorse', isI2V),
              updated_at: new Date().toISOString(),
            })
            .eq('id', scene.id);

          const hhDuration = Math.min(15, Math.max(3, Math.round(scene.durationSeconds)));
          const hhResolution = quality === 'pro' ? '1080p' : '720p';
          const hhInput: Record<string, unknown> = {
            prompt: enrichPrompt(scene.aiPrompt, undefined, isI2V),
            duration: hhDuration,
            resolution: hhResolution,
            seed: Math.floor(Math.random() * 2_147_483_647),
          };
          if (isI2V) {
            hhInput.image = scene.referenceImageUrl;
            console.log(`[compose-video-clips] HappyHorse scene ${scene.id} uses image (lead-in trim ${computeLeadInTrim('ai-happyhorse', true)}s)`);
          } else {
            hhInput.aspect_ratio = '16:9';
          }

          const prediction = await replicate.predictions.create({
            model: "alibaba/happyhorse-1.0",
            input: hhInput,
            webhook: `${webhookUrl}&scene_id=${scene.id}&project_id=${projectId}`,
            webhook_events_filter: ["completed"],
          });

          await supabaseAdmin
            .from('composer_scenes')
            .update({ replicate_prediction_id: prediction.id })
            .eq('id', scene.id);

          results.push({ sceneId: scene.id, status: 'generating', predictionId: prediction.id });

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
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error(`[compose-video-clips] FATAL @ stage=${__stage}: ${msg}`, stack || '');
    return new Response(
      JSON.stringify({
        error: msg || "Unknown error",
        code: 'INTERNAL',
        stage: __stage,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
