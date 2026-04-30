import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.75.0';
import { encryptToken } from '../_shared/crypto.ts';
import {
  discoverMetaPagesWithDiagnostics,
  type DiscoveryDiagnostics,
} from '../_shared/meta-page-discovery.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let provider = url.searchParams.get('provider');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    
    // Parse state first to extract provider if not in URL
    let stateData;
    if (state) {
      try {
        stateData = JSON.parse(atob(state));
        // Extract provider from state if not in URL (Facebook sends it in state)
        if (!provider && stateData.provider) {
          provider = stateData.provider;
          console.log('Provider extracted from state:', provider);
        }
        
        // Log incoming OAuth callback for debugging
        console.log('OAuth callback received:', {
          provider: provider,
          hasCode: !!code,
          hasState: !!state,
          referer: req.headers.get('referer'),
          origin: req.headers.get('origin')
        });
      } catch (e) {
        console.warn('Could not parse state for provider extraction');
      }
    }
    
    // Handle Facebook's post-confirmation callback (no code/provider)
    if (!code && !provider) {
      const appUrl = Deno.env.get('APP_URL') || 'https://useadtool.ai';
      console.log('OAuth callback without code/provider - likely Facebook confirmation dialog');
      return Response.redirect(`${appUrl}/performance`, 302);
    }

    if (!provider) {
      console.warn('Provider missing in OAuth callback', { code: !!code, state: !!state });
      const appUrl = Deno.env.get('APP_URL') || 'https://useadtool.ai';
      return Response.redirect(`${appUrl}/performance`, 302);
    }

    if (!code) {
      console.warn('Authorization code missing', { provider });
      const appUrl = Deno.env.get('APP_URL') || 'https://useadtool.ai';
      return Response.redirect(`${appUrl}/performance`, 302);
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate state parameter (already parsed above)
    if (!stateData) {
      throw new Error('Invalid state parameter');
    }

    const { user_id: userId, csrf, timestamp } = stateData;

    if (!userId || !csrf || !timestamp) {
      throw new Error('Invalid state format');
    }

    // Check state timestamp (max 5 minutes old)
    const stateAge = Date.now() - timestamp;
    if (stateAge > 300000) {
      throw new Error('OAuth state expired');
    }

    // Verify CSRF token against stored state
    const { data: storedState, error: stateError } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('user_id', userId)
      .eq('csrf_token', csrf)
      .eq('provider', provider)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (stateError || !storedState) {
      console.error('CSRF validation failed:', stateError);
      throw new Error('Invalid or expired OAuth state');
    }

    // Delete used state to prevent replay attacks
    await supabase
      .from('oauth_states')
      .delete()
      .eq('id', storedState.id);

    let tokenData;
    let accountInfo;
    // Tracks whether we successfully auto-resolved a single IG-capable Page
    // during the Instagram OAuth flow. When true, we redirect with
    // auto_selected=true so the UI skips the Page Select Dialog.
    let igAutoSelected = false;

    switch (provider) {
      case 'instagram':
        tokenData = await exchangeMetaToken(code);
        // Upgrade to long-lived token (60 days) BEFORE storing so the user
        // has time to pick a page without the short-lived token expiring.
        try {
          const longLived = await exchangeForLongLivedToken(tokenData.access_token);
          tokenData.access_token = longLived.access_token;
          tokenData.expires_at = longLived.expires_at;
        } catch (e) {
          console.warn('[oauth-callback] Long-lived token exchange failed, keeping short-lived:', e);
        }
        // Try to auto-resolve when the user manages exactly one Facebook Page
        // with a linked Instagram Business account. This makes the UX
        // identical to the Facebook flow (no extra Page Select Dialog).
        let igDiagnostics: DiscoveryDiagnostics | null = null;
        try {
          const autoResolved = await tryAutoResolveInstagram(tokenData.access_token);
          if (autoResolved) {
            accountInfo = autoResolved.account;
            igDiagnostics = autoResolved.diagnostics;
            igAutoSelected = true;
            console.log('[oauth-callback] IG auto-selected single page:', autoResolved.account.id);
          } else {
            // Multiple/zero IG-capable pages → fall back to staged Page Select flow.
            accountInfo = await getMetaUserInfoForPending(tokenData.access_token, 'instagram');
          }
        } catch (autoErr) {
          console.warn('[oauth-callback] IG auto-resolve failed, falling back to pending:', autoErr);
          accountInfo = await getMetaUserInfoForPending(tokenData.access_token, 'instagram');
        }
        // If auto-resolve didn't run diagnostics (because it threw before
        // discovery), or returned without picking a page, run discovery once
        // more purely for diagnostics so we can persist them on the connection.
        if (!igDiagnostics) {
          try {
            const probe = await discoverMetaPagesWithDiagnostics(tokenData.access_token, {
              verifyInstagram: true,
            });
            igDiagnostics = probe.diagnostics;
          } catch (e) {
            console.warn('[oauth-callback] diagnostics-only discovery failed:', e);
          }
        }
        if (igDiagnostics) {
          (accountInfo as any).meta_page_discovery_status = igAutoSelected
            ? 'single_instagram_page'
            : (igDiagnostics.pages_found_count === 0
                ? 'meta_pages_hidden_or_unavailable'
                : (igDiagnostics.verified_instagram_count === 0
                    ? (igDiagnostics.page_verify_failures.length >= igDiagnostics.pages_found_count
                        && igDiagnostics.page_verify_failures.every((f) => f.error !== 'no_instagram_link_on_page')
                        ? 'pages_found_but_verification_failed'
                        : 'pages_found_but_no_instagram_link')
                    : 'multiple_instagram_pages'));
          (accountInfo as any).meta_pages_found_count = igDiagnostics.pages_found_count;
          (accountInfo as any).meta_verified_instagram_count = igDiagnostics.verified_instagram_count;
          (accountInfo as any).meta_page_verify_failures = igDiagnostics.page_verify_failures;
          (accountInfo as any).meta_pages_with_token_count = igDiagnostics.pages_with_token_count;
          (accountInfo as any).meta_pages_with_inline_ig_count = igDiagnostics.pages_with_inline_ig_count;
          (accountInfo as any).meta_list_error = igDiagnostics.list_error;
          (accountInfo as any).meta_last_discovery_at = igDiagnostics.ran_at;
        }
        // Always attach permission diagnostics so the UI can decide whether
        // to force a re-consent on the next attempt.
        try {
          const perms = await fetchMetaPermissions(tokenData.access_token);
          (accountInfo as any).granted_scopes = perms.granted;
          (accountInfo as any).declined_scopes = perms.declined;
          const required = ['pages_show_list', 'instagram_basic'];
          (accountInfo as any).missing_page_scopes = required.filter((s) => !perms.granted.includes(s));
        } catch (e) {
          console.warn('[oauth-callback] permission probe failed:', e);
        }
        break;
      case 'facebook':
        tokenData = await exchangeMetaToken(code);
        accountInfo = await getMetaAccountInfo(tokenData.access_token, provider);
        break;
      case 'tiktok':
        tokenData = await exchangeTikTokToken(code);
        accountInfo = await getTikTokAccountInfo(tokenData.access_token);
        break;
      case 'linkedin':
        tokenData = await exchangeLinkedInToken(code);
        accountInfo = await getLinkedInAccountInfo(tokenData.access_token);
        break;
      case 'x':
        tokenData = await exchangeXToken(code);
        accountInfo = await getXAccountInfo(tokenData.access_token);
        break;
      case 'youtube':
        tokenData = await exchangeYouTubeToken(code);
        accountInfo = await getYouTubeAccountInfo(tokenData.access_token);
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    // Encrypt tokens with AES-GCM for secure storage
    const accessTokenHash = tokenData.access_token 
      ? await encryptToken(tokenData.access_token)
      : null;
    const refreshTokenHash = tokenData.refresh_token 
      ? await encryptToken(tokenData.refresh_token)
      : null;

    // For Facebook: store User Access Token (page selection happens in UI)
    const finalAccessTokenHash = accessTokenHash;
    
    // Store connection with audit trail and account metadata
    const { error: upsertError } = await supabase
      .from('social_connections')
      .upsert({
        user_id: userId,
        provider,
        account_id: accountInfo.id,
        account_name: accountInfo.name,
        access_token_hash: finalAccessTokenHash,
        refresh_token_hash: refreshTokenHash,
        token_expires_at: tokenData.expires_at,
        auto_sync_enabled: true,
        last_sync_at: null,
        account_metadata: {
          ...(accountInfo as any).account_type ? { account_type: (accountInfo as any).account_type } : {},
          ...(accountInfo as any).selection_required ? { selection_required: true } : {},
          ...(accountInfo as any).profile_picture_url ? { profile_picture_url: (accountInfo as any).profile_picture_url } : {},
          ...(accountInfo as any).followers_count !== undefined ? { followers_count: (accountInfo as any).followers_count } : {},
          ...(accountInfo as any).media_count !== undefined ? { media_count: (accountInfo as any).media_count } : {},
          ...(accountInfo as any).page_id ? { page_id: (accountInfo as any).page_id } : {},
          ...(accountInfo as any).page_access_token_encrypted ? { page_access_token_encrypted: (accountInfo as any).page_access_token_encrypted } : {},
          ...(accountInfo as any).granted_scopes ? { granted_scopes: (accountInfo as any).granted_scopes } : {},
          ...(accountInfo as any).declined_scopes ? { declined_scopes: (accountInfo as any).declined_scopes } : {},
          ...(accountInfo as any).missing_page_scopes ? { missing_page_scopes: (accountInfo as any).missing_page_scopes } : {},
          ...(accountInfo as any).meta_page_discovery_status ? { meta_page_discovery_status: (accountInfo as any).meta_page_discovery_status } : {},
          ...(accountInfo as any).meta_pages_found_count !== undefined ? { meta_pages_found_count: (accountInfo as any).meta_pages_found_count } : {},
          ...(accountInfo as any).meta_verified_instagram_count !== undefined ? { meta_verified_instagram_count: (accountInfo as any).meta_verified_instagram_count } : {},
          ...(accountInfo as any).meta_page_verify_failures ? { meta_page_verify_failures: (accountInfo as any).meta_page_verify_failures } : {},
          ...(accountInfo as any).meta_pages_with_token_count !== undefined ? { meta_pages_with_token_count: (accountInfo as any).meta_pages_with_token_count } : {},
          ...(accountInfo as any).meta_pages_with_inline_ig_count !== undefined ? { meta_pages_with_inline_ig_count: (accountInfo as any).meta_pages_with_inline_ig_count } : {},
          ...(accountInfo as any).meta_list_error ? { meta_list_error: (accountInfo as any).meta_list_error } : {},
          ...(accountInfo as any).meta_last_discovery_at ? { meta_last_discovery_at: (accountInfo as any).meta_last_discovery_at } : {},
          ...(provider === 'instagram' ? { connected_via: 'oauth_user_token' } : {}),
        }
      }, {
        onConflict: 'user_id,provider,account_id'
      });

    if (upsertError) {
      console.error('Error storing connection:', upsertError);
      console.error('Failed upsert details:', {
        user_id: userId,
        provider,
        account_id: accountInfo.id,
        account_name: accountInfo.name,
        error_code: upsertError.code,
        error_message: upsertError.message,
        error_details: upsertError.details
      });
      throw new Error('Failed to store social connection');
    }

    // Log security event
    await supabase
      .from('security_audit_log')
      .insert({
        user_id: userId,
        event_type: 'oauth_connected',
        ip_address: req.headers.get('x-forwarded-for'),
        user_agent: req.headers.get('user-agent'),
        details: {
          provider,
          account_id: accountInfo.id,
          account_name: accountInfo.name
        }
      });

    // Use dynamic redirect URL from stored state, fallback to APP_URL
    const redirectUrl = storedState.redirect_url || Deno.env.get('APP_URL') || 'https://useadtool.ai';
    const baseUrl = redirectUrl.replace(/\/integrations.*$/, '').replace(/\/performance.*$/, '');
    const autoFlag = igAutoSelected ? '&auto_selected=true' : '';
    return Response.redirect(`${baseUrl}/integrations?provider=${provider}&status=success&tab=connections${autoFlag}`, 302);

  } catch (error) {
    console.error('OAuth callback error:', error);
    const appUrl = Deno.env.get('APP_URL') || 'https://useadtool.ai';
    const errorMessage = error instanceof Error ? error.message : 'OAuth connection failed';
    return Response.redirect(
      `${appUrl}/integrations?status=error&tab=connections&message=${encodeURIComponent(errorMessage)}`,
      302
    );
  }
});

async function exchangeMetaToken(code: string) {
  const clientId = Deno.env.get('META_APP_ID');
  const clientSecret = Deno.env.get('META_APP_SECRET');
  const redirectUri = Deno.env.get('META_REDIRECT_URI');

  console.log('Exchanging Meta token...', {
    provider: 'Meta (Instagram/Facebook)',
    hasCode: !!code
  });

  const response = await fetch(
    `https://graph.facebook.com/v24.0/oauth/access_token?` +
    `client_id=${clientId}&` +
    `client_secret=${clientSecret}&` +
    `code=${code}&` +
    `redirect_uri=${redirectUri}`
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Facebook token exchange failed:', {
      status: response.status,
      statusText: response.statusText,
      body: errorBody
    });
    throw new Error(`Failed to exchange Meta token: ${errorBody}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: null,
    expires_at: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null
  };
}

async function getMetaAccountInfo(accessToken: string, provider: string) {
  if (provider === 'instagram') {
    // Step 1: Get Instagram User ID
    const userResponse = await fetch(
      'https://graph.instagram.com/me?fields=id,username',
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (!userResponse.ok) {
      throw new Error('Failed to fetch Instagram user info');
    }

    const userData = await userResponse.json();
    
    // Step 2: Try to get Business Account ID (if connected to Facebook Page)
    try {
      const accountResponse = await fetch(
        `https://graph.facebook.com/v18.0/${userData.id}/accounts?fields=instagram_business_account`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      
      if (accountResponse.ok) {
        const accountData = await accountResponse.json();
        const businessAccountId = accountData.data?.[0]?.instagram_business_account?.id;
        
        if (businessAccountId) {
          return {
            id: businessAccountId,
            name: userData.username,
            account_type: 'business'
          };
        }
      }
    } catch (e) {
      console.log('No business account found, using personal account');
    }
    
    // Fallback to personal account
    return {
      id: userData.id,
      name: userData.username,
      account_type: 'personal'
    };
  }
  
  // Facebook handling: Store User Access Token, defer page selection to UI
  // Get basic user info for the connection record
  const fbUserResponse = await fetch(
    'https://graph.facebook.com/v18.0/me?fields=id,name',
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  if (!fbUserResponse.ok) {
    const errorText = await fbUserResponse.text();
    console.error('Failed to fetch Facebook user info:', errorText);
    throw new Error('Failed to fetch Facebook user info');
  }

  const fbUserData = await fbUserResponse.json();
  
  console.log('Facebook User found:', {
    id: fbUserData.id,
    name: fbUserData.name,
  });
  
  return {
    id: fbUserData.id,
    name: fbUserData.name,
    account_type: 'facebook_user',
    selection_required: true,
  };
}

/**
 * Fetch Meta user info and return it as a "pending selection" account record.
 * Used by both Facebook and Instagram now — the actual page (and for IG, the
 * linked instagram_business_account) is chosen in the UI via the Page Select
 * Dialog, mirroring the Facebook flow exactly.
 */
async function getMetaUserInfoForPending(accessToken: string, provider: string) {
  const fbUserResponse = await fetch(
    `https://graph.facebook.com/v24.0/me?fields=id,name&access_token=${accessToken}`
  );

  if (!fbUserResponse.ok) {
    const errorText = await fbUserResponse.text();
    console.error(`Failed to fetch Meta user info for ${provider}:`, errorText);
    throw new Error('Failed to fetch Meta user info');
  }

  const fbUserData = await fbUserResponse.json();

  console.log(`Meta User found for ${provider} (pending selection):`, {
    id: fbUserData.id,
    name: fbUserData.name,
  });

  return {
    id: fbUserData.id,
    name: provider === 'instagram'
      ? `${fbUserData.name} (select Instagram account)`
      : fbUserData.name,
    account_type: provider === 'instagram' ? 'instagram_pending' : 'facebook_user',
    selection_required: true,
  };
}

/**
 * Auto-resolve the Instagram Business account when the user manages exactly
 * one Facebook Page that is linked to an Instagram Business account.
 *
 * Returns an accountInfo-shaped object ready to upsert into social_connections
 * (with all the page/IG metadata already filled in), or null when auto-select
 * is not appropriate (0 or 2+ IG-capable pages, or any API failure that
 * should fall back to the manual Page Select Dialog).
 *
 * Mirrors the logic in supabase/functions/facebook-select-page/index.ts.
 */
async function tryAutoResolveInstagram(
  userAccessToken: string,
): Promise<{ account: any; diagnostics: DiscoveryDiagnostics } | null> {
  // Use the SAME real per-page verification as facebook-list-pages.
  // Meta is unreliable about returning IG link fields inline in /me/accounts,
  // so we always verify each page individually via the page node.
  let pages;
  let diagnostics: DiscoveryDiagnostics;
  try {
    const result = await discoverMetaPagesWithDiagnostics(userAccessToken, {
      verifyInstagram: true,
    });
    pages = result.pages;
    diagnostics = result.diagnostics;
  } catch (e) {
    console.warn('[tryAutoResolveInstagram] discoverMetaPages failed:', e);
    return null;
  }

  const igPages = pages.filter((p) => p.has_instagram && p.instagram_business_account_id);
  console.log('[tryAutoResolveInstagram] diagnostics summary:', {
    pages_found: diagnostics.pages_found_count,
    verified_ig: diagnostics.verified_instagram_count,
    failures: diagnostics.page_verify_failures.length,
    list_error: diagnostics.list_error,
  });
  if (igPages.length !== 1) {
    console.log('[tryAutoResolveInstagram] verified IG-capable page count:', igPages.length);
    return null;
  }

  const page = igPages[0];
  const igUserId = page.instagram_business_account_id!;
  const pageAccessToken = page.access_token;

  // 2. Fetch IG profile (proves instagram_basic is consumed for App Review).
  const profileRes = await fetch(
    `https://graph.facebook.com/v24.0/${igUserId}?fields=id,username,profile_picture_url,media_count,followers_count&access_token=${pageAccessToken}`
  );
  if (!profileRes.ok) {
    const err = await profileRes.text();
    console.warn('[tryAutoResolveInstagram] IG profile fetch failed:', err);
    return null;
  }
  const profile = await profileRes.json();

  // 3. Encrypt the page access token (used by publish/sync functions).
  const encryptedPageToken = await encryptToken(pageAccessToken);

  return {
    account: {
      id: igUserId,
      name: profile.username ? `@${profile.username}` : igUserId,
      account_type: 'BUSINESS',
      profile_picture_url: profile.profile_picture_url || null,
      followers_count: profile.followers_count ?? null,
      media_count: profile.media_count ?? null,
      page_id: page.id,
      page_access_token_encrypted: encryptedPageToken,
      // Explicitly NOT setting selection_required so the metadata block in the
      // upsert does not flag this connection as pending.
    },
    diagnostics,
  };
}

/**
 * Fetch granted/declined Meta permissions for the current user token.
 * Used to surface page-scope rejections to the UI so it can force a
 * re-consent dialog on the next connect attempt.
 */
async function fetchMetaPermissions(
  userAccessToken: string,
): Promise<{ granted: string[]; declined: string[] }> {
  const res = await fetch(
    `https://graph.facebook.com/v24.0/me/permissions?access_token=${userAccessToken}`
  );
  if (!res.ok) {
    return { granted: [], declined: [] };
  }
  const json = await res.json();
  const granted: string[] = [];
  const declined: string[] = [];
  for (const p of json?.data ?? []) {
    if (p.status === 'granted') granted.push(p.permission);
    else declined.push(p.permission);
  }
  return { granted, declined };
}

async function exchangeTikTokToken(code: string) {
  const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY');
  const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET');
  const redirectUri = Deno.env.get('TIKTOK_REDIRECT_URI');

  console.log('Exchanging TikTok token...', {
    hasCode: !!code
  });

  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey!,
      client_secret: clientSecret!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri!
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('TikTok token exchange failed:', {
      status: response.status,
      statusText: response.statusText,
      body: errorBody
    });
    throw new Error(`Failed to exchange TikTok token: ${errorBody}`);
  }

  const data = await response.json();
  console.log('TikTok token exchange success');

  return {
    access_token: data.data.access_token,
    refresh_token: data.data.refresh_token,
    expires_at: new Date(Date.now() + data.data.expires_in * 1000).toISOString()
  };
}

async function getTikTokAccountInfo(accessToken: string) {
  const response = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count,following_count,video_count', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('TikTok user info fetch failed:', errorBody);
    throw new Error(`Failed to fetch TikTok account info: ${errorBody}`);
  }

  const data = await response.json();
  console.log('TikTok user info success:', {
    open_id: data.data?.user?.open_id,
    display_name: data.data?.user?.display_name
  });

  return {
    id: data.data.user.open_id,
    name: data.data.user.display_name,
    avatar_url: data.data.user.avatar_url,
    follower_count: data.data.user.follower_count,
    following_count: data.data.user.following_count,
    video_count: data.data.user.video_count
  };
}

async function exchangeLinkedInToken(code: string) {
  const clientId = Deno.env.get('LINKEDIN_CLIENT_ID');
  const clientSecret = Deno.env.get('LINKEDIN_CLIENT_SECRET');
  const redirectUri = Deno.env.get('LINKEDIN_REDIRECT_URI');

  const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: redirectUri!
    })
  });

  if (!response.ok) {
    throw new Error('Failed to exchange LinkedIn token');
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString()
  };
}

async function getLinkedInAccountInfo(accessToken: string) {
  const response = await fetch('https://api.linkedin.com/v2/me', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch LinkedIn account info');
  }

  const data = await response.json();
  return {
    id: data.id,
    name: `${data.localizedFirstName} ${data.localizedLastName}`
  };
}

async function exchangeXToken(code: string) {
  const clientId = Deno.env.get('X_CLIENT_ID');
  const clientSecret = Deno.env.get('X_CLIENT_SECRET');
  const redirectUri = Deno.env.get('X_REDIRECT_URI');

  const response = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri!,
      code_verifier: 'challenge'
    })
  });

  if (!response.ok) {
    throw new Error('Failed to exchange X token');
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString()
  };
}

async function getXAccountInfo(accessToken: string) {
  const response = await fetch('https://api.twitter.com/2/users/me', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch X account info');
  }

  const data = await response.json();
  return {
    id: data.data.id,
    name: data.data.username
  };
}

async function exchangeYouTubeToken(code: string) {
  // YouTube uses Google OAuth, so we use GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const redirectUri = `${supabaseUrl}/functions/v1/oauth-callback?provider=youtube`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('YouTube token exchange failed:', errorText);
    throw new Error('Failed to exchange YouTube token');
  }

  const data = await response.json();
  
  console.log('[YouTube] Token response:', {
    has_access_token: !!data.access_token,
    has_refresh_token: !!data.refresh_token,
    expires_in: data.expires_in,
    scope: data.scope
  });
  
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
  };
}

async function getYouTubeAccountInfo(accessToken: string) {
  const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch YouTube account info');
  }

  const data = await response.json();
  return {
    id: data.items[0].id,
    name: data.items[0].snippet.title
  };
}

/**
 * Exchange a short-lived Meta user access token for a long-lived (~60 days) one.
 * Required for Instagram Business publishing reliability.
 */
async function exchangeForLongLivedToken(shortLivedToken: string) {
  const clientId = Deno.env.get('META_APP_ID');
  const clientSecret = Deno.env.get('META_APP_SECRET');

  const url = `https://graph.facebook.com/v24.0/oauth/access_token?` +
    `grant_type=fb_exchange_token&` +
    `client_id=${clientId}&` +
    `client_secret=${clientSecret}&` +
    `fb_exchange_token=${shortLivedToken}`;

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Long-lived token exchange failed: ${body}`);
  }
  const data = await response.json();
  return {
    access_token: data.access_token,
    expires_at: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null,
  };
}

/**
 * Discover the user's Instagram Business account via their Facebook Pages.
 * Returns IG profile info (id, username, profile picture, followers) needed
 * to satisfy Meta's `instagram_basic` review (data must be visibly consumed).
 */
async function getInstagramBusinessAccountInfo(accessToken: string) {
  // 1. List the user's Facebook Pages
  const pagesRes = await fetch(
    `https://graph.facebook.com/v24.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${accessToken}`
  );

  if (!pagesRes.ok) {
    const body = await pagesRes.text();
    console.error('[oauth-callback] Failed to fetch FB pages for IG:', body);
    throw new Error(`Failed to fetch Facebook Pages: ${body}`);
  }

  const pagesData = await pagesRes.json();
  const pages = pagesData.data || [];

  // 2. Find the first Page that has an Instagram Business account linked
  const pageWithIg = pages.find((p: any) => p.instagram_business_account?.id);
  if (!pageWithIg) {
    throw new Error(
      'No Instagram Business account found on your Facebook Pages. Please connect an Instagram Business or Creator account to a Facebook Page first.'
    );
  }

  const igUserId = pageWithIg.instagram_business_account.id;
  const pageAccessToken = pageWithIg.access_token;

  // 3. Fetch the IG Business profile data — proves instagram_basic is consumed.
  // NOTE: `account_type` is no longer a valid field on /{ig-business-id} in
  // Graph API v24. Including it crashes the whole request with (#100).
  // All accounts reachable via /me/accounts are by definition BUSINESS/CREATOR.
  const profileRes = await fetch(
    `https://graph.facebook.com/v24.0/${igUserId}?fields=id,username,profile_picture_url,media_count,followers_count&access_token=${pageAccessToken}`
  );

  if (!profileRes.ok) {
    const body = await profileRes.text();
    console.error('[oauth-callback] IG profile fetch failed:', body);
    throw new Error(`Failed to fetch Instagram profile: ${body}`);
  }

  const profile = await profileRes.json();
  console.log('[oauth-callback] IG Business profile loaded:', {
    id: profile.id,
    username: profile.username,
    followers: profile.followers_count,
  });

  // Encrypt the page access token (used later by instagram-publish edge function)
  const pageTokenEncrypted = await encryptToken(pageAccessToken);

  return {
    id: igUserId,
    name: profile.username ? `@${profile.username}` : igUserId,
    // Hardcoded: only Business/Creator accounts are reachable via /me/accounts.
    account_type: 'BUSINESS',
    profile_picture_url: profile.profile_picture_url || null,
    followers_count: profile.followers_count ?? null,
    media_count: profile.media_count ?? null,
    page_id: pageWithIg.id,
    page_access_token_encrypted: pageTokenEncrypted,
  };
}
