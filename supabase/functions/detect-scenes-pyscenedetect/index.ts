// Dual-detector shot-boundary detection (Artlist/CapCut-style).
//
// Runs PySceneDetect TWICE in parallel against the same video:
//   1) Adaptive detector  (catches soft transitions, fast camera motion)
//   2) Content-like run   (catches hard cuts; we approximate ContentDetector
//      via a very low adaptive_threshold + luma_only on the same model)
//
// Each run returns split scene clips. We probe the durations server-side via
// HTTP HEAD/Range probing? — no, durations come from the client. So we just
// return BOTH lists of clip URLs and let the client compute + fuse boundaries.
//
// magpai-app/cog-scenedetect on Replicate. min_scene_len in FRAMES.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL_VERSION = 'a27d706ef8788f49cd40ae1d2266b7355de21d48b9446789b35eebdd3817490d';

async function runDetector(
  REPLICATE_API_KEY: string,
  video_url: string,
  adaptive_threshold: number,
  min_scene_len: number,
  luma_only: boolean,
): Promise<{ ok: boolean; scene_urls: string[]; error?: string }> {
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
    return { ok: false, scene_urls: [], error: `create_failed:${createRes.status}:${t.slice(0, 200)}` };
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
    return { ok: false, scene_urls: [], error: `prediction_${prediction.status}` };
  }

  const output = prediction.output;
  const sceneUrls: string[] = Array.isArray(output?.videos)
    ? output.videos.filter((u: any) => typeof u === 'string')
    : Array.isArray(output)
      ? output.filter((u: any) => typeof u === 'string')
      : Array.isArray(output?.files)
        ? output.files.filter((u: any) => typeof u === 'string')
        : [];

  return { ok: true, scene_urls: sceneUrls };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const video_url: string = body.video_url;

    if (!video_url || typeof video_url !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'video_url_required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: 'replicate_not_configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Artlist-/CapCut-style: dual sensitive run.
    //  - Adaptive (HSV rolling avg) at threshold 1.5, min_scene_len 8 frames (~0.27s)
    //  - "Content-like" approximation: very low adaptive_threshold + luma_only
    //    -> behaves close to ContentDetector for hard cuts
    console.log('[detect-scenes-pyscenedetect] dual run for', video_url);

    const [adaptiveRun, contentRun] = await Promise.all([
      runDetector(REPLICATE_API_KEY, video_url, 1.5, 8, false),
      runDetector(REPLICATE_API_KEY, video_url, 1.0, 8, true),
    ]);

    console.log('[detect-scenes-pyscenedetect] adaptive:', adaptiveRun.scene_urls.length, 'clips, error:', adaptiveRun.error);
    console.log('[detect-scenes-pyscenedetect] content :', contentRun.scene_urls.length, 'clips, error:', contentRun.error);

    // Pick the run with MORE scene clips as the primary (more sensitive wins).
    const primary = (contentRun.scene_urls.length > adaptiveRun.scene_urls.length) ? contentRun : adaptiveRun;
    const secondary = primary === contentRun ? adaptiveRun : contentRun;

    if (!primary.ok && !secondary.ok) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'pyscenedetect_failed',
        detail: `${primary.error || ''} | ${secondary.error || ''}`.slice(0, 300),
      }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      ok: true,
      scene_urls: primary.scene_urls,                  // backward compat
      scene_count: primary.scene_urls.length,
      runs: {
        adaptive: { ok: adaptiveRun.ok, scene_urls: adaptiveRun.scene_urls, count: adaptiveRun.scene_urls.length },
        content:  { ok: contentRun.ok,  scene_urls: contentRun.scene_urls,  count: contentRun.scene_urls.length },
      },
      detector: 'dual',
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
