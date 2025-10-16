import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IG_GRAPH_API_BASE = 'https://graph.facebook.com/v24.0';

interface GraphError {
  code?: number;
  error_subcode?: number;
  message?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
}

async function graphPost(path: string, params: Record<string, string>) {
  const body = new URLSearchParams(params);
  const url = `${IG_GRAPH_API_BASE}${path}`;
  
  console.log('Graph POST:', url);
  
  const res = await fetch(url, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  const json = await res.json();
  
  if (!res.ok || json.error) {
    console.error('Graph API Error:', json);
    throw json.error || json;
  }
  
  return json;
}

async function graphGet(path: string, token: string) {
  const url = `${IG_GRAPH_API_BASE}${path}`;
  const fullUrl = url.includes('?') 
    ? `${url}&access_token=${encodeURIComponent(token)}`
    : `${url}?access_token=${encodeURIComponent(token)}`;
  
  console.log('Graph GET:', url);
  
  const res = await fetch(fullUrl, {
    method: 'GET',
  });

  const json = await res.json();
  
  if (!res.ok || json.error) {
    console.error('Graph API Error:', json);
    throw json.error || json;
  }
  
  return json;
}

async function createContainer(igUserId: string, imageUrl: string, caption: string, accessToken: string) {
  return graphPost(`/${igUserId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: accessToken,
  });
}

async function waitUntilFinished(creationId: string, accessToken: string, timeoutMs = 15000, intervalMs = 1500) {
  const started = Date.now();
  
  while (Date.now() - started < timeoutMs) {
    const data = await graphGet(`/${creationId}?fields=id,status_code,error_message`, accessToken);
    
    console.log('Container status:', data);
    
    if (data.status_code === 'FINISHED') {
      return data;
    }
    
    if (data.error_message) {
      throw new Error(data.error_message);
    }
    
    await new Promise(r => setTimeout(r, intervalMs));
  }
  
  throw new Error('Timeout while waiting for container to finish');
}

async function publishContainer(igUserId: string, creationId: string, accessToken: string) {
  return graphPost(`/${igUserId}/media_publish`, {
    creation_id: creationId,
    access_token: accessToken,
  });
}

async function getPostMeta(postId: string, accessToken: string) {
  return graphGet(`/${postId}?fields=id,permalink,media_url,caption,timestamp`, accessToken);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, caption, dryRun, igUserId } = await req.json();

    const pageAccessToken = Deno.env.get('IG_PAGE_ACCESS_TOKEN');
    
    if (!pageAccessToken) {
      return new Response(
        JSON.stringify({ error: 'IG_PAGE_ACCESS_TOKEN nicht konfiguriert' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!igUserId) {
      return new Response(
        JSON.stringify({ error: 'IG_USER_ID erforderlich' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'imageUrl erforderlich' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const finalCaption = caption || 'Posted via CaptionGenie 🚀';

    // Step 1: Create container
    console.log('Creating container for user:', igUserId);
    const container = await createContainer(igUserId, imageUrl, finalCaption, pageAccessToken);
    const creationId = container.id as string;
    console.log('Container created:', creationId);

    // Step 2: Wait until finished
    const status = await waitUntilFinished(creationId, pageAccessToken);
    console.log('Container finished:', status);

    if (dryRun) {
      return new Response(
        JSON.stringify({ 
          ok: true, 
          dryRun: true, 
          creationId, 
          status 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Publish
    console.log('Publishing container:', creationId);
    const published = await publishContainer(igUserId, creationId, pageAccessToken);
    const postId = published.id as string;
    console.log('Published:', postId);

    // Step 4: Get metadata
    const meta = await getPostMeta(postId, pageAccessToken);
    console.log('Post metadata:', meta);

    return new Response(
      JSON.stringify({
        ok: true,
        creationId,
        postId: meta.id,
        permalink: meta.permalink,
        mediaUrl: meta.media_url,
        caption: meta.caption,
        timestamp: meta.timestamp,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Instagram publish error:', error);
    
    const graphError = error as GraphError;
    const code = graphError.code ?? 'UNKNOWN';
    const subcode = graphError.error_subcode;
    const message = graphError.message || graphError.error_user_msg || 'Graph API Fehler';
    const fbtrace = graphError.fbtrace_id;

    let userMessage = message;
    
    // Spezifische Fehlermeldungen
    if (subcode === 2207003) {
      userMessage = 'Creation nicht gefunden. Bitte erneut versuchen. Stelle sicher, dass das Seiten-Token genutzt wird und die Scopes instagram_content_publish aktiv sind.';
    }

    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: userMessage,
        code, 
        subcode, 
        fbtrace 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
