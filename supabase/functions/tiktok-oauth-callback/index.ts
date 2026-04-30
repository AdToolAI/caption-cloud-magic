import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import { exchangeCodeForTokens, getUserInfo } from '../_shared/tiktok-api.ts';
import { upsertConnection, upsertProfile } from '../_shared/db-repo.ts';

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    const appBaseUrl = Deno.env.get('APP_BASE_URL') || 'https://useadtool.ai';
    const defaultRedirect = `${appBaseUrl}/performance?tab=connections`;

    // Check for user denial
    if (error === 'access_denied') {
      console.log('User denied TikTok authorization');
      return new Response(null, {
        status: 302,
        headers: { 'Location': `${defaultRedirect}&error=tiktok_oauth_denied` }
      });
    }

    if (!code || !state) {
      return new Response(null, {
        status: 302,
        headers: { 'Location': `${defaultRedirect}&error=tiktok_oauth_failed` }
      });
    }

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate state
    const { data: oauthState, error: stateError } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('csrf_token', state)
      .eq('provider', 'tiktok')
      .gte('expires_at', new Date().toISOString())
      .maybeSingle();

    if (stateError || !oauthState) {
      console.error('Invalid or expired OAuth state:', state);
      return new Response(null, {
        status: 302,
        headers: { 'Location': `${defaultRedirect}&error=tiktok_oauth_failed` }
      });
    }

    const userId = oauthState.user_id;
    const returnUrl = oauthState.redirect_url || defaultRedirect;

    // Delete used state
    await supabase.from('oauth_states').delete().eq('id', oauthState.id);

    console.log('TikTok OAuth callback - exchanging code for tokens:', { userId, returnUrl });

    // Exchange code for tokens
    const tokenData = await exchangeCodeForTokens(code);
    console.log('Token exchange successful:', {
      open_id: tokenData.open_id,
      scope: tokenData.scope,
      expires_in: tokenData.expires_in
    });

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Get user profile with fallback
    let userInfo;
    try {
      userInfo = await getUserInfo(tokenData.access_token);
      console.log('Fetched TikTok user info:', {
        display_name: userInfo.display_name,
        follower_count: userInfo.follower_count
      });
    } catch (error) {
      console.warn('User info API not available, using minimal data from token:', error);
      userInfo = {
        open_id: tokenData.open_id,
        username: tokenData.open_id,
        display_name: `TikTok User (${tokenData.open_id.substring(0, 8)}...)`,
        avatar_url: '',
        follower_count: 0,
        following_count: 0,
        video_count: 0
      };
    }

    // Store connection
    await upsertConnection(supabase, {
      user_id: userId,
      provider: 'tiktok',
      provider_open_id: tokenData.open_id,
      scope: tokenData.scope,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt
    });

    // Store profile
    await upsertProfile(supabase, {
      user_id: userId,
      provider: 'tiktok',
      username: userInfo.username,
      display_name: userInfo.display_name,
      avatar_url: userInfo.avatar_url,
      follower_count: userInfo.follower_count || 0,
      following_count: userInfo.following_count || 0,
      video_count: userInfo.video_count || 0
    });

    // Update connection with account name
    await supabase
      .from('social_connections')
      .update({ account_name: userInfo.display_name })
      .eq('user_id', userId)
      .eq('provider', 'tiktok');

    console.log('TikTok connection successful for user:', userId);

    // Build redirect URL with success params
    const redirectUrl = new URL(returnUrl);
    redirectUrl.searchParams.set('connected', 'tiktok');
    redirectUrl.searchParams.set('status', 'success');

    return new Response(null, {
      status: 302,
      headers: { 'Location': redirectUrl.toString() }
    });

  } catch (error: any) {
    console.error('TikTok OAuth callback error:', error);
    const appBaseUrl = Deno.env.get('APP_BASE_URL') || 'https://useadtool.ai';
    return new Response(null, {
      status: 302,
      headers: { 'Location': `${appBaseUrl}/performance?tab=connections&error=tiktok_oauth_failed` }
    });
  }
});
