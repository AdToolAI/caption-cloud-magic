/**
 * post-first-comment
 *
 * Postet einen ersten Kommentar auf einen frisch veröffentlichten Post.
 * Unterstützt:
 *  - Instagram (Graph API /{ig-media-id}/comments)   → braucht instagram_manage_comments
 *  - LinkedIn  (/v2/socialActions/{urn}/comments)    → w_member_social reicht
 *
 * Kein neuer Plattform-Review nötig wenn die Publish-Scopes bereits granted sind.
 * Bricht sauber ab wenn ein Scope fehlt (surface 200 + { success:false, reason }).
 */
import { isQaMockRequest, qaMockJson } from '../_shared/qaMock.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

type Platform = 'instagram' | 'linkedin';

interface Body {
  platform: Platform;
  postId: string; // IG media id ODER LinkedIn URN
  comment: string;
}

async function commentInstagram(mediaId: string, message: string) {
  const token = Deno.env.get('IG_PAGE_ACCESS_TOKEN');
  if (!token) return { ok: false, reason: 'Instagram credentials not configured' };
  const res = await fetch(`https://graph.facebook.com/v18.0/${mediaId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: token }),
  });
  const body = await res.text();
  if (!res.ok) return { ok: false, reason: `IG comment failed [${res.status}]: ${body}` };
  return { ok: true, data: JSON.parse(body) };
}

async function commentLinkedIn(postUrn: string, message: string) {
  const token = Deno.env.get('LINKEDIN_ACCESS_TOKEN');
  if (!token) return { ok: false, reason: 'LinkedIn credentials not configured' };

  // Actor URN holen
  const profile = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!profile.ok) return { ok: false, reason: `LinkedIn profile fetch failed [${profile.status}]` };
  const { sub } = await profile.json();
  const actor = `urn:li:person:${sub}`;

  // URN muss encoded werden weil `:` sonst Path bricht
  const encodedUrn = encodeURIComponent(postUrn);
  const res = await fetch(`https://api.linkedin.com/v2/socialActions/${encodedUrn}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      actor,
      object: postUrn,
      message: { text: message },
    }),
  });
  const body = await res.text();
  if (!res.ok) return { ok: false, reason: `LinkedIn comment failed [${res.status}]: ${body}` };
  return { ok: true, data: JSON.parse(body) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { fn: 'post-first-comment' });

  try {
    const { platform, postId, comment }: Body = await req.json();
    if (!platform || !postId || !comment?.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: 'platform, postId, comment required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const trimmed = comment.trim().slice(0, 2200);

    let result;
    if (platform === 'instagram') result = await commentInstagram(postId, trimmed);
    else if (platform === 'linkedin') result = await commentLinkedIn(postId, trimmed);
    else result = { ok: false, reason: `Unsupported platform: ${platform}` };

    return new Response(
      JSON.stringify({ success: result.ok, ...(result.ok ? { data: result.data } : { reason: result.reason }) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('post-first-comment error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
