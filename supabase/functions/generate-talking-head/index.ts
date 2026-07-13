import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts"; // [qa-mock-injected]
import { detectQaServiceAuth } from "../_shared/qaServiceAuth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock, x-qa-real-spend, x-qa-user-id',
};

const HEYGEN_API_KEY = Deno.env.get('HEYGEN_API_KEY')!;
const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const HEYGEN_BASE_V1 = 'https://api.heygen.com/v1';
const HEYGEN_BASE_V2 = 'https://api.heygen.com/v2';
const HEYGEN_UPLOAD_BASE = 'https://upload.heygen.com/v1'; // separate subdomain for asset uploads

interface TalkingHeadRequest {
  sceneId?: string;
  projectId?: string;
  imageUrl: string;
  audioUrl?: string;
  text?: string;
  voiceId?: string;
  customVoiceId?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  resolution?: '480p' | '720p';
  /**
   * Optional: a pre-existing HeyGen `talking_photo_id`. When supplied, the
   * function skips the image upload entirely (and therefore the per-account
   * 3-photo limit). Used by the QA Live Sweep to reuse a cached portrait.
   */
  talkingPhotoId?: string;
  /** Briefing-Cast character id, written to scene's mentioned_character_ids. */
  composerCharacterId?: string;
}

// ---------- ElevenLabs TTS (unchanged from previous version) ----------
async function synthesizeAudio(text: string, voiceId: string): Promise<string> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs TTS failed: ${await response.text()}`);
  }

  const audioBuffer = await response.arrayBuffer();
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const path = `talking-head-tts/${crypto.randomUUID()}.mp3`;
  const { error: uploadError } = await admin.storage
    .from('voiceover-audio')
    .upload(path, audioBuffer, { contentType: 'audio/mpeg' });
  if (uploadError) throw new Error(`Audio upload failed: ${uploadError.message}`);
  const { data: { publicUrl } } = admin.storage.from('voiceover-audio').getPublicUrl(path);
  return publicUrl;
}

// ---------- HeyGen API helpers ----------

// Map our aspectRatio + resolution → HeyGen dimension {width, height}
function mapDimension(aspectRatio: string, resolution: string): { width: number; height: number } {
  const is720 = resolution === '720p';
  switch (aspectRatio) {
    case '16:9': return is720 ? { width: 1280, height: 720 } : { width: 854, height: 480 };
    case '9:16': return is720 ? { width: 720, height: 1280 } : { width: 480, height: 854 };
    case '1:1':  return is720 ? { width: 720, height: 720 } : { width: 480, height: 480 };
    default:     return { width: 720, height: 1280 };
  }
}

// HeyGen Free/Starter plans cap stored Talking Photos (often 3). Each upload
// counts. We pre-clean custom (non-preset) photos so we always have headroom
// before the next upload — otherwise HeyGen returns code 401028 "exceeded
// your limit of N photo avatars".
async function pruneHeyGenTalkingPhotos(maxKeep = 0, preserveId?: string): Promise<void> {
  // ─── PRIMARY PRUNE: avatar_group (PHOTO) ──────────────────────────────
  // Verified live: HeyGen tracks the "3 photo avatars" quota on
  // /v2/avatar_group.list (group_type === "PHOTO"). Deleting via
  // DELETE /v2/avatar_group/{id} returns HTTP 200 {"code":100} on success.
  try {
    const gr = await fetch(`${HEYGEN_BASE_V2}/avatar_group.list`, {
      method: 'GET',
      headers: { 'X-Api-Key': HEYGEN_API_KEY, 'accept': 'application/json' },
    });
    if (gr.ok) {
      const gj = await gr.json();
      const groups: any[] = Array.isArray(gj?.data?.avatar_group_list) ? gj.data.avatar_group_list : [];
      const photoGroups = groups.filter((g) => (g?.group_type || '').toUpperCase() === 'PHOTO');
      let deleted = 0, kept = 0;
      for (const g of photoGroups) {
        if (deleted >= 5) break;
        const id = g?.id;
        if (!id) continue;
        if (preserveId && id === preserveId) { kept++; continue; }
        const dr = await fetch(`${HEYGEN_BASE_V2}/avatar_group/${id}`, {
          method: 'DELETE',
          headers: { 'X-Api-Key': HEYGEN_API_KEY, 'accept': 'application/json' },
        });
        if (dr.ok) {
          deleted++;
        } else {
          console.warn(`[talking-head] prune avatar_group ${id} -> ${dr.status}`);
        }
      }
      console.log(`[talking-head] prune (avatar_groups): total=${photoGroups.length}, deleted=${deleted}, kept=${kept}`);
    } else {
      console.warn(`[talking-head] prune avatar_group.list ${gr.status}, continuing with fallbacks`);
    }
  } catch (e) {
    console.warn('[talking-head] prune avatar_group failed (non-fatal):', e instanceof Error ? e.message : String(e));
  }

  try {
    // The actual quota ("3 photo avatars") is tracked under photo_avatar, not
    // talking_photo.list (which returns HeyGen presets). Try the photo-avatar
    // endpoint first; fall back to v2 avatar.list filtered to type=photo.
    let items: any[] = [];
    let source = 'photo_avatar';

    const paRes = await fetch(`${HEYGEN_BASE_V2}/photo_avatar/photo/list`, {
      method: 'GET',
      headers: { 'X-Api-Key': HEYGEN_API_KEY, 'accept': 'application/json' },
    });
    if (paRes.ok) {
      const j = await paRes.json();
      items = Array.isArray(j?.data?.photos) ? j.data.photos
            : Array.isArray(j?.data) ? j.data
            : [];
    } else {
      console.warn(`[talking-head] prune: photo_avatar list ${paRes.status}, trying avatar.list`);
      const avRes = await fetch(`${HEYGEN_BASE_V2}/avatars`, {
        method: 'GET',
        headers: { 'X-Api-Key': HEYGEN_API_KEY, 'accept': 'application/json' },
      });
      if (avRes.ok) {
        const j = await avRes.json();
        const all = Array.isArray(j?.data?.avatars) ? j.data.avatars : [];
        items = all.filter((a: any) => a?.avatar_type === 'photo' || a?.type === 'photo_avatar');
        source = 'avatars';
      } else {
        console.warn(`[talking-head] prune: avatar.list ${avRes.status}, skipping`);
        return;
      }
    }

    // Never delete the preserved (cached QA) avatar.
    const candidates = items.filter((x) => {
      const id = x?.id || x?.photo_avatar_id || x?.avatar_id;
      return id && (!preserveId || id !== preserveId);
    });
    // Hard-cap: never delete more than 10 per invocation to avoid blocking the
    // function for minutes if HeyGen returns a large/unexpected list.
    const toDelete = candidates.slice(0, Math.max(0, candidates.length - maxKeep)).slice(0, 10);
    console.log(`[talking-head] prune (${source}): ${items.length} total, ${candidates.length} deletable, deleting ${toDelete.length}`);
    let deletedCount = 0;
    for (const item of toDelete) {
      const id = item?.id || item?.photo_avatar_id || item?.avatar_id;
      if (!id) continue;
      // Try photo_avatar delete first, fall back to talking_photo
      let dr = await fetch(`${HEYGEN_BASE_V2}/photo_avatar/${id}`, {
        method: 'DELETE',
        headers: { 'X-Api-Key': HEYGEN_API_KEY },
      });
      if (dr.status === 404) {
        dr = await fetch(`${HEYGEN_BASE_V2}/talking_photo/${id}`, {
          method: 'DELETE',
          headers: { 'X-Api-Key': HEYGEN_API_KEY },
        });
      }
      if (dr.ok) deletedCount++;
      console.log(`[talking-head] prune: delete ${id} -> ${dr.status}`);
    }

    // Fallback: when neither v2 endpoint surfaced the actual user-uploaded
    // talking_photos (quota lives on /v1/talking_photo.list), iterate that
    // list in reverse (newest user uploads tend to be at the end), DELETE
    // each via /v2/talking_photo/{id}, hard-cap 30 tries, early-exit after
    // 3 successful deletes (frees the entire 3-photo quota).
    if (deletedCount === 0) {
      try {
        const lr = await fetch(`${HEYGEN_BASE_V1}/talking_photo.list`, {
          method: 'GET',
          headers: { 'X-Api-Key': HEYGEN_API_KEY, 'accept': 'application/json' },
        });
        if (lr.ok) {
          const lj = await lr.json();
          const list: any[] = Array.isArray(lj?.data) ? lj.data
                            : Array.isArray(lj?.data?.list) ? lj.data.list
                            : Array.isArray(lj?.data?.talking_photos) ? lj.data.talking_photos
                            : [];
          const reversed = [...list].reverse();
          let tried = 0, deleted = 0, skipped404 = 0;
          for (const item of reversed) {
            if (tried >= 30 || deleted >= 3) break;
            const id = item?.talking_photo_id || item?.id;
            if (!id) continue;
            if (preserveId && id === preserveId) continue;
            tried++;
            const dr = await fetch(`${HEYGEN_BASE_V2}/talking_photo/${id}`, {
              method: 'DELETE',
              headers: { 'X-Api-Key': HEYGEN_API_KEY },
            });
            if (dr.ok) deleted++;
            else if (dr.status === 404) skipped404++;
          }
          console.log(`[talking-head] prune (talking_photo v1 fallback): tried=${tried}, deleted=${deleted}, skipped404=${skipped404}`);
        } else {
          console.warn(`[talking-head] prune v1 fallback: list ${lr.status}, skipping`);
        }
      } catch (e2) {
        console.warn('[talking-head] prune v1 fallback failed (non-fatal):', e2 instanceof Error ? e2.message : String(e2));
      }
    }
  } catch (e) {
    console.warn('[talking-head] prune failed (non-fatal):', e instanceof Error ? e.message : String(e));
  }
}

// Upload an image or audio URL to HeyGen as an asset → returns talking_photo_id or audio_asset_id
// Upload an image URL to HeyGen as a Talking Photo → returns talking_photo_id
// Endpoint: https://upload.heygen.com/v1/talking_photo  (NOT /v1/asset — that
// returns a generic asset id which is NOT a valid talking_photo_id and would
// fail later with "avatar look not found" in /v2/video/generate.)
async function uploadHeyGenTalkingPhoto(sourceUrl: string): Promise<string> {
  // Always prune custom photos first so the next upload doesn't trip the
  // free-plan limit. Keep 0 — we don't reuse, we re-upload per render.
  // Read the cached QA preset id (if any) so we never delete it.
  let preserveId: string | undefined;
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: cfgRow } = await admin
      .from('system_config')
      .select('value')
      .eq('key', 'qa.heygen_talking_photo_id')
      .maybeSingle();
    const v: any = cfgRow?.value;
    preserveId = typeof v === 'string' ? v : (v && typeof v === 'object' && 'id' in v ? String(v.id) : undefined);
  } catch (_e) { /* non-fatal */ }

  await pruneHeyGenTalkingPhotos(0, preserveId);
  // Note: legacy /v1/talking_photo.list returns HeyGen's preset library (hundreds
  // of items, all 404 on DELETE) and used to block this function for minutes.
  // The /v2/photo_avatar/photo/list path above is the correct quota source.

  const srcRes = await fetch(sourceUrl);
  if (!srcRes.ok) throw new Error(`Failed to fetch source image from ${sourceUrl}: ${srcRes.status}`);
  const blob = await srcRes.blob();
  let buffer = await blob.arrayBuffer();
  let contentType: 'image/jpeg' | 'image/png' =
    (blob.type || '').toLowerCase() === 'image/png' ? 'image/png' : 'image/jpeg';
  console.log(`[talking-head] Source image fetched: ${buffer.byteLength} bytes, type=${blob.type}`);

  // Normalize: re-encode to JPEG ≤2048px, ≤8MB. HeyGen 500/40099 is most often
  // triggered by oversized PNGs, WebP-as-JPEG, EXIF-rotated phone shots etc.
  const needsNormalize =
    buffer.byteLength > 8 * 1024 * 1024 ||
    !['image/png', 'image/jpeg'].includes((blob.type || '').toLowerCase());
  if (needsNormalize) {
    try {
      const { Image } = await import('npm:imagescript@1.3.0');
      const img: any = await Image.decode(new Uint8Array(buffer));
      const maxSide = 2048;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      if (scale < 1) img.resize(Math.round(img.width * scale), Math.round(img.height * scale));
      const jpg = await img.encodeJPEG(85);
      buffer = jpg.buffer.slice(jpg.byteOffset, jpg.byteOffset + jpg.byteLength) as ArrayBuffer;
      contentType = 'image/jpeg';
      console.log(`[talking-head] Normalized to ${img.width}x${img.height} JPEG, ${buffer.byteLength} bytes`);
    } catch (e: any) {
      console.warn(`[talking-head] image normalize failed (uploading raw): ${e?.message}`);
    }
  }

  // Retry transient HeyGen failures (5xx, 408, 429, vendor 40099).
  const RETRY_DELAYS_MS = [0, 1500, 4000];
  let lastStatus = 0;
  let lastBody = '';
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (RETRY_DELAYS_MS[attempt] > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
    const uploadRes = await fetch(`${HEYGEN_UPLOAD_BASE}/talking_photo`, {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        'Content-Type': contentType,
        'accept': 'application/json',
      },
      body: buffer,
    });
    const respText = await uploadRes.text();
    lastStatus = uploadRes.status;
    lastBody = respText;
    console.log(
      `[talking-head] HeyGen upload attempt ${attempt + 1}/${RETRY_DELAYS_MS.length} status=${uploadRes.status}, body[0..200]=${respText.slice(0, 200)}`,
    );

    if (uploadRes.ok) {
      let json: any;
      try { json = JSON.parse(respText); }
      catch { throw new Error(`HeyGen talking_photo upload returned non-JSON: ${respText.slice(0, 200)}`); }
      const talkingPhotoId = json?.data?.talking_photo_id;
      if (!talkingPhotoId) {
        throw new Error(`HeyGen talking_photo upload missing talking_photo_id: ${JSON.stringify(json).slice(0, 200)}`);
      }
      return talkingPhotoId;
    }

    // Non-retryable: avatar-limit hit
    if (respText.includes('401028') || /photo avatars/i.test(respText)) {
      throw new Error('HEYGEN_AVATAR_LIMIT: HeyGen-Avatar-Kontingent voll — bitte einen Moment warten und erneut versuchen. (Auto-Cleanup läuft.)');
    }

    // Retryable categories
    const isTransient =
      uploadRes.status >= 500 ||
      uploadRes.status === 408 ||
      uploadRes.status === 429 ||
      respText.includes('"code":40099');
    if (!isTransient) break; // surface immediately
  }

  // Final failure → typed error so the UI can show a helpful message.
  const tag = lastStatus >= 500 || lastBody.includes('"code":40099')
    ? 'HEYGEN_UPLOAD_TRANSIENT'
    : 'HEYGEN_UPLOAD_REJECTED';
  throw new Error(`${tag}: HeyGen talking_photo upload failed [${lastStatus}] ${lastBody.slice(0, 200)}`);
}

// (legacy preset prune removed — see comment in uploadHeyGenTalkingPhoto)

// Create a video generation request → returns video_id
// Uses talking_photo character + audio voice with direct URL (no audio asset upload needed)
async function createHeyGenVideo(opts: {
  talkingPhotoId: string;
  audioUrl: string;
  dimension: { width: number; height: number };
}): Promise<string> {
  const body = {
    video_inputs: [
      {
        character: {
          type: 'talking_photo',
          talking_photo_id: opts.talkingPhotoId,
        },
        voice: {
          type: 'audio',
          audio_url: opts.audioUrl,
        },
      },
    ],
    dimension: opts.dimension,
  };

  const res = await fetch(`${HEYGEN_BASE_V2}/video/generate`, {
    method: 'POST',
    headers: {
      'X-Api-Key': HEYGEN_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HeyGen video.generate failed [${res.status}]: ${errText.slice(0, 400)}`);
  }

  const json = await res.json();
  const videoId = json?.data?.video_id;
  if (!videoId) throw new Error(`HeyGen video.generate missing video_id: ${JSON.stringify(json).slice(0, 200)}`);
  return videoId;
}

// Poll HeyGen for completion → returns final video_url or throws
async function pollHeyGenVideo(videoId: string): Promise<{ status: string; videoUrl: string | null; error: string | null }> {
  const res = await fetch(`${HEYGEN_BASE_V1}/video_status.get?video_id=${videoId}`, {
    headers: { 'X-Api-Key': HEYGEN_API_KEY },
  });
  if (!res.ok) {
    const errText = await res.text();
    return { status: 'failed', videoUrl: null, error: `Status check failed [${res.status}]: ${errText.slice(0, 200)}` };
  }
  const json = await res.json();
  const data = json?.data || {};
  return {
    status: data.status || 'unknown',
    videoUrl: data.video_url || null,
    error: data.error?.message || data.error || null,
  };
}

// ---------- Background processor: poll HeyGen, download, store, refund on fail ----------
async function processHeyGenJob(opts: {
  videoId: string;
  audioUrl: string;
  imageUrl: string;
  voiceId: string | undefined;
  text: string | undefined;
  aspectRatio: string;
  resolution: string;
  userId: string;
  sceneId: string | undefined;
  estimatedCostEur: number;
}) {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const POLL_INTERVAL_MS = 5_000;
  const MAX_DURATION_MS = 5 * 60 * 1000; // 5 minutes
  const start = Date.now();

  console.log(`[talking-head] Background poll start for video_id=${opts.videoId}`);

  while (Date.now() - start < MAX_DURATION_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const poll = await pollHeyGenVideo(opts.videoId);
      console.log(`[talking-head] poll status=${poll.status}`);

      if (poll.status === 'completed' && poll.videoUrl) {
        // Download video from HeyGen CDN, re-upload to our storage
        try {
          const dlRes = await fetch(poll.videoUrl);
          if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`);
          const videoBuffer = await dlRes.arrayBuffer();
          const path = `${opts.userId}/${crypto.randomUUID()}.mp4`;
          const { error: upErr } = await admin.storage
            .from('talking-head-renders')
            .upload(path, videoBuffer, { contentType: 'video/mp4' });

          let finalUrl = poll.videoUrl;
          if (!upErr) {
            const { data: { publicUrl } } = admin.storage.from('talking-head-renders').getPublicUrl(path);
            finalUrl = publicUrl;
          } else {
            console.warn(`[talking-head] Re-upload failed (using HeyGen CDN url): ${upErr.message}`);
          }

          if (opts.sceneId) {
            await admin.from('composer_scenes').update({
              clip_url: finalUrl,
              clip_status: 'ready',
              updated_at: new Date().toISOString(),
            }).eq('id', opts.sceneId);
          }
          console.log(`[talking-head] ✅ Completed for video_id=${opts.videoId}`);
        } catch (e: any) {
          console.error(`[talking-head] Post-completion processing failed: ${e?.message}`);
          await refundCredits(admin, opts.userId, opts.videoId, opts.estimatedCostEur, opts.sceneId, `Post-processing failed: ${e?.message}`);
        }
        return;
      }

      if (poll.status === 'failed') {
        console.error(`[talking-head] HeyGen reported failed: ${poll.error}`);
        await refundCredits(admin, opts.userId, opts.videoId, opts.estimatedCostEur, opts.sceneId, poll.error || 'HeyGen render failed');
        return;
      }
      // status === 'processing' or 'pending' → continue polling
    } catch (e: any) {
      console.error(`[talking-head] Poll iteration error: ${e?.message}`);
    }
  }

  // Timeout fallback
  console.error(`[talking-head] Timeout after 5min for video_id=${opts.videoId}`);
  const admin2 = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  await refundCredits(admin2, opts.userId, opts.videoId, opts.estimatedCostEur, opts.sceneId, 'HeyGen render timed out after 5min');
}

// Idempotent credit refund (per-job). Uses existing refund_ai_video_credits RPC
// which expects a UUID generation_id. We deterministically derive a UUID from
// the HeyGen video_id so retries are idempotent (same video_id → same UUID).
async function refundCredits(
  admin: ReturnType<typeof createClient>,
  userId: string,
  videoId: string,
  amountEur: number,
  sceneId: string | undefined,
  reason: string,
) {
  try {
    if (sceneId) {
      await admin.from('composer_scenes').update({
        clip_status: 'failed',
        clip_error: reason.slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq('id', sceneId);
    }

    // Derive deterministic UUIDv5-style id from video_id for idempotency
    const enc = new TextEncoder().encode(`heygen-${videoId}`);
    const hash = await crypto.subtle.digest('SHA-256', enc);
    const bytes = new Uint8Array(hash).slice(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    const generationId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

    const { error } = await admin.rpc('refund_ai_video_credits', {
      p_user_id: userId,
      p_amount_euros: amountEur,
      p_generation_id: generationId,
    });

    if (error && !String(error.message || '').toLowerCase().includes('already')) {
      console.error(`[talking-head] Refund RPC failed: ${error.message}`);
    } else {
      console.log(`[talking-head] ✅ Refunded ${amountEur}€ to ${userId} (gen=${generationId}, reason=${reason.slice(0, 80)})`);
    }
  } catch (e: any) {
    console.error(`[talking-head] Refund error: ${e?.message}`);
  }
}

// ---------- Main handler ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "talking-head" });
  }

  // Captured early so the catch-block can always mark the sub-scene as
  // `failed` (even if req.json() below threw or the body was already consumed).
  let earlySceneId: string | undefined;
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const qaSvc = detectQaServiceAuth(req);
    let user: { id: string } | null = null;
    if (qaSvc.isQaService && qaSvc.userId) {
      user = { id: qaSvc.userId };
      console.log(`[talking-head] QA service-auth user=${user.id}`);
    } else {
      const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: jwtUser }, error: userError } = await userClient.auth.getUser();
      if (userError || !jwtUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      user = jwtUser;
    }

    const body: TalkingHeadRequest = await req.json();
    earlySceneId = body?.sceneId;
    const {
      sceneId,
      imageUrl,
      audioUrl: providedAudioUrl,
      text,
      voiceId,
      customVoiceId,
      aspectRatio = '9:16',
      resolution = '720p',
      talkingPhotoId: presetTalkingPhotoId,
      composerCharacterId,
    } = body;

    if (!imageUrl && !presetTalkingPhotoId) {
      return new Response(JSON.stringify({ error: 'imageUrl or talkingPhotoId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!providedAudioUrl && !text) {
      return new Response(JSON.stringify({ error: 'Either audioUrl or text+voiceId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Get audio URL (synthesize TTS if needed)
    let audioUrl = providedAudioUrl;
    if (!audioUrl && text) {
      const finalVoiceId = customVoiceId || voiceId || 'EXAVITQu4vr4xnSDxMaL';
      console.log(`[talking-head] Synthesizing TTS with voice ${finalVoiceId}`);
      audioUrl = await synthesizeAudio(text, finalVoiceId);
    }
    if (!audioUrl) throw new Error('Audio URL missing after synthesis');

    // Step 2: Resolve the HeyGen talking_photo_id.
    // - If the caller supplied a preset talkingPhotoId (QA Live Sweep cached
    //   bootstrap photo), reuse it and skip the upload entirely. This avoids
    //   HeyGen's per-account 3-photo limit (error 401028).
    // - Otherwise upload the image as a fresh Talking Photo.
    let talkingPhotoId: string;
    if (presetTalkingPhotoId) {
      console.log(`[talking-head] reusing preset talking_photo_id=${presetTalkingPhotoId}`);
      talkingPhotoId = presetTalkingPhotoId;
    } else {
      console.log(`[talking-head] Uploading talking-photo image to HeyGen…`);
      talkingPhotoId = await uploadHeyGenTalkingPhoto(imageUrl);
      console.log(`[talking-head] talking_photo_id=${talkingPhotoId}`);
    }

    // Step 3: Create video generation job (audio passed as URL, not asset)
    const dimension = mapDimension(aspectRatio, resolution);
    const videoId = await createHeyGenVideo({ talkingPhotoId, audioUrl, dimension });
    console.log(`[talking-head] HeyGen video_id=${videoId}`);

    // Step 4: Update scene with processing status
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    if (sceneId) {
      const sceneUpdate: Record<string, unknown> = {
        character_image_url: imageUrl,
        character_audio_url: audioUrl,
        character_voice_id: voiceId || customVoiceId,
        character_script: text,
        talking_head_aspect: aspectRatio,
        talking_head_resolution: resolution,
        replicate_prediction_id: videoId, // reusing column to store HeyGen video_id
        clip_status: 'generating',
        clip_url: null,
        updated_at: new Date().toISOString(),
      };
      if (composerCharacterId) {
        sceneUpdate.mentioned_character_ids = [composerCharacterId];
      }
      await admin.from('composer_scenes').update(sceneUpdate).eq('id', sceneId);
    }

    // Step 5: Schedule background polling
    const estimatedCostEur = 0.30; // HeyGen photo avatar pricing approximation
    const jobOpts = {
      videoId, audioUrl, imageUrl,
      voiceId: voiceId || customVoiceId, text,
      aspectRatio, resolution,
      userId: user.id, sceneId,
      estimatedCostEur,
    };

    // @ts-ignore EdgeRuntime is available in Supabase Edge Runtime
    if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(processHeyGenJob(jobOpts));
    } else {
      processHeyGenJob(jobOpts).catch((e) => console.error('[talking-head] background error:', e));
    }

    return new Response(JSON.stringify({
      success: true,
      predictionId: videoId,
      status: 'processing',
      videoUrl: null,
      audioUrl,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[talking-head] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Always mark the sub-scene as failed so the UI doesn't show
    // "generating…" forever after an upload/HeyGen failure.
    try {
      if (earlySceneId) {
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        await admin.from('composer_scenes').update({
          clip_status: 'failed',
          clip_error: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        }).eq('id', earlySceneId);
      }
    } catch (_e) { /* non-fatal */ }
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
