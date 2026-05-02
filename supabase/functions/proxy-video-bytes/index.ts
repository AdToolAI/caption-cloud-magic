// Streams a remote video through this edge function with permissive CORS so
// that the browser can decode it into a tainted-free <video>/<canvas> for
// client-side scene detection. Only used when the original host (e.g. the
// Lambda S3 bucket) does not send Access-Control-Allow-Origin.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Expose-Headers': 'content-length, content-type, accept-ranges, content-range',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
};

const ALLOWED_HOSTS = [
  's3.eu-central-1.amazonaws.com',
  's3.amazonaws.com',
  'remotionlambda-eucentral1-13gm4o6s90.s3.eu-central-1.amazonaws.com',
  'replicate.delivery',
  'replicate.com',
];

function isAllowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return ALLOWED_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const target = url.searchParams.get('url');

  if (!target || !isAllowedUrl(target)) {
    return new Response(JSON.stringify({ error: 'invalid_or_disallowed_url' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Forward Range header so the browser can do random seeks.
    const fwdHeaders: Record<string, string> = {};
    const range = req.headers.get('range');
    if (range) fwdHeaders['Range'] = range;

    const upstream = await fetch(target, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: fwdHeaders,
    });

    const headers = new Headers(corsHeaders);
    const passthrough = ['content-type', 'content-length', 'accept-ranges', 'content-range', 'last-modified', 'etag'];
    for (const h of passthrough) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    if (!headers.has('content-type')) headers.set('content-type', 'video/mp4');
    headers.set('cache-control', 'public, max-age=300');

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'upstream_fetch_failed', detail: e instanceof Error ? e.message : String(e) }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
