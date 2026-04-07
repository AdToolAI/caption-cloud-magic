import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2.49.1/cors';
import { decryptToken } from '../_shared/crypto.ts';
import { refreshYouTubeToken } from '../_shared/token-refresh.ts';

const YT_API = 'https://www.googleapis.com/youtube/v3';

async function getYouTubeToken(supabase: any, userId: string): Promise<string> {
  const { data: connection, error } = await supabase
    .from('social_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'youtube')
    .maybeSingle();

  if (error || !connection) {
    throw new Error('YouTube not connected. Please connect YouTube first.');
  }

  // Check if token expired
  const expiresAt = new Date(connection.token_expires_at);
  if (expiresAt <= new Date()) {
    console.log('[youtube-live] Token expired, refreshing...');
    const result = await refreshYouTubeToken(connection, supabase);
    if (result.error || !result.accessToken) {
      throw new Error(result.error || 'Token refresh failed');
    }
    return result.accessToken;
  }

  return await decryptToken(connection.access_token_hash);
}

async function ytFetch(token: string, endpoint: string, options?: RequestInit) {
  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `${YT_API}${endpoint}${separator}access_token=${token}`;
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    console.error('[youtube-live] API error:', data);
    throw new Error(data.error?.message || `YouTube API error ${res.status}`);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action } = body;
    const token = await getYouTubeToken(supabase, user.id);
    let result: any;

    switch (action) {
      case 'get_broadcasts': {
        result = await ytFetch(token,
          `/liveBroadcasts?part=snippet,contentDetails,status&mine=true&maxResults=10`
        );
        break;
      }

      case 'create_broadcast': {
        const { title, description, scheduledStartTime, privacyStatus } = body;
        result = await ytFetch(token,
          `/liveBroadcasts?part=snippet,contentDetails,status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            snippet: {
              title,
              description: description || '',
              scheduledStartTime: scheduledStartTime || new Date().toISOString(),
            },
            contentDetails: {
              enableAutoStart: false,
              enableAutoStop: true,
              enableDvr: true,
              enableEmbed: true,
              latencyPreference: 'normal',
            },
            status: { privacyStatus: privacyStatus || 'unlisted' },
          }),
        });
        break;
      }

      case 'update_broadcast': {
        const { broadcastId, title: bTitle, description: bDesc } = body;
        // First get existing broadcast
        const existing = await ytFetch(token,
          `/liveBroadcasts?part=snippet&id=${broadcastId}`
        );
        const snippet = existing.items?.[0]?.snippet;
        if (!snippet) throw new Error('Broadcast not found');
        
        result = await ytFetch(token, `/liveBroadcasts?part=snippet`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: broadcastId,
            snippet: { ...snippet, title: bTitle ?? snippet.title, description: bDesc ?? snippet.description },
          }),
        });
        break;
      }

      case 'transition_broadcast': {
        const { broadcastId: tId, broadcastStatus } = body;
        result = await ytFetch(token,
          `/liveBroadcasts/transition?broadcastStatus=${broadcastStatus}&id=${tId}&part=status`, {
          method: 'POST',
        });
        break;
      }

      case 'get_streams': {
        result = await ytFetch(token,
          `/liveStreams?part=snippet,cdn,status&mine=true&maxResults=5`
        );
        break;
      }

      case 'create_stream': {
        const { streamTitle, resolution, frameRate } = body;
        result = await ytFetch(token, `/liveStreams?part=snippet,cdn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            snippet: { title: streamTitle || 'Stream Key' },
            cdn: {
              frameRate: frameRate || '30fps',
              ingestionType: 'rtmp',
              resolution: resolution || '1080p',
            },
          }),
        });
        break;
      }

      case 'bind_stream': {
        const { broadcastId: bindBId, streamId } = body;
        result = await ytFetch(token,
          `/liveBroadcasts/bind?id=${bindBId}&part=id,contentDetails&streamId=${streamId}`, {
          method: 'POST',
        });
        break;
      }

      case 'get_chat': {
        const { liveChatId, pageToken } = body;
        let url = `/liveChat/messages?part=snippet,authorDetails&liveChatId=${liveChatId}&maxResults=50`;
        if (pageToken) url += `&pageToken=${pageToken}`;
        result = await ytFetch(token, url);
        break;
      }

      case 'send_chat': {
        const { liveChatId: chatId, messageText } = body;
        result = await ytFetch(token, `/liveChat/messages?part=snippet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            snippet: {
              liveChatId: chatId,
              type: 'textMessageEvent',
              textMessageDetails: { messageText },
            },
          }),
        });
        break;
      }

      case 'get_video_stats': {
        const { videoId } = body;
        result = await ytFetch(token,
          `/videos?part=statistics,liveStreamingDetails&id=${videoId}`
        );
        break;
      }

      case 'check_connection': {
        result = { connected: true };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ ok: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[youtube-live] Error:', err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
