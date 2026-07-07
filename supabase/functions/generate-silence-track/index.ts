/**
 * generate-silence-track (v194 Silent-Speaker-Pass)
 *
 * Returns a deterministic public URL to a silence WAV of the requested
 * duration. Used by `compose-dialog-segments` to feed silent audio into
 * Sync.so passes for non-speaking faces in a multi-speaker turn, so those
 * faces stay closed-mouth while their head/body keep moving naturally in
 * the master plate.
 *
 * The WAV is:
 *   - PCM 16-bit signed little-endian, mono, 24 000 Hz
 *   - Filled with deterministic low-amplitude brown-noise-ish samples so
 *     the Sync.so provider does not classify it as pure DC-silence (some
 *     ASR pre-processors reject exact zeros). Amplitude is well under
 *     −50 dBFS so v53 silent-audio-gate still recognises it as silent.
 *   - Deterministic: same duration → same bytes → same storage path.
 *
 * Idempotent: repeated calls for the same duration reuse the cached object
 * in the `composer-silence-tracks` public bucket.
 *
 * Auth: JWT verified (via config.toml default) — internal edge-function
 * callers pass the anon key.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SAMPLE_RATE = 24_000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BUCKET = "composer-silence-tracks";

/** Deterministic LCG for reproducible low-amplitude noise (seed=1). */
function nextRand(state: { s: number }): number {
  // Numerical Recipes LCG parameters
  state.s = (state.s * 1664525 + 1013904223) >>> 0;
  return (state.s / 0xffffffff - 0.5) * 2; // [-1, 1)
}

function buildSilenceWav(durationSec: number): Uint8Array {
  const clampedDur = Math.max(0.1, Math.min(60, durationSec));
  const samples = Math.round(clampedDur * SAMPLE_RATE);
  const dataBytes = samples * CHANNELS * (BITS_PER_SAMPLE / 8);
  const totalBytes = 44 + dataBytes;
  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  let offset = 0;

  const writeString = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i));
  };
  const writeUint32LE = (n: number) => {
    view.setUint32(offset, n, true);
    offset += 4;
  };
  const writeUint16LE = (n: number) => {
    view.setUint16(offset, n, true);
    offset += 2;
  };

  // RIFF header
  writeString("RIFF");
  writeUint32LE(36 + dataBytes);
  writeString("WAVE");
  // fmt chunk
  writeString("fmt ");
  writeUint32LE(16);
  writeUint16LE(1); // PCM
  writeUint16LE(CHANNELS);
  writeUint32LE(SAMPLE_RATE);
  writeUint32LE(SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8));
  writeUint16LE(CHANNELS * (BITS_PER_SAMPLE / 8));
  writeUint16LE(BITS_PER_SAMPLE);
  // data chunk
  writeString("data");
  writeUint32LE(dataBytes);

  // Deterministic low-amplitude noise (~-55 dBFS peak). Amplitude 32 / 32767
  // ≈ 0.00098 → 20*log10(0.00098) ≈ -60 dBFS. Well under v53 −50 threshold.
  const rng = { s: 12345 };
  let prev = 0;
  for (let i = 0; i < samples; i++) {
    // Brownian filter: prev + jitter, clamped
    const jitter = nextRand(rng) * 0.15;
    prev = Math.max(-1, Math.min(1, prev * 0.98 + jitter * 0.02));
    const sample = Math.round(prev * 32); // amplitude cap ≈ 32/32767
    view.setInt16(offset, sample, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const rawDur = Number(body?.duration_sec ?? body?.durationSec);
    if (!Number.isFinite(rawDur) || rawDur <= 0) {
      return new Response(
        JSON.stringify({ error: "duration_sec must be positive number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Round to 100 ms for storage-path stability. Silence tracks longer than
    // 60 s are clamped in the WAV builder.
    const dur = Math.round(Math.min(60, Math.max(0.1, rawDur)) * 10) / 10;
    const durKey = dur.toFixed(1).replace(".", "_");
    const path = `silence_${durKey}s.wav`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Ensure bucket exists (idempotent).
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      const has = (buckets ?? []).some((b: any) => b?.name === BUCKET);
      if (!has) {
        await supabase.storage.createBucket(BUCKET, { public: true });
      }
    } catch (_e) {
      // best-effort; upload will fail with a clearer message if bucket is missing
    }

    // Try to reuse existing object first (deterministic content by duration).
    const { data: existing } = await supabase.storage
      .from(BUCKET)
      .list("", { search: path, limit: 1 });
    const alreadyPresent = (existing ?? []).some((o: any) => o?.name === path);

    if (!alreadyPresent) {
      const wav = buildSilenceWav(dur);
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, wav, {
          contentType: "audio/wav",
          upsert: true,
          cacheControl: "31536000, immutable",
        });
      if (upErr) {
        return new Response(
          JSON.stringify({ error: "upload_failed", detail: upErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return new Response(
      JSON.stringify({
        ok: true,
        duration_sec: dur,
        url: pub.publicUrl,
        cached: alreadyPresent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "internal", detail: String((e as Error)?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
