import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * r41: Mux audio tracks onto a silent video using FFmpeg.
 * Uses -c:v copy (no re-encoding) so it's near-instant (2-5 seconds).
 * 
 * Input: { videoUrl, audioTracks: { voiceoverUrl?, backgroundMusicUrl?, backgroundMusicVolume? }, outputKey? }
 * Output: { ok: true, outputUrl: string } or { ok: false, error: string }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { videoUrl, audioTracks, userId, renderId, progressId } = await req.json();

    if (!videoUrl) {
      throw new Error('Missing videoUrl');
    }

    const voiceoverUrl = audioTracks?.voiceoverUrl;
    const backgroundMusicUrl = audioTracks?.backgroundMusicUrl;
    const backgroundMusicVolume = audioTracks?.backgroundMusicVolume ?? 0.3;

    // If no audio tracks at all, just return the original video
    if (!voiceoverUrl && !backgroundMusicUrl) {
      console.log('[mux-audio] No audio tracks provided, returning original video');
      return new Response(
        JSON.stringify({ ok: true, outputUrl: videoUrl, muxSkipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[mux-audio] Starting mux: video=${videoUrl.substring(0, 80)}, voiceover=${!!voiceoverUrl}, music=${!!backgroundMusicUrl}, volume=${backgroundMusicVolume}`);

    // Download video to temp file
    const tmpDir = await Deno.makeTempDir();
    const videoPath = `${tmpDir}/video.mp4`;
    const outputPath = `${tmpDir}/output.mp4`;

    // Download video
    console.log('[mux-audio] Downloading video...');
    const videoResp = await fetch(videoUrl);
    if (!videoResp.ok) throw new Error(`Failed to download video: ${videoResp.status}`);
    const videoBytes = new Uint8Array(await videoResp.arrayBuffer());
    await Deno.writeFile(videoPath, videoBytes);
    console.log(`[mux-audio] Video downloaded: ${(videoBytes.length / 1024 / 1024).toFixed(1)} MB`);

    // Download audio tracks
    const inputFiles: string[] = [videoPath];
    const filterParts: string[] = [];
    const mapParts: string[] = ['-map', '0:v'];
    let audioInputIdx = 1;

    if (voiceoverUrl) {
      const voPath = `${tmpDir}/voiceover.mp3`;
      console.log('[mux-audio] Downloading voiceover...');
      const voResp = await fetch(voiceoverUrl);
      if (voResp.ok) {
        const voBytes = new Uint8Array(await voResp.arrayBuffer());
        await Deno.writeFile(voPath, voBytes);
        inputFiles.push(voPath);
        filterParts.push(`[${audioInputIdx}:a]volume=1.0[vo]`);
        audioInputIdx++;
        console.log(`[mux-audio] Voiceover downloaded: ${(voBytes.length / 1024).toFixed(0)} KB`);
      } else {
        console.warn(`[mux-audio] Voiceover download failed: ${voResp.status}, skipping`);
      }
    }

    if (backgroundMusicUrl) {
      const bgPath = `${tmpDir}/bgmusic.mp3`;
      console.log('[mux-audio] Downloading background music...');
      const bgResp = await fetch(backgroundMusicUrl);
      if (bgResp.ok) {
        const bgBytes = new Uint8Array(await bgResp.arrayBuffer());
        await Deno.writeFile(bgPath, bgBytes);
        inputFiles.push(bgPath);
        filterParts.push(`[${audioInputIdx}:a]volume=${backgroundMusicVolume.toFixed(2)}[bg]`);
        audioInputIdx++;
        console.log(`[mux-audio] Background music downloaded: ${(bgBytes.length / 1024).toFixed(0)} KB`);
      } else {
        console.warn(`[mux-audio] Background music download failed: ${bgResp.status}, skipping`);
      }
    }

    // If no audio files downloaded successfully, return original
    if (inputFiles.length === 1) {
      console.log('[mux-audio] No audio files downloaded successfully, returning original video');
      return new Response(
        JSON.stringify({ ok: true, outputUrl: videoUrl, muxSkipped: true, reason: 'audio_download_failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build FFmpeg command
    const ffmpegArgs: string[] = [];
    
    // Input files
    for (const f of inputFiles) {
      ffmpegArgs.push('-i', f);
    }

    // Build filter complex based on available audio
    const hasVoiceover = filterParts.some(p => p.includes('[vo]'));
    const hasMusic = filterParts.some(p => p.includes('[bg]'));

    // Filter complex will be built after duration probe (for fade-out support)

    // Get video duration for fade-out calculation
    let videoDuration = 0;
    try {
      const probeCmd = new Deno.Command('ffprobe', {
        args: ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath],
        stdout: 'piped',
        stderr: 'piped',
      });
      const probeResult = await probeCmd.output();
      const durationStr = new TextDecoder().decode(probeResult.stdout).trim();
      videoDuration = parseFloat(durationStr) || 0;
      console.log(`[mux-audio] Video duration: ${videoDuration.toFixed(1)}s`);
    } catch {
      console.warn('[mux-audio] Could not probe video duration, skipping fade-out');
    }

    // Apply fade-out to background music if we have duration info
    if (hasMusic && videoDuration > 4) {
      // Rebuild the filter to add fade-out on background music
      const fadeStart = Math.max(0, videoDuration - 3);
      const bgFilterIdx = filterParts.findIndex(p => p.includes('[bg]'));
      if (bgFilterIdx >= 0) {
        // Replace [bg] filter to include fade-out
        const volMatch = filterParts[bgFilterIdx].match(/volume=([\d.]+)/);
        const vol = volMatch ? volMatch[1] : '0.30';
        const bgInputNum = hasVoiceover ? 2 : 1;
        filterParts[bgFilterIdx] = `[${bgInputNum}:a]volume=${vol},afade=t=out:st=${fadeStart.toFixed(1)}:d=3[bg]`;
        console.log(`[mux-audio] Added 3s fade-out starting at ${fadeStart.toFixed(1)}s`);
      }
    }

    // Rebuild filter_complex with updated filters
    if (hasVoiceover && hasMusic) {
      // Clear previous -filter_complex args and rebuild
      ffmpegArgs.push(
        '-filter_complex',
        `${filterParts.join(';')};[vo][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
        '-map', '0:v',
        '-map', '[aout]',
      );
    } else if (hasVoiceover) {
      ffmpegArgs.push(
        '-filter_complex', filterParts[0],
        '-map', '0:v',
        '-map', '[vo]',
      );
    } else if (hasMusic) {
      ffmpegArgs.push(
        '-filter_complex', filterParts[0],
        '-map', '0:v',
        '-map', '[bg]',
      );
    }

    // Output settings: copy video codec (instant), encode audio as AAC
    ffmpegArgs.push(
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-y',
      outputPath,
    );

    console.log(`[mux-audio] Running FFmpeg with ${inputFiles.length} inputs...`);
    const ffmpegCmd = new Deno.Command('ffmpeg', {
      args: ffmpegArgs,
      stdout: 'piped',
      stderr: 'piped',
    });

    const ffmpegResult = await ffmpegCmd.output();
    const stderr = new TextDecoder().decode(ffmpegResult.stderr);

    if (!ffmpegResult.success) {
      console.error(`[mux-audio] FFmpeg failed:`, stderr.substring(0, 1000));
      throw new Error(`FFmpeg mux failed: ${stderr.substring(0, 500)}`);
    }

    console.log(`[mux-audio] FFmpeg completed successfully`);

    // Read output file
    const outputBytes = await Deno.readFile(outputPath);
    console.log(`[mux-audio] Output size: ${(outputBytes.length / 1024 / 1024).toFixed(1)} MB`);

    // Upload to Supabase Storage
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const outputFileName = `muxed/${renderId || crypto.randomUUID()}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from('universal-videos')
      .upload(outputFileName, outputBytes, {
        contentType: 'video/mp4',
        upsert: true,
      });

    if (uploadError) {
      console.error('[mux-audio] Upload failed:', uploadError);
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage
      .from('universal-videos')
      .getPublicUrl(outputFileName);

    const outputUrl = urlData?.publicUrl;
    console.log(`[mux-audio] ✅ Muxed video uploaded: ${outputUrl}`);

    // Cleanup temp files
    try {
      await Deno.remove(tmpDir, { recursive: true });
    } catch { /* best effort */ }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[mux-audio] ✅ Complete in ${elapsed}s`);

    return new Response(
      JSON.stringify({
        ok: true,
        outputUrl,
        elapsed: parseFloat(elapsed),
        inputFiles: inputFiles.length,
        hasVoiceover,
        hasMusic,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[mux-audio] ❌ Error after ${elapsed}s:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
