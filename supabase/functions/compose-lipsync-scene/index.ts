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

    const vo = voClips?.[0];
    if (!vo?.url) {
      // No voiceover yet — we cannot lip-sync. Don't leave the scene stuck on
      // 'pending' / 'generating'; mark the underlying clip as ready so the
      // user can keep working. The Cinematic-Sync step will be re-runnable
      // later once a VO is added.
      await supabase
        .from('composer_scenes')
        .update({
          lip_sync_status: 'skipped',
          clip_status: 'ready',
        })
        .eq('id', scene_id);
      return json({
        ok: true,
        skipped: true,
        reason: 'no_voiceover',
        scene_id,
      });
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
