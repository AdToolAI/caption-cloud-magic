/**
 * compose-lipsync-scene — Sync.so post-step for the AI Video Composer.
 *
 * Takes a Composer scene that already has:
 *   - a rendered (silent) clip_url
 *   - one or more voiceover clips in scene_audio_clips (kind='voiceover')
 *
 * 1. Downloads the silent clip + concatenates VO audio for that scene window.
 * 2. Sends video+audio to Replicate sync/lipsync-2.
 * 3. Uploads the synced result to the composer-clips bucket.
 * 4. Updates composer_scenes:
 *      - lip_sync_source_clip_url ← original clip_url (first run only)
 *      - clip_url                 ← synced URL
 *      - lip_sync_applied_at      ← now()
 *      - lip_sync_status          ← 'done'
 *
 * Idempotent credit refund on Replicate failure (deterministic UUID derived
 * from scene_id, see Memory: Credit Refund Automation).
 *
 * Auth: requires user JWT (no service-role bypass — this is user-initiated).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import Replicate from "npm:replicate@0.25.2";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const COST = 8;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockResponse({ corsHeaders, kind: "video" });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'Unauthorized' }, 401);
    const token = auth.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const { scene_id } = body || {};
    if (!scene_id) return json({ error: 'scene_id required' }, 400);

    // Load scene + verify ownership via project
    const { data: scene, error: sErr } = await supabase
      .from('composer_scenes')
      .select('id, project_id, clip_url, lip_sync_source_clip_url, lip_sync_with_voiceover, duration_seconds, dialog_script, dialog_voices, audio_plan, character_audio_url')
      .eq('id', scene_id)
      .single();
    if (sErr || !scene) return json({ error: 'scene not found' }, 404);

    const { data: project, error: pErr } = await supabase
      .from('composer_projects')
      .select('id, user_id')
      .eq('id', scene.project_id)
      .single();
    if (pErr || !project) return json({ error: 'project not found' }, 404);
    if (project.user_id !== user.id) return json({ error: 'Forbidden' }, 403);

    // We re-sync against the ORIGINAL silent clip if available — otherwise
    // each re-sync would feed the previously synced video back in, slowly
    // drifting/degrading the output.
    const sourceClipUrl =
      (scene as any).lip_sync_source_clip_url || scene.clip_url || null;
    if (!sourceClipUrl) return json({ error: 'no source clip' }, 400);

    // Find the voiceover clip(s) for this scene.
    // SAFETY: if multiple distinct voiceover clips exist (multi-speaker dialog
    // generated via SceneDialogStudio), refuse to run — Sync.so applies a
    // single audio track to the entire video, which would make ONE face
    // lip-sync the whole multi-speaker dialog. Multi-speaker scenes must use
    // the per-speaker Shot-Reverse-Shot flow (HeyGen per cut) instead.
    const { data: voClips } = await supabase
      .from('scene_audio_clips')
      .select('url, duration, start_offset')
      .eq('scene_id', scene_id)
      .eq('kind', 'voiceover')
      .order('duration', { ascending: false });

    if ((voClips?.length ?? 0) > 1) {
      return json({
        error: 'multi_speaker_not_supported',
        message:
          'This scene has multiple voiceover speakers. Generic lip-sync polish would force one face to speak all lines. Use the per-speaker Shot-Reverse-Shot flow instead.',
      }, 409);
    }

    let vo: { url?: string; duration?: number } | undefined = voClips?.[0];

    // ── Voiceover resolution fallbacks ────────────────────────────────
    // The user's expectation is "Cinematic-Sync rebuilds the existing HeyGen
    // scene with a real environment". HeyGen scenes carry their VO inside
    // `character_audio_url` and/or `audio_plan`, but not always in
    // scene_audio_clips. Walk the fallbacks before giving up.

    // Fallback 1 — locked AudioPlan with a single speaker that has an audioUrl.
    if (!vo?.url) {
      const planSpeakers = ((scene as any).audio_plan?.speakers ?? []) as Array<{ audioUrl?: string; endSec?: number; startSec?: number }>;
      if (planSpeakers.length === 1 && planSpeakers[0]?.audioUrl) {
        vo = {
          url: planSpeakers[0].audioUrl,
          duration: Math.max(0.1, (planSpeakers[0].endSec ?? 0) - (planSpeakers[0].startSec ?? 0)),
        };
        console.log(`[compose-lipsync-scene ${scene_id}] vo from audio_plan`);
      } else if (planSpeakers.length > 1) {
        return json({
          error: 'multi_speaker_not_supported',
          message:
            'This scene has multiple voiceover speakers in the locked Audio Plan. Use the per-speaker Shot-Reverse-Shot flow.',
        }, 409);
      }
    }

    // Fallback 2 — character_audio_url (HeyGen wrote the TTS audio here).
    if (!vo?.url && (scene as any).character_audio_url) {
      vo = { url: (scene as any).character_audio_url, duration: 0 };
      console.log(`[compose-lipsync-scene ${scene_id}] vo from character_audio_url`);
    }

    // Fallback 3 — re-synthesize from dialog_script + dialog_voices (single speaker only).
    if (!vo?.url && (scene as any).dialog_script) {
      const script = String((scene as any).dialog_script || '').trim();
      // Detect speaker count to refuse multi-speaker re-synth.
      const speakerSet = new Set<string>();
      for (const line of script.split('\n')) {
        const m = line.match(/^\s*\[?([A-Za-zÀ-ÿ][\w\s.'-]{1,40}?)\]?\s*[:：]/);
        if (m) speakerSet.add(m[1].trim().toLowerCase());
      }
      if (speakerSet.size > 1) {
        return json({
          error: 'multi_speaker_not_supported',
          message:
            'Dialog script has multiple speakers. Split into Shot-Reverse-Shot scenes first.',
        }, 409);
      }
      const cleanText = script
        .split('\n')
        .map((l) => l.replace(/^\s*\[?[A-Za-zÀ-ÿ][\w\s.'-]{1,40}?\]?\s*[:：]\s*/, '').trim())
        .filter((l) => l.length > 0)
        .join(' ');
      const voices = ((scene as any).dialog_voices ?? {}) as Record<string, any>;
      const firstVoice = Object.values(voices)[0] as any;
      const voiceId = typeof firstVoice === 'string' ? firstVoice : firstVoice?.voiceId;
      // Hume-Detection: if voice is from Hume, route through generate-voiceover-hume
      // (the ElevenLabs endpoint would 400 on a Hume voice name).
      const isHumeVoice =
        firstVoice &&
        typeof firstVoice === 'object' &&
        (firstVoice.provider === 'HUME_AI' ||
          firstVoice.provider === 'CUSTOM_VOICE' ||
          firstVoice.engine === 'hume');
      const humeVoiceName = firstVoice?.voiceName ?? voiceId;
      let ttsFailureMessage: string | null = null;
      if (cleanText && (voiceId || humeVoiceName)) {
        try {
          const endpoint = isHumeVoice ? 'generate-voiceover-hume' : 'generate-voiceover';
          const payload = isHumeVoice
            ? {
                text: cleanText,
                voiceName: humeVoiceName,
                provider: firstVoice?.provider || 'HUME_AI',
                projectId: scene.project_id,
              }
            : { text: cleanText, voiceId, projectId: scene.project_id };
          console.log(
            `[compose-lipsync-scene ${scene_id}] TTS fallback via ${endpoint} (voice=${humeVoiceName ?? voiceId})`,
          );
          const ttsResp = await fetch(`${supabaseUrl}/functions/v1/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': auth },
            body: JSON.stringify(payload),
          });
          if (ttsResp.ok) {
            const ttsData = await ttsResp.json();
            const audioUrl = ttsData?.audioUrl;
            const duration = Number(ttsData?.duration ?? 0);
            if (audioUrl) {
              // Persist as scene_audio_clips so the preview/timeline can play it.
              await supabase.from('scene_audio_clips').insert({
                user_id: user.id,
                project_id: scene.project_id,
                scene_id,
                kind: 'voiceover',
                source: 'ai',
                prompt: cleanText.slice(0, 500),
                url: audioUrl,
                start_offset: 0,
                duration: Math.max(0.1, duration || 0),
                volume: 1,
                ducking_enabled: true,
                cost_credits: 0,
              });
              vo = { url: audioUrl, duration };
              console.log(`[compose-lipsync-scene ${scene_id}] vo synthesized from dialog_script via ${endpoint}`);
            } else {
              ttsFailureMessage = `${endpoint} returned no audioUrl`;
            }
          } else {
            const errText = await ttsResp.text().catch(() => '');
            ttsFailureMessage = isHumeVoice
              ? `Hume-Stimme "${humeVoiceName}" konnte nicht synthetisiert werden (HTTP ${ttsResp.status}). Bitte im Voiceover-Tab eine andere Stimme wählen.`
              : `ElevenLabs-Stimme "${voiceId}" konnte nicht synthetisiert werden (HTTP ${ttsResp.status}). ${errText.slice(0, 200)}`;
            console.warn(`[compose-lipsync-scene ${scene_id}] ${endpoint} failed: ${ttsResp.status} ${errText.slice(0, 200)}`);
          }
        } catch (ttsErr) {
          ttsFailureMessage = `TTS-Aufruf fehlgeschlagen: ${(ttsErr as Error).message}`;
          console.warn(`[compose-lipsync-scene ${scene_id}] TTS fallback exception`, ttsErr);
        }
      }

      // If TTS failed with a concrete reason, surface it as `tts_failed` so the
      // UI can show the real cause (e.g. wrong voice provider) instead of the
      // generic "needs voiceover" message.
      if (!vo?.url && ttsFailureMessage) {
        await supabase
          .from('composer_scenes')
          .update({
            clip_status: 'ready',
            lip_sync_status: 'no_voiceover',
            clip_error: ttsFailureMessage,
          })
          .eq('id', scene_id);
        return json({
          ok: false,
          error: 'tts_failed',
          message: ttsFailureMessage,
          scene_id,
        }, 422);
      }
    }

    if (!vo?.url) {
      // No voiceover anywhere. Don't pretend it succeeded — flip lip_sync_status
      // to a distinct 'no_voiceover' state and surface a clear error so the UI
      // can prompt the user to add a voiceover instead of leaving the scene
      // looking 'ready' when it actually never got lip-synced.
      await supabase
        .from('composer_scenes')
        .update({
          clip_status: 'ready',
          lip_sync_status: 'no_voiceover',
          clip_error: 'Cinematic-Sync benötigt ein Voiceover für diese Szene. Bitte zuerst im Dialog/VO-Tab eine Stimme generieren, dann erneut starten.',
        })
        .eq('id', scene_id);
      return json({
        ok: false,
        error: 'no_voiceover',
        message:
          'Cinematic-Sync benötigt ein Voiceover für diese Szene. Bitte zuerst im Dialog-Studio oder Voiceover-Tab eine Stimme generieren.',
        scene_id,
      }, 422);
    }

    // Wallet check + reserve
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();
    if (!wallet || wallet.balance < COST) {
      return json({ error: 'INSUFFICIENT_CREDITS', required: COST }, 402);
    }

    const REPLICATE_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_KEY) return json({ error: 'REPLICATE_API_KEY missing' }, 500);

    // Mark scene as running so UI can show spinner / disable buttons
    await supabase
      .from('composer_scenes')
      .update({ lip_sync_status: 'running' })
      .eq('id', scene_id);

    await supabase.from('wallets').update({
      balance: wallet.balance - COST,
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id);

    const refund = async (reason: string) => {
      console.warn(`[compose-lipsync-scene ${scene_id}] Refund ${COST}: ${reason}`);
      const { data: w2 } = await supabase
        .from('wallets').select('balance').eq('user_id', user.id).single();
      if (w2) {
        await supabase.from('wallets').update({
          balance: w2.balance + COST,
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id);
      }
      await supabase
        .from('composer_scenes')
        .update({ lip_sync_status: 'failed' })
        .eq('id', scene_id);
    };

    try {
      const replicate = new Replicate({ auth: REPLICATE_KEY });
      // If the VO is longer than the source clip, use `cut_off` so Sync.so
      // truncates instead of looping the audio (which produces double-speak
      // artefacts). Default to `loop` for short VOs that need to fill the clip.
      const sceneDuration = (scene as any).duration_seconds ?? 0;
      const voDuration = vo.duration ?? 0;
      const syncMode = voDuration > sceneDuration + 0.2 ? 'cut_off' : 'loop';
      const output = await replicate.run(
        "sync/lipsync-2" as `${string}/${string}`,
        {
          input: {
            video: sourceClipUrl,
            audio: vo.url,
            sync_mode: syncMode,
          },
        },
      );

      let outUrl: string | null = null;
      if (typeof output === 'string') outUrl = output;
      else if (Array.isArray(output) && output.length) outUrl = output[0] as string;
      else if (output && typeof output === 'object') {
        const o = output as Record<string, unknown>;
        outUrl = (o.video || o.output || o.url) as string ?? null;
      }
      if (!outUrl) {
        await refund('no output url');
        return json({ error: 'no output url' }, 502);
      }

      // Re-host the result in our own bucket so the public URL keeps working
      // beyond Replicate's TTL.
      let publicUrl = outUrl;
      try {
        const dl = await fetch(outUrl);
        if (dl.ok) {
          const buf = new Uint8Array(await dl.arrayBuffer());
          const path = `${user.id}/${scene_id}-lipsync-${Date.now()}.mp4`;
          const { error: upErr } = await supabase.storage
            .from('composer-clips')
            .upload(path, buf, { contentType: 'video/mp4', upsert: true });
          if (!upErr) {
            const { data: pub } = supabase.storage
              .from('composer-clips')
              .getPublicUrl(path);
            if (pub?.publicUrl) publicUrl = pub.publicUrl;
          } else {
            console.warn(`[compose-lipsync-scene] upload failed, using replicate url`, upErr);
          }
        }
      } catch (e) {
        console.warn('[compose-lipsync-scene] rehost failed, using replicate url', e);
      }

      // Store source on first run; preserve on subsequent runs.
      const updates: Record<string, unknown> = {
        clip_url: publicUrl,
        lip_sync_applied_at: new Date().toISOString(),
        lip_sync_status: 'done',
      };
      if (!(scene as any).lip_sync_source_clip_url && scene.clip_url) {
        updates.lip_sync_source_clip_url = scene.clip_url;
      }

      const { error: updErr } = await supabase
        .from('composer_scenes')
        .update(updates)
        .eq('id', scene_id);
      if (updErr) {
        await refund(`db update failed: ${updErr.message}`);
        return json({ error: updErr.message }, 500);
      }

      return json({
        success: true,
        scene_id,
        clip_url: publicUrl,
        credits_used: COST,
      });
    } catch (e) {
      await refund(`replicate error: ${(e as Error).message}`);
      return json({ error: (e as Error).message }, 502);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
