import { createClient } from 'npm:@supabase/supabase-js@2';
import { encryptToken } from '../_shared/crypto.ts';
import { verifyPageInstagramLink } from '../_shared/meta-page-discovery.ts';
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";
import { tl, withLang } from "../_shared/i18n.ts";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

Deno.serve((req: Request) => withLang(req, () => (async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (isQaMockRequest(req)) return qaMockJson(CORS, { name: "facebook-select-page" });


  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Verify user
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const {
      provider: rawProvider,
      page_id,
      page_name,
      page_category,
      page_picture_url,
      page_access_token,
    } = body;

    const provider: 'facebook' | 'instagram' =
      rawProvider === 'instagram' ? 'instagram' : 'facebook';

    if (!page_id || !page_name || !page_access_token) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Encrypt the page access token (used by publish/sync functions)
    const encryptedPageToken = await encryptToken(page_access_token);

    if (provider === 'facebook') {
      // Original Facebook flow: store the page directly on the facebook connection
      const { error: updateError } = await supabase
        .from('social_connections')
        .update({
          account_name: page_name,
          account_id: page_id,
          access_token_hash: encryptedPageToken,
          account_metadata: {
            account_type: 'page',
            selection_required: false,
            page_category: page_category,
            page_picture_url: page_picture_url,
          },
        })
        .eq('user_id', user.id)
        .eq('provider', 'facebook');

      if (updateError) {
        console.error('Failed to update FB connection:', updateError);
        return new Response(JSON.stringify({ error: 'Failed to save page selection' }), {
          status: 500,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // === Instagram finalization ===
    // Use the same per-page verification helper as the listing/auto-resolve
    // path so a page shown as valid in the dialog will also finalize cleanly.
    const verifyResult = await verifyPageInstagramLink(page_id, page_access_token);
    const igUserId = verifyResult.ig_id;

    if (!igUserId) {
      // Distinguish the failure mode so the UI can act on it.
      const code = verifyResult.error || 'unknown';
      let userMessage: string;
      if (code === 'no_instagram_link_on_page') {
        userMessage =
          tl({ de: 'Diese Facebook-Seite hat kein verknüpftes Instagram Business-Konto. Verknüpfe zuerst dein Instagram-Konto in den Facebook-Seiteneinstellungen.', en: 'This Facebook page has no linked Instagram Business account. First link your Instagram account in the Facebook page settings.', es: 'Esta página de Facebook no tiene una cuenta de Instagram Business vinculada. Primero vincula tu cuenta de Instagram en la configuración de la página de Facebook.' });
      } else if (code === 'missing_page_access_token') {
        userMessage =
          tl({ de: 'Für diese Seite wurde kein gültiges Page Access Token von Meta zurückgegeben. Bitte trenne die Verbindung und verbinde Instagram erneut.', en: 'No valid Page Access Token was returned by Meta for this page. Please disconnect and reconnect Instagram.', es: 'Meta no devolvió un Token de Acceso a la Página válido para esta página. Por favor, desconecta y vuelve a conectar Instagram.' });
      } else {
        userMessage =
          tl({ de: 'Meta konnte die Seite gerade nicht prüfen (Page-Node nicht lesbar). Bitte versuche es in einem Moment erneut oder verbinde Instagram neu.', en: 'Meta could not check the page right now (Page-Node not readable). Please try again in a moment or reconnect Instagram.', es: 'Meta no pudo verificar la página en este momento (Nodo de página no legible). Por favor, inténtalo de nuevo en un momento o vuelve a conectar Instagram.' });
      }
      return new Response(
        JSON.stringify({ error: userMessage, code }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch IG profile info (proves instagram_basic is consumed for App Review)
    const profileRes = await fetch(
      `https://graph.facebook.com/v24.0/${igUserId}?fields=id,username,profile_picture_url,media_count,followers_count&access_token=${page_access_token}`
    );

    if (!profileRes.ok) {
      const errBody = await profileRes.text();
      console.error('[facebook-select-page] IG profile fetch failed:', errBody);
      return new Response(
        JSON.stringify({
          error:
            tl({ de: 'Instagram-Profil konnte nicht geladen werden. Meta hat den Profil-Request abgelehnt.', en: 'Instagram profile could not be loaded. Meta rejected the profile request.', es: 'No se pudo cargar el perfil de Instagram. Meta rechazó la solicitud de perfil.' }),
          code: 'ig_profile_fetch_failed',
          details: errBody.slice(0, 300),
        }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    const profile = await profileRes.json();

    // Update the existing instagram connection (created during oauth-callback as pending)
    const { error: updateError } = await supabase
      .from('social_connections')
      .update({
        account_id: igUserId,
        account_name: profile.username ? `@${profile.username}` : igUserId,
        // Keep the user access token (for reauth/refresh flows). The page token
        // is stored separately in metadata for publishing.
        account_metadata: {
          account_type: 'BUSINESS',
          selection_required: false,
          connected_via: 'oauth_user_token',
          profile_picture_url: profile.profile_picture_url || null,
          followers_count: profile.followers_count ?? null,
          media_count: profile.media_count ?? null,
          page_id: page_id,
          page_name: page_name,
          page_category: page_category,
          page_picture_url: page_picture_url,
          page_access_token_encrypted: encryptedPageToken,
        },
      })
      .eq('user_id', user.id)
      .eq('provider', 'instagram');

    if (updateError) {
      console.error('Failed to update IG connection:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to save Instagram selection' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        instagram: {
          id: igUserId,
          username: profile.username,
          followers_count: profile.followers_count,
        },
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('facebook-select-page error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
})(req)));
