/**
 * compose-twoshot-audio — Two-Shot Hook audio prep for the AI Video Composer.
 *
 * Takes a scene with a multi-speaker dialog_script (e.g. "Matthew: Hi\nSarah: Hello")
 * and the per-speaker `dialog_voices` config, and produces ONE merged WAV
 * voiceover that contains every speaker in script order — plus one
 * per-character padded WAV track for sequential lipsync passes.
 *
 * Sample-accurate pipeline (Artlist parity): we synthesize each utterance
 * straight to Int16 PCM @ 44.1 kHz mono (ElevenLabs `pcm_44100` / Hume
 * `wav` + resample), concatenate samples directly, and write a single WAV
 * file at the end. No MP3 byte-stitching, no ID3 inflation, no 26 ms
 * silence-frame quantization — drift between merged playback audio and
 * per-speaker lipsync passes is zero by construction.
 *
 * Idempotent: if a current-pipeline WAV voiceover for this scene already
 * exists, returns its URL without re-spending TTS credits unless
 * `force_regenerate=true`.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

// ── PCM/WAV pipeline @ 44.1 kHz / 16-bit / mono ─────────────────────────
// Artlist-grade audio prep: we operate on raw Int16 samples end-to-end so
// every position is sample-accurate (≈22 µs). MP3 byte-stitching was the
// drift source — ID3 tags inflate CBR duration math by 30–80 ms per
// utterance, and silence frames quantize to 26 ms. Working in PCM removes
// both classes of error. We upload a single WAV at the end; Sync.so/ffmpeg
// decodes WAV cleanly.
const SAMPLE_RATE = 44100;
const CHANNELS = 1;
const BYTES_PER_SAMPLE = 2;
const FALLBACK_ELEVEN_VOICE = "EXAVITQu4vr4xnSDxMaL"; // Sarah — neutral female fallback

function silenceSamples(durationSec: number): Int16Array {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return new Int16Array(0);
  return new Int16Array(Math.max(0, Math.round(durationSec * SAMPLE_RATE)));
}

function concatSamples(parts: Int16Array[]): Int16Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Int16Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function samplesToWav(samples: Int16Array): Uint8Array {
  const dataBytes = samples.byteLength;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  v.setUint32(0, 0x52494646, false); // "RIFF"
  v.setUint32(4, 36 + dataBytes, true);
  v.setUint32(8, 0x57415645, false); // "WAVE"
  v.setUint32(12, 0x666d7420, false); // "fmt "
  v.setUint32(16, 16, true); // PCM fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, CHANNELS, true);
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE, true);
  v.setUint16(32, CHANNELS * BYTES_PER_SAMPLE, true);
  v.setUint16(34, 16, true);
  v.setUint32(36, 0x64617461, false); // "data"
  v.setUint32(40, dataBytes, true);
  new Uint8Array(buf, 44).set(
    new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength),
  );
  return new Uint8Array(buf);
}

function pcmBytesToSamples(bytes: Uint8Array): Int16Array {
  // ElevenLabs PCM is headerless Int16LE. Copy to a fresh aligned buffer
  // because Int16Array requires byteOffset to be a multiple of 2 and the
  // incoming Uint8Array may not satisfy that.
  const evenLen = bytes.byteLength - (bytes.byteLength % 2);
  const copy = new Uint8Array(evenLen);
  copy.set(bytes.subarray(0, evenLen));
  return new Int16Array(copy.buffer);
}

function resampleLinear(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return input;
  const ratio = toRate / fromRate;
  const outLen = Math.round(input.length * ratio);
  const out = new Int16Array(outLen);
  const last = input.length - 1;
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, last);
    const frac = srcPos - i0;
    const v = input[i0] * (1 - frac) + input[i1] * frac;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v)));
  }
  return out;
}

function decodeWavToSamples(wav: Uint8Array): Int16Array {
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  if (dv.getUint32(0, false) !== 0x52494646 || dv.getUint32(8, false) !== 0x57415645) {
    throw new Error("Not a RIFF/WAVE file");
  }
  let off = 12;
  let audioFormat = 1, channels = 1, sampleRate = SAMPLE_RATE, bitsPerSample = 16;
  let dataOff = -1, dataLen = 0;
  while (off + 8 <= wav.byteLength) {
    const id = dv.getUint32(off, false);
    const size = dv.getUint32(off + 4, true);
    if (id === 0x666d7420) {
      audioFormat = dv.getUint16(off + 8, true);
      channels = dv.getUint16(off + 10, true);
      sampleRate = dv.getUint32(off + 12, true);
      bitsPerSample = dv.getUint16(off + 22, true);
    } else if (id === 0x64617461) {
      dataOff = off + 8;
      dataLen = size;
      break;
    }
    off += 8 + size + (size & 1);
  }
  if (dataOff < 0) throw new Error("WAV missing data chunk");
  if (audioFormat !== 1 || bitsPerSample !== 16) {
    throw new Error(`Unsupported WAV: format=${audioFormat} bits=${bitsPerSample}`);
  }
  const raw = wav.subarray(dataOff, dataOff + dataLen);
  const aligned = new Uint8Array(raw.byteLength - (raw.byteLength % 2));
  aligned.set(raw.subarray(0, aligned.byteLength));
  let samples = new Int16Array(aligned.buffer);
  if (channels > 1) {
    const monoLen = Math.floor(samples.length / channels);
    const mono = new Int16Array(monoLen);
    for (let i = 0; i < monoLen; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) sum += samples[i * channels + c];
      mono[i] = Math.max(-32768, Math.min(32767, Math.round(sum / channels)));
    }
    samples = mono;
  }
  if (sampleRate !== SAMPLE_RATE) samples = resampleLinear(samples, sampleRate, SAMPLE_RATE);
  return samples;
}

function samplesDurationSec(n: number): number {
  return n / SAMPLE_RATE;
}

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

/** Split "Matthew Dusatko: hi\nSarah: hello" into ordered blocks. */
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
      // Keep FULL normalized name (lowercase, hyphenated) so we can match
      // dialog_voices keys like "matthew-dusatko" — first-name match falls
      // out as a fallback inside resolveVoice.
      speakerName: rawSpeaker.toLowerCase().replace(/\s+/g, "-"),
      rawSpeaker,
      text,
    });
  }
  return blocks;
}

interface ResolvedVoice {
  voiceId: string;
  engine: "elevenlabs" | "hume";
  provider?: "HUME_AI" | "CUSTOM_VOICE";
}

/** Heuristic: ElevenLabs voice IDs are 20-character alphanumeric strings. */
function looksLikeElevenLabsId(v: string): boolean {
  return /^[A-Za-z0-9]{20}$/.test(v);
}

/** Look up voice config from dialog_voices keyed by speaker id, character id slug, or first-name match. */
function resolveVoice(
  block: DialogBlock,
  dialogVoices: Record<string, any>,
  charactersByName: Map<string, { id: string; default_voice_id?: string }>,
): ResolvedVoice | null {
  const cfgToVoice = (cfg: any): ResolvedVoice | null => {
    if (!cfg) return null;
    const id = cfg.isCustom ? (cfg.elevenlabsVoiceId ?? cfg.voiceId) : (cfg.voiceId ?? cfg.elevenlabsVoiceId);
    if (!id) return null;
    const engine: "elevenlabs" | "hume" =
      cfg.engine === "hume" || cfg.provider === "HUME_AI" || cfg.provider === "CUSTOM_VOICE"
        ? "hume"
        : (cfg.engine === "elevenlabs" ? "elevenlabs" : (looksLikeElevenLabsId(String(id)) ? "elevenlabs" : "hume"));
    return {
      voiceId: String(id),
      engine,
      provider: engine === "hume" ? (cfg.provider === "CUSTOM_VOICE" ? "CUSTOM_VOICE" : "HUME_AI") : undefined,
    };
  };

  const fullSlug = block.speakerName; // "matthew-dusatko"
  const firstName = fullSlug.split("-")[0]; // "matthew"

  // 1) Exact key match against dialog_voices for full slug, then first name.
  const dvKeys = Object.keys(dialogVoices);
  for (const candidate of [fullSlug, firstName]) {
    const hit = dvKeys.find((k) => k.toLowerCase() === candidate);
    if (hit) {
      const v = cfgToVoice(dialogVoices[hit]);
      if (v) return v;
    }
  }
  // 2) Match via cast character (full slug or first name) → its id → dialog_voices entry
  for (const candidate of [fullSlug, firstName]) {
    const c = charactersByName.get(candidate);
    if (!c) continue;
    const cfg = (dialogVoices as any)[c.id];
    const v = cfgToVoice(cfg);
    if (v) return v;
    if (c.default_voice_id) {
      return {
        voiceId: c.default_voice_id,
        engine: looksLikeElevenLabsId(c.default_voice_id) ? "elevenlabs" : "hume",
        provider: looksLikeElevenLabsId(c.default_voice_id) ? undefined : "HUME_AI",
      };
    }
  }
  // 3) Take ANY voice from dialog_voices as last resort
  for (const cfg of Object.values(dialogVoices)) {
    const v = cfgToVoice(cfg);
    if (v) return v;
  }
  return null;
}

async function elevenlabsPcm(
  apiKey: string,
  voiceId: string,
  text: string,
): Promise<Int16Array> {
  // Raw headerless Int16LE mono. We request pcm_24000 (available on Starter
  // tier and above — pcm_44100 is Pro-only and 403's on most accounts) and
  // resample linearly to SAMPLE_RATE so the sample-accurate timeline stays
  // intact. Resampling error << 1 sample after the merged-track is hard
  // trimmed to round(sceneDur * 44.1 kHz) downstream.
  const SOURCE_RATE = 24000;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_${SOURCE_RATE}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/basic",
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
  const raw = pcmBytesToSamples(new Uint8Array(await res.arrayBuffer()));
  return SOURCE_RATE === SAMPLE_RATE ? raw : resampleLinear(raw, SOURCE_RATE, SAMPLE_RATE);
}

async function humePcm(
  apiKey: string,
  voiceName: string,
  provider: "HUME_AI" | "CUSTOM_VOICE",
  text: string,
): Promise<Int16Array> {
  // Hume returns WAV with a header; we decode + resample to 44.1 kHz mono.
  const res = await fetch("https://api.hume.ai/v0/tts/file", {
    method: "POST",
    headers: {
      "X-Hume-Api-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/wav",
    },
    body: JSON.stringify({
      utterances: [
        { text, voice: { name: voiceName, provider } },
      ],
      format: { type: "wav" },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Hume "${voiceName}" failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  return decodeWavToSamples(new Uint8Array(await res.arrayBuffer()));
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const elevenKey = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
  const humeKey = Deno.env.get("HUME_API_KEY") ?? "";
  if (!elevenKey && !humeKey) return json({ error: "No TTS provider configured (ELEVENLABS_API_KEY or HUME_API_KEY)" }, 500);
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const token = auth.replace("Bearer ", "").trim();

    // Internal service-role calls (e.g. from compose-video-clips two-shot prep)
    // bypass user auth — ownership is implicit because the caller already
    // verified the project. End-user calls go through the normal getUser path.
    const isServiceCall = token === serviceKey;
    let userId: string | null = null;
    if (!isServiceCall) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) return json({ error: "Unauthorized" }, 401);
      userId = user.id;
    }

    const body = await req.json().catch(() => ({}));
    const { scene_id, force_regenerate } = body || {};
    if (!scene_id) return json({ error: "scene_id required" }, 400);

    // Load scene + ownership
    const { data: scene, error: sErr } = await supabase
      .from("composer_scenes")
      .select("id, project_id, dialog_script, dialog_voices, character_shots, character_audio_url, audio_plan, duration_seconds")
      .eq("id", scene_id)
      .single();
    if (sErr || !scene) return json({ error: "scene not found" }, 404);

    const { data: project } = await supabase
      .from("composer_projects")
      .select("id, user_id")
      .eq("id", scene.project_id)
      .single();
    if (!project) return json({ error: "project not found" }, 404);
    if (!isServiceCall && project.user_id !== userId) {
      return json({ error: "Forbidden" }, 403);
    }
    // For service calls, the storage path needs a user id — derive it from the
    // project owner so the file lands in the correct user-scoped folder.
    if (isServiceCall) userId = project.user_id;

    const dialogScript: string = (scene as any).dialog_script ?? "";
    const blocks = parseDialogScript(dialogScript);
    if (blocks.length < 2) {
      return json({ error: "single_speaker_or_empty", blocks: blocks.length }, 400);
    }

    // Build name → character lookup so we can resolve voices.
    // We index by first name AND full slugified name (e.g. "matthew-dusatko")
    // because dialog_voices is keyed by character SLUG/ID, not first name.
    const charShots = Array.isArray((scene as any).character_shots) ? (scene as any).character_shots : [];
    const charIds = charShots.map((s: any) => s?.characterId).filter(Boolean);
    // brand_characters.id is a UUID — slug-style ids (matthew-dusatko) are NOT
    // present there. Filter to UUID-shaped ids before querying.
    const uuidCharIds = (charIds as string[]).filter((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
    );
    const { data: characters } = uuidCharIds.length
      ? await supabase
          .from("brand_characters")
          .select("id, name, default_voice_id")
          .in("id", uuidCharIds)
      : { data: [] as any[] };
    const slugify = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "-");
    const charByName = new Map<string, { id: string; default_voice_id?: string }>();
    for (const c of characters ?? []) {
      const full = String(c.name || "").trim().toLowerCase();
      const fn = full.split(/\s+/)[0];
      const slug = slugify(full);
      const entry = { id: c.id, default_voice_id: c.default_voice_id ?? undefined };
      if (fn) charByName.set(fn, entry);
      if (slug) charByName.set(slug, entry);
      if (full) charByName.set(full, entry);
    }
    // Also pre-index character_shots so we can map a speaker name → its
    // characterId (matthew-dusatko) directly, without needing brand_characters.
    for (const cs of charShots) {
      if (!cs?.characterId) continue;
      const idLower = String(cs.characterId).toLowerCase();
      const fnFromId = idLower.split("-")[0];
      const entry = { id: idLower, default_voice_id: undefined };
      if (!charByName.has(idLower)) charByName.set(idLower, entry);
      if (fnFromId && !charByName.has(fnFromId)) charByName.set(fnFromId, entry);
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
        .select("id, url, duration, metadata")
        .eq("scene_id", scene_id)
        .eq("kind", "voiceover")
        .order("duration", { ascending: false })
        .limit(1);
      if (existing && existing.length === 1 && existing[0].url) {
        const url = String(existing[0].url);
        // Validate it was produced by the current PCM/WAV pipeline. Legacy
        // MP3 outputs at this same path prefix are stale (they used the
        // byte-based CBR math that caused lip-sync drift) — fall through to
        // regenerate as WAV.
        const isCurrentPipeline = url.includes("/twoshot-vo/") && url.endsWith(".wav");
        if (isCurrentPipeline) {
          return json({
            success: true,
            already: true,
            url,
            duration: existing[0].duration,
            speakers: Array.isArray((existing[0] as any)?.metadata?.speakers)
              ? (existing[0] as any).metadata.speakers
              : blocks.length,
          });
        }
      }
    }

    // Per-speaker TTS in script order. We append " ... " to each non-final
    // block so the TTS engine produces a natural pause between speakers — no
    // synthetic silence injection between utterances.
    const sampleBuffers: Int16Array[] = [];
    const segments: Array<{
      speaker: string;
      speaker_slug: string;
      character_id: string | null;
      engine: string;
      voice: string;
      startSec: number;
      endSec: number;
      _startSample: number; // internal — stripped from public output
      _endSample: number;
      track_url?: string;
    }> = [];
    let cursorSamples = 0;
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const voice = resolveVoice(block, dialogVoices, charByName);
      if (!voice) {
        return json({
          error: "missing_voice",
          speaker: block.rawSpeaker,
          message: `Sprecher "${block.rawSpeaker}" hat keine Stimme zugeordnet.`,
        }, 400);
      }
      const isLast = i === blocks.length - 1;
      const utterance = isLast ? block.text : `${block.text} ...`;
      let pcm: Int16Array;
      try {
        if (voice.engine === "hume") {
          if (!humeKey) throw new Error("HUME_API_KEY not configured");
          pcm = await humePcm(humeKey, voice.voiceId, voice.provider ?? "HUME_AI", utterance);
        } else {
          if (!elevenKey) throw new Error("ELEVENLABS_API_KEY not configured");
          pcm = await elevenlabsPcm(elevenKey, voice.voiceId, utterance);
        }
        console.log(`[compose-twoshot-audio] ${voice.engine} voice ok`, {
          speaker: block.rawSpeaker,
          voice: voice.voiceId,
          samples: pcm.length,
          seconds: Math.round(samplesDurationSec(pcm.length) * 1000) / 1000,
        });
      } catch (primaryErr) {
        const errMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        console.warn(`[compose-twoshot-audio] ${voice.engine} failed, falling back to ElevenLabs:`, errMsg);
        if (!elevenKey) {
          return json({
            error: "tts_failed",
            speaker: block.rawSpeaker,
            voice: voice.voiceId,
            engine: voice.engine,
            message: `Stimme "${voice.voiceId}" (${voice.engine}) konnte nicht erzeugt werden: ${errMsg}`,
          }, 400);
        }
        try {
          pcm = await elevenlabsPcm(elevenKey, FALLBACK_ELEVEN_VOICE, utterance);
        } catch (fbErr) {
          return json({
            error: "tts_failed",
            speaker: block.rawSpeaker,
            voice: voice.voiceId,
            engine: voice.engine,
            message: `Stimme "${voice.voiceId}" (${voice.engine}) konnte nicht erzeugt werden: ${errMsg}`,
            fallback_error: fbErr instanceof Error ? fbErr.message : String(fbErr),
          }, 400);
        }
      }
      const startSample = cursorSamples;
      const endSample = cursorSamples + pcm.length;
      const slug = block.speakerName;
      const charEntry = charByName.get(slug) ?? charByName.get(slug.split("-")[0]);
      segments.push({
        speaker: block.rawSpeaker,
        speaker_slug: slug,
        character_id: charEntry?.id ?? null,
        engine: voice.engine,
        voice: voice.voiceId,
        // Public timestamps in seconds (3-decimal precision = ~1 ms).
        startSec: Math.round((startSample / SAMPLE_RATE) * 1000) / 1000,
        endSec: Math.round((endSample / SAMPLE_RATE) * 1000) / 1000,
        // Internal sample-exact positions used for per-speaker track placement.
        _startSample: startSample,
        _endSample: endSample,
      });
      cursorSamples = endSample;
      sampleBuffers.push(pcm);
    }

    const spokenSamples = concatSamples(sampleBuffers);
    const spokenSec = samplesDurationSec(spokenSamples.length);

    // Pad merged track to scene.duration_seconds with trailing silence so the
    // downstream lipsync output matches the full scene length (avoids the
    // "video stops at 4s instead of 10s" bug). If scene duration is shorter
    // than the spoken audio, we keep the spoken length.
    //
    // Resolution order for the canonical scene length (in priority order):
    //   1. scene.duration_seconds          (set after Hailuo webhook)
    //   2. scene.audio_plan.duration       (planner-locked)
    //   3. scene.audio_plan.targetDuration (legacy)
    //   4. 10s fallback                    (Hailuo two-shot default)
    const planTotal =
      Number((scene as any)?.audio_plan?.duration) ||
      Number((scene as any)?.audio_plan?.targetDuration) ||
      0;
    let sceneDur = Math.max(0, Number((scene as any).duration_seconds) || 0);
    if (sceneDur <= 0) sceneDur = Math.max(0, planTotal);
    if (sceneDur <= 0) {
      sceneDur = 10;
      console.warn(
        `[compose-twoshot-audio] scene ${scene_id} has no duration_seconds — falling back to 10s (Hailuo two-shot default).`,
      );
    }
    const sceneSamples = Math.round(sceneDur * SAMPLE_RATE);
    const totalSamples = Math.max(spokenSamples.length, sceneSamples);
    const totalSec = totalSamples / SAMPLE_RATE;
    const tailSamples = Math.max(0, totalSamples - spokenSamples.length);
    let mergedSamples = tailSamples > 0
      ? concatSamples([spokenSamples, new Int16Array(tailSamples)])
      : spokenSamples;
    // Hard-trim to exactly totalSamples — never longer than the scene needs.
    if (mergedSamples.length > totalSamples) {
      mergedSamples = mergedSamples.subarray(0, totalSamples);
    }
    const mergedWav = samplesToWav(mergedSamples);

    // Upload merged track to user-scoped path in voiceover-audio bucket.
    const stamp = Date.now();
    const fileName = `${userId}/twoshot-vo/${scene_id}-${stamp}.wav`;
    const { error: upErr } = await supabase.storage
      .from("voiceover-audio")
      .upload(fileName, mergedWav, { contentType: "audio/wav", upsert: false });
    if (upErr) return json({ error: `upload failed: ${upErr.message}` }, 500);
    const { data: pub } = supabase.storage.from("voiceover-audio").getPublicUrl(fileName);
    const publicUrl = pub.publicUrl;

    // ── Build & upload per-character padded tracks ──────────────────────
    // ONE Sync.so pass per character. Each per-speaker track is the SAME
    // length as the merged track and places each utterance at its exact
    // sample offset — zeros elsewhere. Because positions are sample-accurate
    // and derived from the same timeline as the merged track, the lipsync
    // output aligns with the merged audio with zero drift.
    const groups = new Map<string, {
      speaker: string;
      speaker_slug: string;
      character_id: string | null;
      engine: string;
      voice: string;
      startSec: number;
      endSec: number;
      turns: Array<{ startSec: number; endSec: number; text_index: number }>;
      items: Array<{ segment: typeof segments[number]; samples: Int16Array; index: number }>;
      track_url?: string;
    }>();
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const key = String(seg.character_id || seg.speaker_slug || seg.speaker).toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.startSec = Math.min(existing.startSec, seg.startSec);
        existing.endSec = Math.max(existing.endSec, seg.endSec);
        existing.turns.push({ startSec: seg.startSec, endSec: seg.endSec, text_index: i });
        existing.items.push({ segment: seg, samples: sampleBuffers[i], index: i });
      } else {
        groups.set(key, {
          speaker: seg.speaker,
          speaker_slug: seg.speaker_slug,
          character_id: seg.character_id,
          engine: seg.engine,
          voice: seg.voice,
          startSec: seg.startSec,
          endSec: seg.endSec,
          turns: [{ startSec: seg.startSec, endSec: seg.endSec, text_index: i }],
          items: [{ segment: seg, samples: sampleBuffers[i], index: i }],
        });
      }
    }
    const speakerTracks = Array.from(groups.values()).sort((a, b) => a.startSec - b.startSec);

    for (let i = 0; i < speakerTracks.length; i++) {
      try {
        const group = speakerTracks[i];
        // Pre-allocate zeros = silence everywhere.
        const track = new Int16Array(totalSamples);
        for (const item of group.items) {
          const startSample = item.segment._startSample;
          const maxCopy = Math.max(0, Math.min(item.samples.length, totalSamples - startSample));
          if (maxCopy > 0) {
            track.set(item.samples.subarray(0, maxCopy), startSample);
          }
        }
        const trackWav = samplesToWav(track);
        const trackPath = `${userId}/twoshot-vo/${scene_id}-${stamp}-char${i}-${group.speaker_slug}.wav`;
        const { error: tErr } = await supabase.storage
          .from("voiceover-audio")
          .upload(trackPath, trackWav, { contentType: "audio/wav", upsert: false });
        if (tErr) {
          console.warn("[compose-twoshot-audio] per-speaker upload failed:", tErr.message);
          continue;
        }
        const { data: tp } = supabase.storage.from("voiceover-audio").getPublicUrl(trackPath);
        group.track_url = tp.publicUrl;
      } catch (e) {
        console.warn("[compose-twoshot-audio] per-character build error", (e as Error).message);
      }
    }
    // Strip internal `items` AND internal `_startSample`/`_endSample` fields
    // from the public metadata so downstream consumers see only the public
    // shape.
    const publicSpeakerTracks = speakerTracks.map(({ items: _items, ...track }) => track);
    const publicSegments = segments.map(({ _startSample: _s, _endSample: _e, ...seg }) => seg);

    // Wipe any prior voiceover rows for this scene so compose-lipsync-scene
    // sees exactly ONE merged track and doesn't trip its multi-speaker guard.
    await supabase.from("scene_audio_clips").delete().eq("scene_id", scene_id).eq("kind", "voiceover");

    const insertRes = await supabase.from("scene_audio_clips").insert({
      user_id: userId,
      project_id: scene.project_id,
      scene_id,
      kind: "voiceover",
      source: "ai",
      url: publicUrl,
      duration: Math.round(totalSec * 1000) / 1000,
      start_offset: 0,
      volume: 1,
      ducking_enabled: false,
      cost_credits: 0,
      refunded: false,
      metadata: {
        source: "compose-twoshot-audio",
        kind: "twoshot_merged",
        format: "wav",
        sample_rate: SAMPLE_RATE,
        channels: CHANNELS,
        bits_per_sample: 16,
        spoken_seconds: Math.round(spokenSec * 1000) / 1000,
        scene_duration_seconds: sceneDur,
        total_samples: totalSamples,
        segments: publicSegments,
        speakers: publicSpeakerTracks,
      },
    });
    if (insertRes.error) {
      console.warn("[compose-twoshot-audio] scene_audio_clips insert failed:", insertRes.error);
      // Non-fatal — caller may still use the URL via audio_plan.
    }

    // Mirror onto the scene so cinematic-sync auto-extend can pick it up.
    // `audio_plan.twoshot.useExternalAudio = true` signals the preview/render
    // that the FINAL spoken audio lives in this merged URL — NOT inside the
    // lipsync video (which only contains the last pass's voice). The preview
    // must mute the embedded video audio and play `mergedUrl` instead.
    await supabase
      .from("composer_scenes")
      .update({
        character_audio_url: publicUrl,
        audio_plan: {
          ...(scene as any).audio_plan,
          twoshot: {
            segments: publicSegments,
            speakers: publicSpeakerTracks,
            spokenSec: Math.round(spokenSec * 1000) / 1000,
            totalSec: Math.round(totalSec * 1000) / 1000,
            url: publicUrl,
            useExternalAudio: true,
            embeddedAudio: false,
            generatedAt: new Date().toISOString(),
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", scene_id);

    return json({
      success: true,
      url: publicUrl,
      duration: Math.round(totalSec * 1000) / 1000,
      speakers: publicSpeakerTracks,
      segments: publicSegments,
    });
  } catch (e) {
    console.error("[compose-twoshot-audio] error", e);
    return json({ error: e instanceof Error ? e.message : "unknown error" }, 500);
  }
});
