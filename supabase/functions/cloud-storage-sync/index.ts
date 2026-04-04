import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { decryptToken } from '../_shared/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getValidAccessToken(supabase: any, userId: string): Promise<string> {
  const { data: conn } = await supabase
    .from('cloud_storage_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google_drive')
    .single();

  if (!conn) throw new Error('No Google Drive connection found');

  // Check if token is expired
  const expiresAt = new Date(conn.token_expires_at);
  if (expiresAt > new Date(Date.now() + 60000)) {
    // Token still valid
    return await decryptToken(conn.access_token_encrypted);
  }

  // Refresh token
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
  if (tokenData.error) throw new Error(`Token refresh failed: ${tokenData.error}`);

  // Save new access token
  const { encryptToken } = await import('../_shared/crypto.ts');
  const encryptedAccess = await encryptToken(tokenData.access_token);
  const newExpiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();

  await supabase
    .from('cloud_storage_connections')
    .update({
      access_token_encrypted: encryptedAccess,
      token_expires_at: newExpiresAt,
    })
    .eq('user_id', userId)
    .eq('provider', 'google_drive');

  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, user_id, file_url, file_name, mime_type, drive_file_id } = await req.json();

    const accessToken = await getValidAccessToken(supabase, user_id);

    // Get folder ID
    const { data: conn } = await supabase
      .from('cloud_storage_connections')
      .select('folder_id')
      .eq('user_id', user_id)
      .eq('provider', 'google_drive')
      .single();

    const folderId = conn?.folder_id;

    // ── ACTION: upload ──
    if (action === 'upload') {
      // Download file from URL
      const fileRes = await fetch(file_url);
      if (!fileRes.ok) throw new Error('Failed to download file from source');
      const fileBlob = await fileRes.blob();

      // Upload to Google Drive using multipart upload
      const metadata = {
        name: file_name || 'media_file',
        parents: folderId ? [folderId] : [],
        mimeType: mime_type || 'application/octet-stream',
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', fileBlob);

      const uploadRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,mimeType,webViewLink,thumbnailLink',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: form,
        }
      );

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Drive upload failed: ${errText}`);
      }

      const driveFile = await uploadRes.json();

      // Update storage usage
      const fileSize = parseInt(driveFile.size || '0');
      await supabase.rpc('increment_daily_metric', {
        p_user_id: user_id,
        p_date: new Date().toISOString().split('T')[0],
        p_metric: 'posts_created',
        p_amount: 0
      }).catch(() => {});

      // Update used_bytes on connection
      const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const aboutData = await aboutRes.json();
      
      await supabase
        .from('cloud_storage_connections')
        .update({ used_bytes: parseInt(aboutData.storageQuota?.usage || '0') })
        .eq('user_id', user_id)
        .eq('provider', 'google_drive');

      return new Response(JSON.stringify({
        success: true,
        file: {
          id: driveFile.id,
          name: driveFile.name,
          size: driveFile.size,
          mimeType: driveFile.mimeType,
          webViewLink: driveFile.webViewLink,
          thumbnailLink: driveFile.thumbnailLink,
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── ACTION: list ──
    if (action === 'list') {
      const query = folderId 
        ? `'${folderId}' in parents and trashed = false`
        : `trashed = false`;

      const listRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,mimeType,createdTime,thumbnailLink,webViewLink,webContentLink)&orderBy=createdTime desc&pageSize=100`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!listRes.ok) {
        const errText = await listRes.text();
        throw new Error(`Drive list failed: ${errText}`);
      }

      const listData = await listRes.json();

      return new Response(JSON.stringify({
        success: true,
        files: listData.files || []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── ACTION: delete ──
    if (action === 'delete') {
      if (!drive_file_id) throw new Error('drive_file_id required');

      const deleteRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${drive_file_id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!deleteRes.ok && deleteRes.status !== 204) {
        const errText = await deleteRes.text();
        throw new Error(`Drive delete failed: ${errText}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── ACTION: get_download_url ──
    if (action === 'get_download_url') {
      if (!drive_file_id) throw new Error('drive_file_id required');

      // Get file metadata with download URL
      const fileRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${drive_file_id}?fields=id,name,mimeType,webContentLink&alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      // Return a temporary signed download link
      return new Response(JSON.stringify({
        success: true,
        download_url: `https://www.googleapis.com/drive/v3/files/${drive_file_id}?alt=media`,
        access_token: accessToken, // Client needs this for authenticated download
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── ACTION: get_quota ──
    if (action === 'get_quota') {
      const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const aboutData = await aboutRes.json();

      await supabase
        .from('cloud_storage_connections')
        .update({
          quota_bytes: parseInt(aboutData.storageQuota?.limit || '0'),
          used_bytes: parseInt(aboutData.storageQuota?.usage || '0'),
        })
        .eq('user_id', user_id)
        .eq('provider', 'google_drive');

      return new Response(JSON.stringify({
        success: true,
        quota: aboutData.storageQuota,
        user: aboutData.user,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Cloud storage sync error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
