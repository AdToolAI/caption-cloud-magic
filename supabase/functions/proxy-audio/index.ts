const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const audioUrl = url.searchParams.get('url');
    
    if (!audioUrl) {
      console.error('[proxy-audio] Missing url parameter');
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[proxy-audio] Proxying audio:', audioUrl);

    // Fetch the audio file
    const response = await fetch(audioUrl);
    
    if (!response.ok) {
      console.error('[proxy-audio] Upstream fetch failed:', response.status, response.statusText);
      return new Response(JSON.stringify({ error: 'Failed to fetch audio file' }), { 
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const audioData = await response.arrayBuffer();
    
    // Force correct Content-Type for audio playback
    // Jamendo often returns application/octet-stream which browsers can't play
    let contentType = 'audio/mpeg'; // Default for MP3
    
    if (audioUrl.includes('.wav')) {
      contentType = 'audio/wav';
    } else if (audioUrl.includes('.ogg')) {
      contentType = 'audio/ogg';
    } else if (audioUrl.includes('.m4a') || audioUrl.includes('.aac')) {
      contentType = 'audio/aac';
    }
    
    console.log('[proxy-audio] Original Content-Type:', response.headers.get('Content-Type'));
    console.log('[proxy-audio] Using Content-Type:', contentType);
    console.log('[proxy-audio] Successfully proxied audio, size:', audioData.byteLength, 'bytes');

    return new Response(audioData, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Length': audioData.byteLength.toString(),
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (error) {
    console.error('[proxy-audio] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
