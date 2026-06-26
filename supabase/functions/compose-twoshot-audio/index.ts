/**
 * compose-twoshot-audio — Two-Shot Hook audio prep for the AI Video Composer.
 *
 * Takes a scene with a multi-speaker dialog_script (e.g. "Matthew: Hi\nSarah: Hello")
 * and the per-speaker `dialog_voices` config, and produces ONE merged WAV
 * voiceover that contains every speaker in script order — plus one
 * per-character padded WAV track for sequential lipsync passes.
 *
 * Sample-accurate pipeline (Artlist parity): we synthesize each utterance
 * straight to Int16 PCM @ 44.1 kHz mono (ElevenLabs `pcm_24000` + linear
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

/**
 * Peak-normalize Int16 PCM in-place to a target peak (default −1 dBFS ≈ 29205).
 * Only applied to per-speaker tracks whose voiced region is very short — the
 * Sync.so VAD needs enough signal to detect speech and animate the mouth. We
 * intentionally do NOT touch the merged track so the final playback level is
 * consistent across speakers.
 */
function peakNormalizeInPlace(samples: Int16Array, targetPeak = 29205): void {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
  }
  if (peak <= 0 || peak >= targetPeak) return;
  const gain = targetPeak / peak;
  // Skip near-no-op gains.
  if (gain < 1.05) return;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.round(samples[i] * gain);
    samples[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
  }
}

function peakDbFs(samples: Int16Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    const a = Math.abs(v) / 32768;
    if (a > peak) peak = a;
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
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

/**
 * Trim trailing silence (energy VAD) from Int16 PCM. Threshold ~ -38 dBFS,
 * min trailing silence 120 ms. Used as fallback when timestamp-trim fails.
 */
function trimTrailingSilence(samples: Int16Array, sampleRate = SAMPLE_RATE): Int16Array {
  if (samples.length === 0) return samples;
  const minSilenceSamples = Math.round(0.12 * sampleRate);
  const threshold = 32768 * Math.pow(10, -38 / 20); // ≈ 414
  let lastVoicedIdx = -1;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (Math.abs(samples[i]) > threshold) { lastVoicedIdx = i; break; }
  }
  if (lastVoicedIdx < 0) return samples;
  // Keep ≈80 ms tail past last voiced sample for natural consonant decay.
  const keepUntil = Math.min(samples.length, lastVoicedIdx + Math.round(0.08 * sampleRate));
  // Only trim if we'd remove at least minSilenceSamples (otherwise leave alone).
  if (samples.length - keepUntil < minSilenceSamples) return samples;
  return samples.subarray(0, keepUntil);
}

interface ElevenPcmResult {
  pcm: Int16Array;
  rawDurSec: number;
  trimmedDurSec: number;
  hallucinatedTailMs: number;
  trimMode: "timestamps" | "energy-vad" | "none";
}

async function elevenlabsPcm(
  apiKey: string,
  voiceId: string,
  text: string,
): Promise<ElevenPcmResult> {
  // ── v89 — `with-timestamps` endpoint ─────────────────────────────────
  // Plan §2: use ElevenLabs `with-timestamps` so we can hard-cap the PCM
  // at `lastScriptCharEnd + 0.12 s`. This kills hallucinated trailing
  // words/breaths that overlap the next speaker's window. Returns JSON:
  //   { audio_base64, alignment: { character_end_times_seconds, ... } }
  // Falls back to raw PCM + energy-VAD tail-trim if timestamps fail.
  const SOURCE_RATE = 24000;
  const tsUrl =
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=pcm_${SOURCE_RATE}`;
  const body = JSON.stringify({
    text,
    model_id: "eleven_multilingual_v2",
    voice_settings: {
      stability: 0.45,
      similarity_boost: 0.75,
      style: 0.3,
      use_speaker_boost: true,
      speed: 1.0,
    },
  });

  try {
    const res = await fetch(tsUrl, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`with-timestamps ${res.status}: ${errText.slice(0, 200)}`);
    }
    const json = await res.json() as {
      audio_base64?: string;
      alignment?: {
        characters?: string[];
        character_start_times_seconds?: number[];
        character_end_times_seconds?: number[];
      };
    };
    if (!json.audio_base64) throw new Error("with-timestamps: missing audio_base64");

    // Decode base64 → bytes.
    const bin = atob(json.audio_base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const rawSrc = pcmBytesToSamples(bytes);
    const rawDurSec = rawSrc.length / SOURCE_RATE;

    // Compute trim target from last char end + 0.12s consonant tail.
    const ends = json.alignment?.character_end_times_seconds ?? [];
    let trimMode: ElevenPcmResult["trimMode"] = "none";
    let trimmedSrc = rawSrc;
    let trimmedDurSec = rawDurSec;
    let hallucinatedTailMs = 0;
    if (ends.length > 0) {
      const lastEnd = Number(ends[ends.length - 1]);
      if (Number.isFinite(lastEnd) && lastEnd > 0) {
        const cutSec = lastEnd + 0.12;
        const cutSamples = Math.min(rawSrc.length, Math.round(cutSec * SOURCE_RATE));
        if (cutSamples < rawSrc.length - Math.round(0.04 * SOURCE_RATE)) {
          trimmedSrc = rawSrc.subarray(0, cutSamples);
          trimmedDurSec = trimmedSrc.length / SOURCE_RATE;
          hallucinatedTailMs = Math.round((rawDurSec - trimmedDurSec) * 1000);
          trimMode = "timestamps";
          if (hallucinatedTailMs > 400) {
            console.log(
              `[compose-twoshot-audio] elevenlabs hallucinated tail trimmed: ${hallucinatedTailMs}ms (raw=${rawDurSec.toFixed(3)}s → ${trimmedDurSec.toFixed(3)}s) voice=${voiceId}`,
            );
          }
        }
      }
    }
    const pcm = SOURCE_RATE === SAMPLE_RATE
      ? trimmedSrc
      : resampleLinear(trimmedSrc, SOURCE_RATE, SAMPLE_RATE);
    return {
      pcm,
      rawDurSec: Math.round(rawDurSec * 1000) / 1000,
      trimmedDurSec: Math.round(trimmedDurSec * 1000) / 1000,
      hallucinatedTailMs,
      trimMode,
    };
  } catch (tsErr) {
    console.warn(
      `[compose-twoshot-audio] with-timestamps failed (${(tsErr as Error)?.message ?? tsErr}), falling back to raw PCM + energy-VAD trim`,
    );
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_${SOURCE_RATE}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/basic",
      },
      body,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`ElevenLabs ${voiceId} failed (${res.status}): ${errText.slice(0, 200)}`);
    }
    const rawSrc = pcmBytesToSamples(new Uint8Array(await res.arrayBuffer()));
    const rawDurSec = rawSrc.length / SOURCE_RATE;
    // Energy-VAD tail-trim on source rate.
    const trimmedSrc = trimTrailingSilence(rawSrc, SOURCE_RATE);
    const trimmedDurSec = trimmedSrc.length / SOURCE_RATE;
    const hallucinatedTailMs = Math.round((rawDurSec - trimmedDurSec) * 1000);
    const pcm = SOURCE_RATE === SAMPLE_RATE
      ? trimmedSrc
      : resampleLinear(trimmedSrc, SOURCE_RATE, SAMPLE_RATE);
    return {
      pcm,
      rawDurSec: Math.round(rawDurSec * 1000) / 1000,
      trimmedDurSec: Math.round(trimmedDurSec * 1000) / 1000,
      hallucinatedTailMs,
      trimMode: hallucinatedTailMs > 0 ? "energy-vad" : "none",
    };
  }
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
      .select("id, project_id, dialog_script, dialog_voices, character_shots, character_audio_url, audio_plan, duration_seconds, clip_source")
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
    if (blocks.length < 1) {
      return json({ error: "empty_dialog_script", blocks: 0 }, 400);
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
    // v86 — Track keys that resolve to MORE than one distinct character. If a
    // dialog block's name slug falls back onto one of these, we cannot safely
    // map it to a single character_id and must fail rather than silently merge
    // two speakers' turns onto the same Sync.so pass (= "Char 1 spricht 2×,
    // Char 4 hat Lippen zu" bug).
    const ambiguousNameKeys = new Set<string>();
    const registerCharKey = (key: string, entry: { id: string; default_voice_id?: string }) => {
      if (!key) return;
      const prev = charByName.get(key);
      if (prev && prev.id.toLowerCase() !== entry.id.toLowerCase()) {
        ambiguousNameKeys.add(key);
      } else if (!prev) {
        charByName.set(key, entry);
      }
    };
    for (const c of characters ?? []) {
      const full = String(c.name || "").trim().toLowerCase();
      const fn = full.split(/\s+/)[0];
      const slug = slugify(full);
      const entry = { id: c.id, default_voice_id: c.default_voice_id ?? undefined };
      registerCharKey(fn, entry);
      registerCharKey(slug, entry);
      registerCharKey(full, entry);
    }
    // Also pre-index character_shots so we can map a speaker name → its
    // characterId (matthew-dusatko) directly, without needing brand_characters.
    for (const cs of charShots) {
      if (!cs?.characterId) continue;
      const idLower = String(cs.characterId).toLowerCase();
      const fnFromId = idLower.split("-")[0];
      const entry = { id: idLower, default_voice_id: undefined };
      registerCharKey(idLower, entry);
      registerCharKey(fnFromId, entry);
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
    // Per-segment PCM kept SEPARATE from `sampleBuffers` (which also contains
    // inter-speaker pause silence). Earlier we used `sampleBuffers[i]` as the
    // PCM for segment `i`, but indices were misaligned because pauses are
    // pushed between utterances → speaker 2 received a 0.25s silence as its
    // "track audio" and speaker 3 received speaker 2's PCM. That bug caused
    // Sync.so to animate the wrong face on a silent track ("ghost speech").
    const segmentPcm: Int16Array[] = [];
    // v89 — Per-utterance TTS diagnostics (hallucinated-tail trim, char count,
    // raw vs trimmed duration). Surfaced in audio_plan.twoshot.tts_diagnostics
    // and in the UI as warning pills.
    const ttsDiagnostics: Array<{
      speaker: string;
      engine: string;
      voice: string;
      scriptChars: number;
      rawDurSec: number;
      trimmedDurSec: number;
      hallucinatedTailMs: number;
      trimMode: "timestamps" | "energy-vad" | "none";
    }> = [];
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
    // cursorSamples is declared below at the assembly loop (after parallel TTS)
    // Inter-speaker pause inserted as real silence — NEVER appended as text
    // to the TTS prompt. Earlier we appended " ..." to non-final utterances,
    // which ElevenLabs sometimes voiced as an audible mumble/breath at the
    // end of short replies ("Was denn? <mumble>"). Silence here is sample-
    // accurate and never bleeds into another speaker's lip-sync window.
    const INTER_SPEAKER_PAUSE_SEC = 0.25;
    // ── v94 — Parallel TTS with concurrency=2 ───────────────────────────
    // Previously the for-loop awaited each ElevenLabs/Hume call serially
    // (~0.8-2.5s each). For a 4-speaker / 8-turn scene this added 6-20s of
    // pure round-trip wait. Each TTS call is fully independent (no shared
    // state) — we just need to assemble the resulting PCM buffers in
    // original script order afterwards.
    // Concurrency cap = 2 to stay safely below ElevenLabs' burst limit
    // (~2-4 concurrent per API key) and avoid 429s. Order-preserving via
    // pre-allocated result slots.
    type TtsResult = {
      ok: true;
      pcm: Int16Array;
      ttsDiag: typeof ttsDiagnostics[number] | null;
      voice: ReturnType<typeof resolveVoice>;
    } | {
      ok: false;
      response: Response;
    };
    const results: (TtsResult | null)[] = new Array(blocks.length).fill(null);

    // Resolve all voices up-front (sync, fast); fail-fast on missing voice.
    const resolved: Array<{ voice: NonNullable<ReturnType<typeof resolveVoice>>; block: typeof blocks[number] } | null> = [];
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
      resolved.push({ voice, block });
    }

    async function synthOne(idx: number): Promise<void> {
      const { voice, block } = resolved[idx]!;
      const utterance = block.text;
      let pcm: Int16Array;
      let ttsDiag: typeof ttsDiagnostics[number] | null = null;
      try {
        if (voice.engine === "hume") {
          if (!humeKey) throw new Error("HUME_API_KEY not configured");
          pcm = await humePcm(humeKey, voice.voiceId, voice.provider ?? "HUME_AI", utterance);
        } else {
          if (!elevenKey) throw new Error("ELEVENLABS_API_KEY not configured");
          const res = await elevenlabsPcm(elevenKey, voice.voiceId, utterance);
          pcm = res.pcm;
          ttsDiag = {
            speaker: block.rawSpeaker,
            engine: "elevenlabs",
            voice: voice.voiceId,
            scriptChars: utterance.length,
            rawDurSec: res.rawDurSec,
            trimmedDurSec: res.trimmedDurSec,
            hallucinatedTailMs: res.hallucinatedTailMs,
            trimMode: res.trimMode,
          };
        }
        console.log(`[compose-twoshot-audio] ${voice.engine} voice ok`, {
          speaker: block.rawSpeaker,
          voice: voice.voiceId,
          samples: pcm.length,
          seconds: Math.round(samplesDurationSec(pcm.length) * 1000) / 1000,
          tts_diag: ttsDiag,
        });
        results[idx] = { ok: true, pcm, ttsDiag, voice };
      } catch (primaryErr) {
        const errMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        console.warn(`[compose-twoshot-audio] ${voice.engine} failed, falling back to ElevenLabs:`, errMsg);
        if (!elevenKey) {
          results[idx] = {
            ok: false,
            response: json({
              error: "tts_failed",
              speaker: block.rawSpeaker,
              voice: voice.voiceId,
              engine: voice.engine,
              message: `Stimme "${voice.voiceId}" (${voice.engine}) konnte nicht erzeugt werden: ${errMsg}`,
            }, 400),
          };
          return;
        }
        try {
          const res = await elevenlabsPcm(elevenKey, FALLBACK_ELEVEN_VOICE, utterance);
          pcm = res.pcm;
          ttsDiag = {
            speaker: block.rawSpeaker,
            engine: "elevenlabs-fallback",
            voice: FALLBACK_ELEVEN_VOICE,
            scriptChars: utterance.length,
            rawDurSec: res.rawDurSec,
            trimmedDurSec: res.trimmedDurSec,
            hallucinatedTailMs: res.hallucinatedTailMs,
            trimMode: res.trimMode,
          };
          results[idx] = { ok: true, pcm, ttsDiag, voice };
        } catch (fbErr) {
          results[idx] = {
            ok: false,
            response: json({
              error: "tts_failed",
              speaker: block.rawSpeaker,
              voice: voice.voiceId,
              engine: voice.engine,
              message: `Stimme "${voice.voiceId}" (${voice.engine}) konnte nicht erzeugt werden: ${errMsg}`,
              fallback_error: fbErr instanceof Error ? fbErr.message : String(fbErr),
            }, 400),
          };
        }
      }
    }

    // Concurrency=2 worker pool (ElevenLabs-safe). Indexes flow in script
    // order so earlier utterances start first — minimises tail latency.
    const CONCURRENCY = 2;
    let nextIdx = 0;
    async function worker(): Promise<void> {
      while (true) {
        const myIdx = nextIdx++;
        if (myIdx >= blocks.length) return;
        await synthOne(myIdx);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, blocks.length) }, () => worker()));

    // ── Assemble PCM in original script order (silence pauses between) ──
    let cursorSamples = 0;
    for (let i = 0; i < blocks.length; i++) {
      const res = results[i]!;
      if (!res.ok) {
        // Fail-fast — propagate the first TTS error response.
        return res.response;
      }
      const block = blocks[i];
      const { pcm, ttsDiag, voice } = res;
      // Insert pause as PCM silence BEFORE every non-first utterance.
      if (i > 0 && INTER_SPEAKER_PAUSE_SEC > 0) {
        const pause = silenceSamples(INTER_SPEAKER_PAUSE_SEC);
        if (pause.length > 0) {
          sampleBuffers.push(pause);
          cursorSamples += pause.length;
        }
      }
      if (ttsDiag) ttsDiagnostics.push(ttsDiag);

      const startSample = cursorSamples;
      const endSample = cursorSamples + pcm.length;
      const slug = block.speakerName;
      const firstName = slug.split("-")[0];
      // v86 — Detect ambiguous speaker name. If the user's cast contains 2+
      // characters whose first names / slugs collide with this block's name
      // AND the block doesn't carry a unique full-slug match, refuse rather
      // than silently merge two speakers' lines onto one Sync.so pass.
      const slugAmbiguous = ambiguousNameKeys.has(slug);
      const firstNameAmbiguous = ambiguousNameKeys.has(firstName);
      const fullSlugHit = charByName.get(slug);
      if (!fullSlugHit && (slugAmbiguous || firstNameAmbiguous)) {
        return json({
          error: "ambiguous_speaker_name",
          speaker: block.rawSpeaker,
          message: `Sprecher "${block.rawSpeaker}" ist mehrdeutig — mehrere Cast-Mitglieder teilen diesen Namen. Bitte verwende den vollen Namen (z. B. "Vorname Nachname:") oder weise dem Skript-Block eine eindeutige Character-ID zu.`,
        }, 400);
      }
      const charEntry = fullSlugHit ?? charByName.get(firstName);
      segments.push({
        speaker: block.rawSpeaker,
        speaker_slug: slug,
        character_id: charEntry?.id ?? null,
        engine: voice!.engine,
        voice: voice!.voiceId,
        // Public timestamps in seconds (3-decimal precision = ~1 ms).
        startSec: Math.round((startSample / SAMPLE_RATE) * 1000) / 1000,
        endSec: Math.round((endSample / SAMPLE_RATE) * 1000) / 1000,
        // Internal sample-exact positions used for per-speaker track placement.
        _startSample: startSample,
        _endSample: endSample,
      });
      cursorSamples = endSample;
      sampleBuffers.push(pcm);
      segmentPcm.push(pcm);
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
    const originalSceneDur = sceneDur;
    if (sceneDur <= 0) sceneDur = Math.max(0, planTotal);
    if (sceneDur <= 0) {
      sceneDur = 10;
      console.warn(
        `[compose-twoshot-audio] scene ${scene_id} has no duration_seconds — falling back to 10s (Hailuo two-shot default).`,
      );
    }

    // v89 — Plan §3: Sarah-cutoff fix.
    // If the actual spoken audio exceeds the scene plate by more than 0.30 s,
    // we EXTEND the scene duration instead of silently hard-trimming. The
    // hard-trim was lopping off the last 50–400 ms of the final speaker
    // ("…and that's wh-"). The extension is capped at +5.0 s to guard against
    // wildly oversized scripts; beyond that we fail-fast so the UI can ask
    // the user to shorten the text or extend the scene manually.
    const OVERFLOW_GRACE_SEC = 0.30;
    const MAX_EXTEND_SEC = 5.0;
    let dialogOverflowExtended: { from: number; to: number; overflowSec: number } | null = null;
    if (spokenSec > sceneDur + OVERFLOW_GRACE_SEC) {
      const overflow = spokenSec - sceneDur;
      if (overflow > MAX_EXTEND_SEC) {
        return json({
          error: "dialog_too_long_for_plate",
          message:
            `Das Skript dauert ${spokenSec.toFixed(2)} s, aber die Szene ist nur ${sceneDur.toFixed(2)} s lang. ` +
            `Bitte Text kürzen oder die Szene auf mindestens ${Math.ceil(spokenSec + 0.3)} s verlängern.`,
          spoken_sec: Math.round(spokenSec * 1000) / 1000,
          scene_dur_sec: sceneDur,
          overflow_sec: Math.round(overflow * 1000) / 1000,
        }, 400);
      }
      // Extend in 0.1s steps (matches plate-render granularity) + 0.3s tail.
      const newDur = Math.ceil((spokenSec + 0.30) * 10) / 10;
      dialogOverflowExtended = {
        from: Math.round(sceneDur * 1000) / 1000,
        to: newDur,
        overflowSec: Math.round(overflow * 1000) / 1000,
      };
      console.warn(
        `[compose-twoshot-audio] scene ${scene_id} dialog overflow — extending sceneDur ${sceneDur.toFixed(2)}s → ${newDur.toFixed(2)}s (spoken=${spokenSec.toFixed(2)}s, overflow=${overflow.toFixed(2)}s)`,
      );
      sceneDur = newDur;
    }

    const sceneSamples = Math.round(sceneDur * SAMPLE_RATE);
    // Never less than spoken length — guarantees Sarah's tail survives.
    const totalSamples = Math.max(spokenSamples.length, sceneSamples);
    const totalSec = totalSamples / SAMPLE_RATE;
    const tailSamples = Math.max(0, totalSamples - spokenSamples.length);
    let mergedSamples = tailSamples > 0
      ? concatSamples([spokenSamples, new Int16Array(tailSamples)])
      : spokenSamples;
    // Defensive: only trim if we somehow overran totalSamples (should be a
    // no-op because totalSamples = max(spoken, scene) already).
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
        existing.items.push({ segment: seg, samples: segmentPcm[i], index: i });
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
          items: [{ segment: seg, samples: segmentPcm[i], index: i }],
        });
      }
    }
    const speakerTracks = Array.from(groups.values()).sort((a, b) => a.startSec - b.startSec);

    // v86 — HARD-GUARD: distinct raw speakers in the dialog_script MUST equal
    // the number of grouped speaker tracks. If they don't, two different
    // speakers collapsed into one Sync.so pass — exactly the bug where Char 1
    // appears to speak twice while Char 4's mouth never moves. Refuse with a
    // clear error so the UI surfaces it instead of paying for a broken render.
    const distinctRawSpeakers = new Set(blocks.map((b) => b.rawSpeaker.trim().toLowerCase()));
    if (distinctRawSpeakers.size > speakerTracks.length) {
      const collidingPairs: string[] = [];
      const seen = new Map<string, string>(); // key → first rawSpeaker
      for (const seg of segments) {
        const key = String(seg.character_id || seg.speaker_slug || seg.speaker).toLowerCase();
        const prev = seen.get(key);
        if (prev && prev.toLowerCase() !== seg.speaker.toLowerCase()) {
          collidingPairs.push(`"${prev}" ↔ "${seg.speaker}"`);
        } else if (!prev) {
          seen.set(key, seg.speaker);
        }
      }
      return json({
        error: "speaker_dedup_collision",
        message:
          `${distinctRawSpeakers.size} unterschiedliche Sprecher im Skript, aber nur ${speakerTracks.length} eindeutige Audio-Spuren. ` +
          `Kollision: ${[...new Set(collidingPairs)].join(", ") || "(unbekannt)"}. ` +
          `Bitte vollen Namen verwenden oder jedem Skript-Block einen eindeutigen Charakter zuweisen.`,
        distinct_speakers: distinctRawSpeakers.size,
        speaker_tracks: speakerTracks.length,
        colliding_pairs: [...new Set(collidingPairs)],
      }, 400);
    }

    for (let i = 0; i < speakerTracks.length; i++) {
      try {
        const group = speakerTracks[i];
        // Pre-allocate zeros = silence everywhere.
        const track = new Int16Array(totalSamples);
        // Voiced region = union [earliest startSample, latest endSample] across
        // all this speaker's utterances. Stored on the public speaker metadata
        // so downstream lipsync passes can scope Sync.so to just this window
        // (avoids "mouth never moves on short replies like 'Was denn?'").
        let voicedStartSample = Number.POSITIVE_INFINITY;
        let voicedEndSample = 0;
        let voicedSampleCount = 0;
        for (const item of group.items) {
          const startSample = item.segment._startSample;
          const maxCopy = Math.max(0, Math.min(item.samples.length, totalSamples - startSample));
          if (maxCopy > 0) {
            track.set(item.samples.subarray(0, maxCopy), startSample);
            if (startSample < voicedStartSample) voicedStartSample = startSample;
            if (startSample + maxCopy > voicedEndSample) voicedEndSample = startSample + maxCopy;
            voicedSampleCount += maxCopy;
          }
        }
        const voicedSec = voicedSampleCount / SAMPLE_RATE;
        const voicedStartSec = Number.isFinite(voicedStartSample) ? voicedStartSample / SAMPLE_RATE : 0;
        const voicedEndSec = voicedEndSample / SAMPLE_RATE;

        // For very short utterances (e.g. "Was denn?", ~0.6s buried in 10s of
        // silence) ElevenLabs sometimes renders at a low peak level. Peak-
        // normalize the per-speaker track so Sync.so's VAD reliably picks up
        // the voiced region and animates the targeted face.
        if (voicedSec > 0 && voicedSec < 2.0) {
          peakNormalizeInPlace(track);
        }
        const trackPeakDbfs = peakDbFs(track);
        if (!Number.isFinite(trackPeakDbfs) || trackPeakDbfs <= -50) {
          console.warn(
            `[compose-twoshot-audio] scene ${scene_id} speaker=${group.speaker} silent_or_too_quiet_track peak_dbfs=${Number.isFinite(trackPeakDbfs) ? trackPeakDbfs.toFixed(2) : "-Infinity"} voicedSec=${voicedSec.toFixed(3)}`,
          );
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
        // Attach voicedRange — consumed by compose-twoshot-lipsync /
        // poll-twoshot-lipsync to set Sync.so input[].segments_secs.
        // `turns[]` holds one window per actual utterance. We pass these as
        // multiple disjoint segments to Sync.so so that for a speaker with
        // multiple turns (e.g. Samuel at 0–2.3s AND 3.9–6.4s) we never
        // include the OTHER speaker's window (Matthew 2.3–3.9s) inside the
        // first speaker's lip-sync pass. The union `startSec → endSec` is
        // kept for backward compat but should not be used as a single window.
        const turnWindows = group.items
          .map((it) => ({
            startSec: Math.round((it.segment._startSample / SAMPLE_RATE) * 1000) / 1000,
            endSec: Math.round((it.segment._endSample / SAMPLE_RATE) * 1000) / 1000,
          }))
          .filter((w) => w.endSec > w.startSec)
          .sort((a, b) => a.startSec - b.startSec);
        (group as any).voicedRange = {
          startSec: Math.round(voicedStartSec * 1000) / 1000,
          endSec: Math.round(voicedEndSec * 1000) / 1000,
          voicedSec: Math.round(voicedSec * 1000) / 1000,
          normalized: voicedSec > 0 && voicedSec < 2.0,
          peak_dbfs: Number.isFinite(trackPeakDbfs) ? Math.round(trackPeakDbfs * 1000) / 1000 : null,
          turns: turnWindows,
        };
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
    //
    // Stage 8 (May 31 2026): for SINGLE-speaker scenes the lipsync video
    // embeds the ONE speaker's voice in full — there is no "last pass only"
    // problem. Forcing useExternalAudio=true here would make the preview AND
    // the final mux play the merged WAV ON TOP of the lipsynced video's
    // embedded audio → the doubled / animorph voiceover the user reported.
    // Only set useExternalAudio when 2+ speakers actually need the external
    // merged track.
    const isMultiSpeaker = publicSpeakerTracks.length >= 2;
    const sceneUpdate: Record<string, unknown> = {
      character_audio_url: publicUrl,
      audio_plan: {
        ...(scene as any).audio_plan,
        twoshot: {
          segments: publicSegments,
          speakers: publicSpeakerTracks,
          spokenSec: Math.round(spokenSec * 1000) / 1000,
          totalSec: Math.round(totalSec * 1000) / 1000,
          url: publicUrl,
          useExternalAudio: isMultiSpeaker,
          embeddedAudio: !isMultiSpeaker,
          generatedAt: new Date().toISOString(),
          // v89 — per-utterance TTS diagnostics + overflow extension marker.
          tts_diagnostics: ttsDiagnostics,
          dialog_overflow_extended: dialogOverflowExtended,
        },
      },
      updated_at: new Date().toISOString(),
    };
    // If we extended the scene to fit the dialog, propagate the new duration
    // so downstream renderers (compose-dialog-segments / Remotion mux) align.
    if (dialogOverflowExtended && totalSec > originalSceneDur + 0.05) {
      sceneUpdate.duration_seconds = Math.round(totalSec * 1000) / 1000;
    }
    await supabase
      .from("composer_scenes")
      .update(sceneUpdate)
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
