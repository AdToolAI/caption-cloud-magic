import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.75.0';
import { encryptToken } from '../_shared/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, code, user_id, redirect_uri } = await req.json();

    // ── ACTION: get_auth_url ──
    if (action === 'get_auth_url') {
      const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
      if (!clientId) {
        return new Response(JSON.stringify({ error: 'GOOGLE_CLIENT_ID not configured' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const state = btoa(JSON.stringify({ user_id, provider: 'google_drive' }));
      const scopes = [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ].join(' ');

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&state=${encodeURIComponent(state)}`;

      return new Response(JSON.stringify({ auth_url: authUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── ACTION: exchange_code ──
    if (action === 'exchange_code') {
      const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
      const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

      // Exchange code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        console.error('Token exchange failed:', tokenData);
        return new Response(JSON.stringify({ error: tokenData.error_description || tokenData.error }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get user info
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userInfo = await userInfoRes.json();

      // Get Drive storage quota
      const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const aboutData = await aboutRes.json();

      // Create app folder in Drive
      const folderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'AdTool Media',
          mimeType: 'application/vnd.google-apps.folder',
        }),
      });
      const folderData = await folderRes.json();

      // Encrypt tokens
      const encryptedAccess = await encryptToken(tokenData.access_token);
      const encryptedRefresh = tokenData.refresh_token 
        ? await encryptToken(tokenData.refresh_token) 
        : null;

      const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();

      // Upsert connection
      const { data: connection, error } = await supabase
        .from('cloud_storage_connections')
        .upsert({
          user_id,
          provider: 'google_drive',
          access_token_encrypted: encryptedAccess,
          refresh_token_encrypted: encryptedRefresh,
          token_expires_at: expiresAt,
          folder_id: folderData.id,
          folder_name: folderData.name || 'AdTool Media',
          is_active: true,
          account_email: userInfo.email,
          account_name: userInfo.name,
          quota_bytes: parseInt(aboutData.storageQuota?.limit || '0'),
          used_bytes: parseInt(aboutData.storageQuota?.usage || '0'),
        }, { onConflict: 'user_id,provider' })
        .select()
        .single();

      if (error) {
        console.error('Error saving connection:', error);
        throw error;
      }

      console.log(`✅ Google Drive connected for user ${user_id} (${userInfo.email})`);

      return new Response(JSON.stringify({
        success: true,
        connection: {
          id: connection.id,
          provider: 'google_drive',
          account_email: userInfo.email,
          account_name: userInfo.name,
          folder_name: folderData.name,
          quota_bytes: aboutData.storageQuota?.limit,
          used_bytes: aboutData.storageQuota?.usage,
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── ACTION: disconnect ──
    if (action === 'disconnect') {
      const { error } = await supabase
        .from('cloud_storage_connections')
        .delete()
        .eq('user_id', user_id)
        .eq('provider', 'google_drive');

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── ACTION: refresh_token ──
    if (action === 'refresh_token') {
      const { data: conn } = await supabase
        .from('cloud_storage_connections')
        .select('*')
        .eq('user_id', user_id)
        .eq('provider', 'google_drive')
        .single();

      if (!conn || !conn.refresh_token_encrypted) {
        return new Response(JSON.stringify({ error: 'No connection found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { decryptToken } = await import('../_shared/crypto.ts');
      const refreshToken = await decryptToken(conn.refresh_token_encrypted);

      const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
      const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        return new Response(JSON.stringify({ error: tokenData.error, reconnect_required: true }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const encryptedAccess = await encryptToken(tokenData.access_token);
      const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();

      await supabase
        .from('cloud_storage_connections')
        .update({
          access_token_encrypted: encryptedAccess,
          token_expires_at: expiresAt,
        })
        .eq('user_id', user_id)
        .eq('provider', 'google_drive');

      return new Response(JSON.stringify({ success: true, access_token: tokenData.access_token }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Cloud storage OAuth error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
