// Deterministic shot-boundary detection using PySceneDetect (industry standard,
// same engine used by CapCut/DaVinci "Scene Edit Detection"). Runs on Replicate
// via the `hexiaochun/video_split` model (which wraps PySceneDetect's
// content-aware detector). Returns the split scene file URLs — the client
// probes each one's duration to build cumulative boundary timestamps.
//
// This replaces the unreliable Gemini-based boundary detection. LLMs remain
// useful for describing scenes (mood/effects), not for finding them.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL_VERSION = '1328af827594e4ec8dd2a2e69bb7b50c760c2b643a011417d5027768a17954a1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { video_url, threshold = 27 } = await req.json();
    if (!video_url || typeof video_url !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'video_url_required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: 'replicate_not_configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('[detect-scenes-pyscenedetect] Starting prediction for', video_url, 'threshold=', threshold);

    // Create prediction (synchronous wait via Prefer header for short videos;
    // we still poll as fallback for longer ones)
    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=60',
      },
      body: JSON.stringify({
        version: MODEL_VERSION,
        input: { video: video_url, threshold },
      }),
    });

    if (!createRes.ok) {
      const t = await createRes.text();
      console.error('[detect-scenes-pyscenedetect] create failed', createRes.status, t.slice(0, 300));
      return new Response(JSON.stringify({ ok: false, error: 'replicate_create_failed', detail: t.slice(0, 300) }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let prediction = await createRes.json();
    let attempts = 0;
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.status !== 'canceled' && attempts < 90) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(prediction.urls.get, {
        headers: { 'Authorization': `Bearer ${REPLICATE_API_KEY}` },
      });
      if (!pollRes.ok) break;
      prediction = await pollRes.json();
      attempts++;
    }

    if (prediction.status !== 'succeeded') {
      console.error('[detect-scenes-pyscenedetect] prediction failed', prediction.status, prediction.error);
      return new Response(JSON.stringify({
        ok: false,
        error: 'pyscenedetect_failed',
        detail: String(prediction.error || prediction.status).slice(0, 300),
      }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const output = prediction.output;
    const sceneUrls: string[] = Array.isArray(output)
      ? output.filter((u: any) => typeof u === 'string')
      : Array.isArray(output?.files)
        ? output.files.filter((u: any) => typeof u === 'string')
        : [];

    console.log('[detect-scenes-pyscenedetect] Detected', sceneUrls.length, 'scenes');

    return new Response(JSON.stringify({
      ok: true,
      scene_urls: sceneUrls,
      scene_count: sceneUrls.length,
      threshold,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[detect-scenes-pyscenedetect] error', err);
    return new Response(JSON.stringify({
      ok: false,
      error: 'unexpected_error',
      detail: err instanceof Error ? err.message : String(err),
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
