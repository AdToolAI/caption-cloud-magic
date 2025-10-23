import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptToken } from '../_shared/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { text, media } = await req.json();

    if (!text) {
      throw new Error('Text content is required');
    }

    // Get LinkedIn connection
    const { data: connection, error: connError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'linkedin')
      .eq('is_active', true)
      .single();

    if (connError || !connection) {
      throw new Error('LinkedIn account not connected');
    }

    // Check if token is expired
    if (new Date(connection.token_expires_at) < new Date()) {
      throw new Error('LinkedIn token expired. Please reconnect your account.');
    }

    // Decrypt access token
    const accessToken = await decryptToken(connection.access_token_hash);
    const memberId = connection.account_id;

    let postData: any;

    // Create post with or without media
    if (media && media.length > 0) {
      // Upload images to LinkedIn
      const mediaAssets = [];
      
      for (const item of media) {
        if (item.type === 'image') {
          // Register asset
          const registerResponse = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'LinkedIn-Version': '202405',
            },
            body: JSON.stringify({
              registerUploadRequest: {
                recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
                owner: `urn:li:person:${memberId}`,
                serviceRelationships: [{
                  relationshipType: 'OWNER',
                  identifier: 'urn:li:userGeneratedContent'
                }]
              }
            })
          });

          if (!registerResponse.ok) {
            const errorData = await registerResponse.json();
            throw new Error(`Failed to register asset: ${JSON.stringify(errorData)}`);
          }

          const registerData = await registerResponse.json();
          const uploadUrl = registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
          const assetUrn = registerData.value.asset;

          // Download image
          const imageResponse = await fetch(item.pathOrUrl);
          const imageBlob = await imageResponse.blob();

          // Upload to LinkedIn
          const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
            body: imageBlob,
          });

          if (!uploadResponse.ok) {
            throw new Error('Failed to upload image');
          }

          mediaAssets.push({
            status: 'READY',
            media: assetUrn,
            title: { text: 'Image' },
          });
        }
      }

      // Create post with media
      postData = {
        author: `urn:li:person:${memberId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'IMAGE',
            media: mediaAssets,
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      };
    } else {
      // Create text-only post
      postData = {
        author: `urn:li:person:${memberId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'NONE',
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      };
    }

    // Publish post
    const publishResponse = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': '202405',
      },
      body: JSON.stringify(postData),
    });

    if (!publishResponse.ok) {
      const errorData = await publishResponse.json();
      throw new Error(`Failed to publish post: ${JSON.stringify(errorData)}`);
    }

    const publishData = await publishResponse.json();
    const postUrn = publishData.id;

    console.log(`✅ LinkedIn post published: ${postUrn}`);

    return new Response(
      JSON.stringify({
        ok: true,
        post_urn: postUrn,
        permalink: `https://www.linkedin.com/feed/update/${postUrn}`,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ LinkedIn post error:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: 'LINKEDIN_POST_FAILED',
          message: error.message,
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
