// Deterministic shot-boundary detection using PySceneDetect's ADAPTIVE detector
// (magpai-app/cog-scenedetect on Replicate). Adaptive thresholding is the same
// approach used by DaVinci Resolve / CapCut "Scene Edit Detection" — it adapts
// to local lighting/motion and catches both hard cuts AND soft transitions
// that the simple content-threshold detector misses.
//
// Returns split scene file URLs — the client probes each one's duration to
// build cumulative boundary timestamps.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// magpai-app/cog-scenedetect — adaptive PySceneDetect detector, returns { videos: [urls] }
const MODEL_VERSION = 'a27d706ef8788f49cd40ae1d2266b7355de21d48b9446789b35eebdd3817490d';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const video_url: string = body.video_url;
    // Adaptive threshold: 3.0 = default sensitive, lower = more cuts.
    // min_scene_len in FRAMES (15 ≈ 0.5s @30fps) — protects against duplicates,
    // not against legitimate short shots.
    const adaptive_threshold: number = typeof body.adaptive_threshold === 'number' ? body.adaptive_threshold : 3;
    const min_scene_len: number = typeof body.min_scene_len === 'number' ? body.min_scene_len : 15;
    const luma_only: boolean = body.luma_only === true;

    if (!video_url || typeof video_url !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'video_url_required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: 'replicate_not_configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('[detect-scenes-pyscenedetect] adaptive run for', video_url,
      'adaptive_threshold=', adaptive_threshold, 'min_scene_len=', min_scene_len);

    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=60',
      },
      body: JSON.stringify({
        version: MODEL_VERSION,
        input: { video: video_url, adaptive_threshold, min_scene_len, luma_only },
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
    // magpai-app/cog-scenedetect returns { videos: [urls] }
    const sceneUrls: string[] = Array.isArray(output?.videos)
      ? output.videos.filter((u: any) => typeof u === 'string')
      : Array.isArray(output)
        ? output.filter((u: any) => typeof u === 'string')
        : Array.isArray(output?.files)
          ? output.files.filter((u: any) => typeof u === 'string')
          : [];

    console.log('[detect-scenes-pyscenedetect] adaptive detected', sceneUrls.length, 'scenes');

    return new Response(JSON.stringify({
      ok: true,
      scene_urls: sceneUrls,
      scene_count: sceneUrls.length,
      adaptive_threshold,
      min_scene_len,
      detector: 'adaptive',
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
