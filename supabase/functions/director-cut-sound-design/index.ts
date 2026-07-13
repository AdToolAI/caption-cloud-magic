import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

/**
 * AI Sound Designer (real generation).
 * - Asks Gemini for a list of ambient/sfx prompts per scene.
 * - Calls generate-scene-sfx for each suggestion (parallel, capped).
 * - Returns the inserted scene_audio_clips rows so the UI can render the timeline.
 *
 * Body: {
 *   project_id?, scenes: [{ id, startTime, endTime, description?, mood? }],
 *   detected_mood?: string,
 *   max_clips?: number      // safety cap, default 8
 * }
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "music" });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(auth.replace('Bearer ', ''));
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const scenes = Array.isArray(body?.scenes) ? body.scenes : [];
    const project_id = body?.project_id ?? null;
    const detected_mood = body?.detected_mood ?? 'neutral';
    const max_clips = Math.max(1, Math.min(16, Number(body?.max_clips) || 8));

    if (scenes.length === 0) return json({ error: 'scenes required' }, 400);

    // 1) Ask Gemini for AI sound recommendations
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    let suggestions: Array<{
      scene_id: string;
      kind: 'ambient' | 'sfx' | 'foley';
      prompt: string;
      duration: number;
      start_offset: number;
      volume: number;
    }> = [];

    if (LOVABLE_API_KEY) {
      const sceneDesc = scenes.map((s: any, i: number) =>
        `Scene ${i + 1} [id=${s.id}] (${s.startTime ?? 0}-${s.endTime ?? 0}s): ${s.description || '—'} | mood: ${s.mood || detected_mood}`
      ).join('\n');

      try {
        const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: 'You are a professional sound designer. Output STRICT JSON only.' },
              { role: 'user', content:
`Design ambient + sfx for these scenes. Return JSON:
{"clips":[{"scene_id":"...","kind":"ambient|sfx|foley","prompt":"english sound description (e.g. rainy city street with distant traffic)","duration":6,"start_offset":0,"volume":0.3}]}

Rules:
- Max ${max_clips} clips total.
- 1 ambient per scene (kind=ambient, duration = scene length, volume 0.2-0.35).
- 0-2 sfx accents per scene at meaningful moments (kind=sfx or foley, short duration 1-3s, volume 0.5-0.7).
- start_offset is RELATIVE to scene start.
- Prompts in ENGLISH for best generation quality.

Scenes:
${sceneDesc}` },
            ],
          }),
        });
        if (aiRes.ok) {
          const data = await aiRes.json();
          const content = data?.choices?.[0]?.message?.content || '';
          const m = content.match(/\{[\s\S]*\}/);
          if (m) {
            const parsed = JSON.parse(m[0]);
            if (Array.isArray(parsed?.clips)) suggestions = parsed.clips.slice(0, max_clips);
          }
        }
      } catch (e) {
        console.warn('[sound-design] AI suggestion failed:', (e as Error).message);
      }
    }

    // 2) Fallback if AI failed: 1 ambient per scene
    if (suggestions.length === 0) {
      suggestions = scenes.slice(0, max_clips).map((s: any) => ({
        scene_id: s.id,
        kind: 'ambient' as const,
        prompt: `subtle ${detected_mood} ambient atmosphere`,
        duration: Math.max(3, Math.min(20, (s.endTime ?? 5) - (s.startTime ?? 0))),
        start_offset: 0,
        volume: 0.25,
      }));
    }

    // 3) Generate clips in parallel (cap concurrency)
    const supaUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const concurrency = 3;
    const generated: any[] = [];
    const failed: any[] = [];

    async function generateOne(s: typeof suggestions[number]) {
      try {
        const res = await fetch(`${supaUrl}/functions/v1/generate-scene-sfx`, {
          method: 'POST',
          headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: s.prompt,
            duration: s.duration,
            kind: s.kind,
            project_id,
            scene_id: s.scene_id,
            start_offset: s.start_offset,
            volume: s.volume,
            ducking_enabled: s.kind === 'ambient',
          }),
        });
        const out = await res.json();
        if (res.ok && out?.success) generated.push(out.clip);
        else failed.push({ ...s, error: out?.error || res.status });
      } catch (e) {
        failed.push({ ...s, error: (e as Error).message });
      }
    }

    for (let i = 0; i < suggestions.length; i += concurrency) {
      await Promise.all(suggestions.slice(i, i + concurrency).map(generateOne));
    }

    return json({
      success: true,
      generated_count: generated.length,
      failed_count: failed.length,
      clips: generated,
      failures: failed,
    });
  } catch (e) {
    console.error('[sound-design] fatal', e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
