/**
 * compose-twoshot-audio — Two-Shot Hook audio prep for the AI Video Composer.
 *
 * Takes a scene with a multi-speaker dialog_script (e.g. "Matthew: Hi\nSarah: Hello")
 * and the per-speaker `dialog_voices` config, and produces ONE merged WAV
 * voiceover that contains every speaker in script order separated by a small
 * silence gap. Stored as a single `scene_audio_clips` row (kind='voiceover')
 * so the existing `compose-lipsync-scene` Sync.so flow can run on it
 * unchanged.
 *
 * Why merge in Deno instead of ffmpeg: edge runtime has no ffmpeg. We request
 * raw PCM (16-bit signed LE, 44.1 kHz, mono) from ElevenLabs, concatenate the
 * buffers with N bytes of zeros for the inter-speaker pause, then wrap the
 * final buffer with a WAV RIFF header. ~50 lines, no native deps.
 *
 * Idempotent: if a merged voiceover for this scene already exists, returns
 * its URL without re-spending TTS credits unless `force_regenerate=true`.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const SAMPLE_RATE = 44100;
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;
const INTER_SPEAKER_GAP_SEC = 0.25;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface DialogBlock {
  speakerName: string; // normalized lower-case key for matching dialog_voices
  rawSpeaker: string; // original casing
  text: string;
}

/** Split "Matthew: hi\nSarah: hello" into ordered blocks. */
function parseDialogScript(script: string): DialogBlock[] {
  const blocks: DialogBlock[] = [];
  const lines = script.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*\[?([A-Za-zÀ-ÿ][\w\s.'-]{1,40}?)\]?\s*[:：]\s*(.+)$/);
    if (!m) continue;
    const rawSpeaker = m[1].trim();
    const text = m[2].trim();
    if (!text) continue;
    blocks.push({
      speakerName: rawSpeaker.toLowerCase().split(/\s+/)[0], // first name
      rawSpeaker,
      text,
    });
  }
  return blocks;
}

/** Look up voiceId from dialog_voices keyed by speaker id, character id, or first-name match. */
function resolveVoiceId(
  block: DialogBlock,
  dialogVoices: Record<string, { voiceId?: string; elevenlabsVoiceId?: string; isCustom?: boolean }>,
  charactersByFirstName: Map<string, { id: string; default_voice_id?: string }>,
): string | null {
  // 1) Exact key match (id-keyed)
  for (const [key, cfg] of Object.entries(dialogVoices)) {
    if (key.toLowerCase() === block.speakerName) {
      return (cfg.isCustom ? cfg.elevenlabsVoiceId : cfg.voiceId) ?? cfg.voiceId ?? null;
    }
  }
  // 2) Match via cast character first-name → its id → dialog_voices entry
  const c = charactersByFirstName.get(block.speakerName);
  if (c) {
    const cfg = dialogVoices[c.id];
    if (cfg) return (cfg.isCustom ? cfg.elevenlabsVoiceId : cfg.voiceId) ?? cfg.voiceId ?? null;
    if (c.default_voice_id) return c.default_voice_id;
  }
  // 3) Take ANY voice from dialog_voices as last resort
  const first = Object.values(dialogVoices)[0];
  return first ? ((first.isCustom ? first.elevenlabsVoiceId : first.voiceId) ?? first.voiceId ?? null) : null;
}

async function elevenlabsPcm(
  apiKey: string,
  voiceId: string,
  text: string,
): Promise<Uint8Array> {
  // Request raw 16-bit signed LE PCM @ 44.1 kHz so concatenation is trivial.
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_44100`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/pcm",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0.3,
        use_speaker_boost: true,
        speed: 1.0,
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ElevenLabs ${voiceId} failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/** Concatenate PCM buffers with `gapSec` of silence between each. Returns one Uint8Array. */
function concatPcmWithGaps(buffers: Uint8Array[], gapSec: number): Uint8Array {
  const gapBytes = Math.round(gapSec * SAMPLE_RATE) * (BITS_PER_SAMPLE / 8) * CHANNELS;
  const silence = new Uint8Array(gapBytes); // zero-filled
  const total = buffers.reduce((s, b) => s + b.length, 0) + Math.max(0, buffers.length - 1) * gapBytes;
  const out = new Uint8Array(total);
  let off = 0;
  for (let i = 0; i < buffers.length; i++) {
    out.set(buffers[i], off);
    off += buffers[i].length;
    if (i < buffers.length - 1) {
      out.set(silence, off);
      off += silence.length;
    }
  }
  return out;
}

/** Wrap PCM 16-bit mono LE buffer in a 44-byte WAV RIFF header. */
function pcmToWav(pcm: Uint8Array): Uint8Array {
  const dataSize = pcm.length;
  const byteRate = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8);
  const blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8);
  const out = new Uint8Array(44 + dataSize);
  const dv = new DataView(out.buffer);
  // RIFF chunk descriptor
  out.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  dv.setUint32(4, 36 + dataSize, true);
  out.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
  // fmt sub-chunk
  out.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  dv.setUint32(16, 16, true); // sub-chunk size
  dv.setUint16(20, 1, true); // audio format = PCM
  dv.setUint16(22, CHANNELS, true);
  dv.setUint32(24, SAMPLE_RATE, true);
  dv.setUint32(28, byteRate, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, BITS_PER_SAMPLE, true);
  // data sub-chunk
  out.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  dv.setUint32(40, dataSize, true);
  out.set(pcm, 44);
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const elevenKey = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
  if (!elevenKey) return json({ error: "ELEVENLABS_API_KEY not configured" }, 500);
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { scene_id, force_regenerate } = body || {};
    if (!scene_id) return json({ error: "scene_id required" }, 400);

    // Load scene + ownership
    const { data: scene, error: sErr } = await supabase
      .from("composer_scenes")
      .select("id, project_id, dialog_script, dialog_voices, character_shots, character_audio_url, audio_plan")
      .eq("id", scene_id)
      .single();
    if (sErr || !scene) return json({ error: "scene not found" }, 404);

    const { data: project } = await supabase
      .from("composer_projects")
      .select("id, user_id")
      .eq("id", scene.project_id)
      .single();
    if (!project || project.user_id !== user.id) return json({ error: "Forbidden" }, 403);

    const dialogScript: string = (scene as any).dialog_script ?? "";
    const blocks = parseDialogScript(dialogScript);
    if (blocks.length < 2) {
      return json({ error: "single_speaker_or_empty", blocks: blocks.length }, 400);
    }

    // Build first-name → character lookup so we can resolve voices and portraits.
    const charShots = Array.isArray((scene as any).character_shots) ? (scene as any).character_shots : [];
    const charIds = charShots.map((s: any) => s?.characterId).filter(Boolean);
    const { data: characters } = charIds.length
      ? await supabase
          .from("brand_characters")
          .select("id, name, default_voice_id")
          .in("id", charIds)
      : { data: [] as any[] };
    const charByFirstName = new Map<string, { id: string; default_voice_id?: string }>();
    for (const c of characters ?? []) {
      const fn = String(c.name || "").trim().toLowerCase().split(/\s+/)[0];
      if (fn) charByFirstName.set(fn, { id: c.id, default_voice_id: c.default_voice_id ?? undefined });
    }

    const dialogVoices = ((scene as any).dialog_voices ?? {}) as Record<
      string,
      { voiceId?: string; elevenlabsVoiceId?: string; isCustom?: boolean }
    >;

    // Idempotency: if we already have a merged voice clip for this scene,
    // return it (unless caller wants a fresh one).
    if (!force_regenerate) {
      const { data: existing } = await supabase
        .from("scene_audio_clips")
        .select("id, url, duration")
        .eq("scene_id", scene_id)
        .eq("kind", "voiceover")
        .order("duration", { ascending: false })
        .limit(1);
      if (existing && existing.length === 1 && existing[0].url) {
        // Validate it was produced by us — by URL prefix.
        if (String(existing[0].url).includes("/twoshot-vo/")) {
          return json({
            success: true,
            already: true,
            url: existing[0].url,
            duration: existing[0].duration,
            speakers: blocks.length,
          });
        }
      }
    }

    // Per-speaker TTS in script order.
    const pcmBuffers: Uint8Array[] = [];
    const segments: Array<{ speaker: string; startSec: number; endSec: number }> = [];
    let cursor = 0;
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const voiceId = resolveVoiceId(block, dialogVoices, charByFirstName);
      if (!voiceId) {
        return json({
          error: "missing_voice",
          speaker: block.rawSpeaker,
          message: `Sprecher "${block.rawSpeaker}" hat keine Stimme zugeordnet.`,
        }, 400);
      }
      const pcm = await elevenlabsPcm(elevenKey, voiceId, block.text);
      const samples = pcm.length / (BITS_PER_SAMPLE / 8) / CHANNELS;
      const dur = samples / SAMPLE_RATE;
      segments.push({
        speaker: block.rawSpeaker,
        startSec: Math.round(cursor * 100) / 100,
        endSec: Math.round((cursor + dur) * 100) / 100,
      });
      cursor += dur + (i < blocks.length - 1 ? INTER_SPEAKER_GAP_SEC : 0);
      pcmBuffers.push(pcm);
    }

    const mergedPcm = concatPcmWithGaps(pcmBuffers, INTER_SPEAKER_GAP_SEC);
    const wav = pcmToWav(mergedPcm);
    const totalSec = mergedPcm.length / (BITS_PER_SAMPLE / 8) / CHANNELS / SAMPLE_RATE;

    // Upload to user-scoped path in voiceover-audio bucket.
    const fileName = `${user.id}/twoshot-vo/${scene_id}-${Date.now()}.wav`;
    const { error: upErr } = await supabase.storage
      .from("voiceover-audio")
      .upload(fileName, wav, { contentType: "audio/wav", upsert: false });
    if (upErr) return json({ error: `upload failed: ${upErr.message}` }, 500);
    const { data: pub } = supabase.storage.from("voiceover-audio").getPublicUrl(fileName);
    const publicUrl = pub.publicUrl;

    // Wipe any prior voiceover rows for this scene so compose-lipsync-scene
    // sees exactly ONE merged track and doesn't trip its multi-speaker guard.
    await supabase.from("scene_audio_clips").delete().eq("scene_id", scene_id).eq("kind", "voiceover");

    const insertRes = await supabase.from("scene_audio_clips").insert({
      scene_id,
      kind: "voiceover",
      url: publicUrl,
      duration: Math.round(totalSec * 100) / 100,
      start_offset: 0,
      metadata: {
        source: "compose-twoshot-audio",
        speakers: segments,
        sample_rate: SAMPLE_RATE,
        gap_sec: INTER_SPEAKER_GAP_SEC,
      },
    });
    if (insertRes.error) {
      console.warn("[compose-twoshot-audio] scene_audio_clips insert failed:", insertRes.error);
      // Non-fatal — caller may still use the URL via audio_plan.
    }

    // Mirror onto the scene so cinematic-sync auto-extend can pick it up.
    await supabase
      .from("composer_scenes")
      .update({
        character_audio_url: publicUrl,
        audio_plan: {
          ...(scene as any).audio_plan,
          twoshot: { speakers: segments, totalSec: Math.round(totalSec * 100) / 100, url: publicUrl, generatedAt: new Date().toISOString() },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", scene_id);

    return json({
      success: true,
      url: publicUrl,
      duration: Math.round(totalSec * 100) / 100,
      speakers: segments,
    });
  } catch (e) {
    console.error("[compose-twoshot-audio] error", e);
    return json({ error: e instanceof Error ? e.message : "unknown error" }, 500);
  }
});
