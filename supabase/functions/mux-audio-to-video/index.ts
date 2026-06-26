import { createClient } from 'npm:@supabase/supabase-js@2';

import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-qa-mock',
};

/**
 * Multi-track audio mux with sidechain ducking + loudnorm.
 *
 * Input:
 * {
 *   videoUrl: string,
 *   audioTracks: {
 *     voiceoverUrl?: string,
 *     voiceoverVolume?: number,           // default 1.0
 *     backgroundMusicUrl?: string,
 *     backgroundMusicVolume?: number,     // default 0.3
 *     autoDuck?: boolean,                 // default true when both VO and music
 *     sceneAudioClips?: Array<{           // ambient / sfx / foley
 *       url: string,
 *       startOffset?: number,             // seconds, default 0
 *       volume?: number,                  // default 0.4
 *       kind?: 'ambient' | 'sfx' | 'foley',
 *     }>,
 *     loudnorm?: boolean,                 // default true (target -14 LUFS)
 *   },
 *   renderId?: string,
 * }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "video" });
  }

  const startTime = Date.now();

  try {
    const { videoUrl, audioTracks, renderId } = await req.json();
    if (!videoUrl) throw new Error('Missing videoUrl');

    const voiceoverUrl: string | undefined = audioTracks?.voiceoverUrl;
    const voiceoverVolume: number = audioTracks?.voiceoverVolume ?? 1.0;
    const backgroundMusicUrl: string | undefined = audioTracks?.backgroundMusicUrl;
    const backgroundMusicVolume: number = audioTracks?.backgroundMusicVolume ?? 0.3;
    const autoDuck: boolean = audioTracks?.autoDuck ?? true;
    const sceneAudioClips: Array<{
      url: string; startOffset?: number; volume?: number; kind?: string;
    }> = Array.isArray(audioTracks?.sceneAudioClips) ? audioTracks.sceneAudioClips : [];
    const loudnorm: boolean = audioTracks?.loudnorm ?? true;

    if (!voiceoverUrl && !backgroundMusicUrl && sceneAudioClips.length === 0) {
      console.log('[mux-audio] No audio tracks, returning original video');
      return jsonResp({ ok: true, outputUrl: videoUrl, muxSkipped: true });
    }

    const tmpDir = await Deno.makeTempDir();
    const videoPath = `${tmpDir}/video.mp4`;
    const outputPath = `${tmpDir}/output.mp4`;

    // Download video
    const videoResp = await fetch(videoUrl);
    if (!videoResp.ok) throw new Error(`Failed to download video: ${videoResp.status}`);
    const videoBytes = new Uint8Array(await videoResp.arrayBuffer());
    await Deno.writeFile(videoPath, videoBytes);
    console.log(`[mux-audio] Video: ${(videoBytes.length / 1024 / 1024).toFixed(1)} MB`);

    // Probe duration
    let videoDuration = 0;
    try {
      const probe = await new Deno.Command('ffprobe', {
        args: ['-v','error','-show_entries','format=duration','-of','csv=p=0', videoPath],
        stdout: 'piped', stderr: 'piped',
      }).output();
      videoDuration = parseFloat(new TextDecoder().decode(probe.stdout).trim()) || 0;
    } catch { /* ignore */ }
    console.log(`[mux-audio] Duration: ${videoDuration.toFixed(1)}s`);

    // Build inputs + filter graph
    const inputs: string[] = [videoPath];
    const filters: string[] = [];
    const mixLabels: string[] = [];

    const downloadTo = async (url: string, name: string): Promise<string | null> => {
      try {
        const r = await fetch(url);
        if (!r.ok) { console.warn(`[mux-audio] download ${url} -> ${r.status}`); return null; }
        const p = `${tmpDir}/${name}`;
        await Deno.writeFile(p, new Uint8Array(await r.arrayBuffer()));
        return p;
      } catch (e) {
        console.warn(`[mux-audio] download error ${url}: ${(e as Error).message}`);
        return null;
      }
    };

    let voIdx = -1;
    let bgIdx = -1;

    if (voiceoverUrl) {
      const p = await downloadTo(voiceoverUrl, 'voiceover.mp3');
      if (p) { inputs.push(p); voIdx = inputs.length - 1; }
    }
    if (backgroundMusicUrl) {
      const p = await downloadTo(backgroundMusicUrl, 'bgmusic.mp3');
      if (p) { inputs.push(p); bgIdx = inputs.length - 1; }
    }

    // Scene audio clips with delay
    const sceneIdxStart = inputs.length;
    const sceneFilters: string[] = [];
    for (let i = 0; i < sceneAudioClips.length; i++) {
      const c = sceneAudioClips[i];
      const p = await downloadTo(c.url, `scene_${i}.mp3`);
      if (!p) continue;
      inputs.push(p);
      const idx = inputs.length - 1;
      const vol = Math.max(0, Math.min(1, c.volume ?? 0.4));
      const delayMs = Math.max(0, Math.round((c.startOffset ?? 0) * 1000));
      const lbl = `s${i}`;
      sceneFilters.push(
        `[${idx}:a]aformat=channel_layouts=stereo,volume=${vol.toFixed(2)},adelay=${delayMs}|${delayMs}[${lbl}]`
      );
      mixLabels.push(`[${lbl}]`);
    }

    // VO filter
    if (voIdx >= 0) {
      filters.push(`[${voIdx}:a]aformat=channel_layouts=stereo,volume=${voiceoverVolume.toFixed(2)}[vo]`);
    }
    // Music filter (with optional fade-out + sidechain duck)
    if (bgIdx >= 0) {
      const fadeOutStart = videoDuration > 4 ? Math.max(0, videoDuration - 3) : null;
      let bgChain = `[${bgIdx}:a]aformat=channel_layouts=stereo,volume=${backgroundMusicVolume.toFixed(2)}`;
      if (fadeOutStart !== null) bgChain += `,afade=t=out:st=${fadeOutStart.toFixed(1)}:d=3`;
      bgChain += `[bgRaw]`;
      filters.push(bgChain);

      if (voIdx >= 0 && autoDuck) {
        // sidechain compressor on music keyed by VO
        filters.push(`[bgRaw][vo]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=400:makeup=0[bg]`);
      } else {
        filters.push(`[bgRaw]anull[bg]`);
      }
    }

    filters.push(...sceneFilters);

    // Compose final mix
    if (voIdx >= 0) mixLabels.unshift('[vo]');
    if (bgIdx >= 0) mixLabels.push('[bg]');

    let finalLabel = '[aout]';
    if (mixLabels.length === 1) {
      // Just rename the single source
      filters.push(`${mixLabels[0]}anull[aout]`);
    } else if (mixLabels.length > 1) {
      filters.push(
        `${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=2:normalize=0[amix]`
      );
      if (loudnorm) {
        filters.push(`[amix]loudnorm=I=-14:TP=-1.5:LRA=11[aout]`);
      } else {
        filters.push(`[amix]anull[aout]`);
      }
    } else {
      finalLabel = '';
    }

    if (!finalLabel) {
      console.log('[mux-audio] No audio inputs downloaded successfully, returning original');
      return jsonResp({ ok: true, outputUrl: videoUrl, muxSkipped: true, reason: 'audio_download_failed' });
    }

    // Build ffmpeg args
    const args: string[] = [];
    for (const f of inputs) args.push('-i', f);
    args.push('-filter_complex', filters.join(';'),
              '-map', '0:v',
              '-map', finalLabel,
              '-c:v', 'copy',
              '-c:a', 'aac',
              '-b:a', '192k',
              '-shortest',
              '-y', outputPath);

    console.log(`[mux-audio] FFmpeg: ${inputs.length} inputs, ${filters.length} filters`);
    const ff = await new Deno.Command('ffmpeg', {
      args, stdout: 'piped', stderr: 'piped',
    }).output();
    if (!ff.success) {
      const err = new TextDecoder().decode(ff.stderr).slice(0, 1000);
      console.error('[mux-audio] FFmpeg failed:', err);
      throw new Error(`FFmpeg mux failed: ${err.slice(0, 500)}`);
    }

    const outBytes = await Deno.readFile(outputPath);
    console.log(`[mux-audio] Output: ${(outBytes.length / 1024 / 1024).toFixed(1)} MB`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const outName = `muxed/${renderId || crypto.randomUUID()}.mp4`;
    const { error: upErr } = await supabase.storage.from('universal-videos')
      .upload(outName, outBytes, { contentType: 'video/mp4', upsert: true });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: pub } = supabase.storage.from('universal-videos').getPublicUrl(outName);

    try { await Deno.remove(tmpDir, { recursive: true }); } catch { /* ignore */ }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[mux-audio] ✅ Done in ${elapsed}s`);

    return jsonResp({
      ok: true,
      outputUrl: pub.publicUrl,
      elapsed: parseFloat(elapsed),
      inputFiles: inputs.length,
      hasVoiceover: voIdx >= 0,
      hasMusic: bgIdx >= 0,
      sceneClips: sceneAudioClips.length,
      ducked: voIdx >= 0 && bgIdx >= 0 && autoDuck,
      loudnorm,
    });
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[mux-audio] ❌ Error after ${elapsed}s:`, error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
