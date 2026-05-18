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

// MP3 pipeline @ 44.1 kHz / 128 kbps CBR — both ElevenLabs and Hume can deliver
// this format, so we can concatenate buffers byte-wise and let downstream
// (Sync.so / ffmpeg) decode the stitched stream. Duration is derived from
// CBR math (bytes * 8 / bitrate). A natural pause between speakers is
// produced by appending " ... " to each non-final block's text — the TTS
// engine handles the prosody, no synthetic silence frames needed.
const MP3_BITRATE = 128_000; // bits per second
const FALLBACK_ELEVEN_VOICE = "EXAVITQu4vr4xnSDxMaL"; // Sarah — neutral female fallback

// ── Silence MP3 generator ────────────────────────────────────────────────
// One MPEG1 Layer III frame @ 44.1 kHz / 128 kbps stereo = 417 bytes,
// representing 1152 / 44100 ≈ 26.122 ms of audio. We construct a single
// silent frame (valid 4-byte header + zero-filled side info + zero payload)
// and repeat it to reach the desired silence duration. ffmpeg-based decoders
// (which sync.so uses internally) accept these zero-data frames and output
// silence, allowing us to pad per-speaker tracks so each speaker's audio
// sits at its real timestamp within the scene.
const SILENCE_FRAME_BYTES = 417;
const SILENCE_FRAME_SEC = 1152 / 44100;
function buildSilenceFrame(): Uint8Array {
  const f = new Uint8Array(SILENCE_FRAME_BYTES);
  f[0] = 0xff;
  f[1] = 0xfb; // MPEG1, Layer III, no CRC
  f[2] = 0x90; // 128 kbps, 44.1 kHz, no padding
  f[3] = 0x04; // stereo, original
  return f;
}
const SILENCE_FRAME = buildSilenceFrame();
function silenceMp3(durationSec: number): Uint8Array {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return new Uint8Array(0);
  const nFrames = Math.max(1, Math.round(durationSec / SILENCE_FRAME_SEC));
  const out = new Uint8Array(nFrames * SILENCE_FRAME_BYTES);
  for (let i = 0; i < nFrames; i++) out.set(SILENCE_FRAME, i * SILENCE_FRAME_BYTES);
  return out;
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

async function elevenlabsMp3(
  apiKey: string,
  voiceId: string,
  text: string,
): Promise<Uint8Array> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
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
  return new Uint8Array(await res.arrayBuffer());
}

async function humeMp3(
  apiKey: string,
  voiceName: string,
  provider: "HUME_AI" | "CUSTOM_VOICE",
  text: string,
): Promise<Uint8Array> {
  const res = await fetch("https://api.hume.ai/v0/tts/file", {
    method: "POST",
    headers: {
      "X-Hume-Api-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      utterances: [
        { text, voice: { name: voiceName, provider } },
      ],
      format: { type: "mp3" },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Hume "${voiceName}" failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** Concatenate MP3 byte buffers directly. Works with CBR streams from EL/Hume. */
function concatMp3(buffers: Uint8Array[]): Uint8Array {
  const total = buffers.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of buffers) {
    out.set(b, off);
    off += b.length;
  }
  return out;
}

/** Estimate duration of a CBR MP3 buffer at MP3_BITRATE bits/s. */
function mp3DurationSec(buf: Uint8Array): number {
  return (buf.length * 8) / MP3_BITRATE;
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
        // Validate it was produced by us — by URL prefix.
        if (String(existing[0].url).includes("/twoshot-vo/")) {
          return json({
            success: true,
            already: true,
            url: existing[0].url,
            duration: existing[0].duration,
            speakers: Array.isArray((existing[0] as any)?.metadata?.speakers)
              ? (existing[0] as any).metadata.speakers
              : blocks.length,
          });
        }
      }
    }

    // Per-speaker TTS in script order. We append " ... " to each non-final
    // block so the TTS engine produces a natural pause between speakers,
    // avoiding the need to inject silence between MP3 frames.
    const mp3Buffers: Uint8Array[] = [];
    const segments: Array<{
      speaker: string;
      speaker_slug: string;
      character_id: string | null;
      engine: string;
      voice: string;
      startSec: number;
      endSec: number;
      track_url?: string;
    }> = [];
    let cursor = 0;
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
      let mp3: Uint8Array;
      try {
        if (voice.engine === "hume") {
          if (!humeKey) throw new Error("HUME_API_KEY not configured");
          mp3 = await humeMp3(humeKey, voice.voiceId, voice.provider ?? "HUME_AI", utterance);
        } else {
          if (!elevenKey) throw new Error("ELEVENLABS_API_KEY not configured");
          mp3 = await elevenlabsMp3(elevenKey, voice.voiceId, utterance);
        }
        console.log(`[compose-twoshot-audio] ${voice.engine} voice ok`, { speaker: block.rawSpeaker, voice: voice.voiceId, bytes: mp3.length });
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
          mp3 = await elevenlabsMp3(elevenKey, FALLBACK_ELEVEN_VOICE, utterance);
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
      const dur = mp3DurationSec(mp3);
      // Resolve character id via charByName for downstream face-mapping.
      const slug = block.speakerName;
      const charEntry = charByName.get(slug) ?? charByName.get(slug.split("-")[0]);
      segments.push({
        speaker: block.rawSpeaker,
        speaker_slug: slug,
        character_id: charEntry?.id ?? null,
        engine: voice.engine,
        voice: voice.voiceId,
        startSec: Math.round(cursor * 100) / 100,
        endSec: Math.round((cursor + dur) * 100) / 100,
      });
      cursor += dur;
      mp3Buffers.push(mp3);
    }

    const spokenMp3 = concatMp3(mp3Buffers);
    const spokenSec = mp3DurationSec(spokenMp3);

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
    // Without this fallback, per-speaker padded tracks collapse to spokenSec
    // (~7s) → Sync.so produces a 7s lipsync output that doesn't match the
    // 10s silent two-shot master, and the user sees a "duplicate scene"
    // (10s silent original + 7s short lipsync).
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
    const totalSec = Math.max(spokenSec, sceneDur);
    const tailSec = Math.max(0, totalSec - spokenSec);
    const mergedMp3 = tailSec > 0 ? concatMp3([spokenMp3, silenceMp3(tailSec)]) : spokenMp3;

    // Upload merged track to user-scoped path in voiceover-audio bucket.
    const stamp = Date.now();
    const fileName = `${userId}/twoshot-vo/${scene_id}-${stamp}.mp3`;
    const { error: upErr } = await supabase.storage
      .from("voiceover-audio")
      .upload(fileName, mergedMp3, { contentType: "audio/mpeg", upsert: false });
    if (upErr) return json({ error: `upload failed: ${upErr.message}` }, 500);
    const { data: pub } = supabase.storage.from("voiceover-audio").getPublicUrl(fileName);
    const publicUrl = pub.publicUrl;

    // ── Build & upload per-character padded tracks ──────────────────────
    // Important: we run ONE Sync.so pass per character, not per dialogue turn.
    // A/B/A/B dialogue must therefore produce 2 tracks (A and B), where each
    // track contains that speaker's segments at their original timestamps and
    // silence everywhere else. This keeps the lipsync worker within runtime
    // limits while preserving sequential speech timing.
    const groups = new Map<string, {
      speaker: string;
      speaker_slug: string;
      character_id: string | null;
      engine: string;
      voice: string;
      startSec: number;
      endSec: number;
      turns: Array<{ startSec: number; endSec: number; text_index: number }>;
      items: Array<{ segment: typeof segments[number]; mp3: Uint8Array; index: number }>;
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
        existing.items.push({ segment: seg, mp3: mp3Buffers[i], index: i });
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
          items: [{ segment: seg, mp3: mp3Buffers[i], index: i }],
        });
      }
    }
    const speakerTracks = Array.from(groups.values()).sort((a, b) => a.startSec - b.startSec);

    for (let i = 0; i < speakerTracks.length; i++) {
      try {
        const group = speakerTracks[i];
        const pieces: Uint8Array[] = [];
        let t = 0;
        for (const item of group.items.sort((a, b) => a.segment.startSec - b.segment.startSec)) {
          pieces.push(silenceMp3(Math.max(0, item.segment.startSec - t)));
          pieces.push(item.mp3);
          t = item.segment.endSec;
        }
        pieces.push(silenceMp3(Math.max(0, totalSec - t)));
        const track = concatMp3(pieces);
        const trackPath = `${userId}/twoshot-vo/${scene_id}-${stamp}-char${i}-${group.speaker_slug}.mp3`;
        const { error: tErr } = await supabase.storage
          .from("voiceover-audio")
          .upload(trackPath, track, { contentType: "audio/mpeg", upsert: false });
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
      duration: Math.round(totalSec * 100) / 100,
      start_offset: 0,
      volume: 1,
      ducking_enabled: false,
      cost_credits: 0,
      refunded: false,
      metadata: {
        source: "compose-twoshot-audio",
        kind: "twoshot_merged",
        format: "mp3",
        bitrate: MP3_BITRATE,
        spoken_seconds: Math.round(spokenSec * 100) / 100,
        scene_duration_seconds: sceneDur,
        segments,
        speakers: speakerTracks,
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
            segments,
            speakers: speakerTracks,
            spokenSec: Math.round(spokenSec * 100) / 100,
            totalSec: Math.round(totalSec * 100) / 100,
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
      duration: Math.round(totalSec * 100) / 100,
      speakers: speakerTracks,
      segments,
    });
  } catch (e) {
    console.error("[compose-twoshot-audio] error", e);
    return json({ error: e instanceof Error ? e.message : "unknown error" }, 500);
  }
});
