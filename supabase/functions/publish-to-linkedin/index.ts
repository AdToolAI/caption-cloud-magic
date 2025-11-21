const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PublishRequest {
  videoUrl: string;
  caption: string;
  visibility?: 'PUBLIC' | 'CONNECTIONS';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get('LINKEDIN_ACCESS_TOKEN');

    if (!accessToken) {
      throw new Error('LinkedIn credentials not configured');
    }

    const { videoUrl, caption, visibility = 'PUBLIC' }: PublishRequest = await req.json();

    console.log('Publishing to LinkedIn:', { videoUrl, caption, visibility });

    // Step 1: Get user profile (person URN)
    const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!profileResponse.ok) {
      throw new Error('Failed to get LinkedIn profile');
    }

    const profileData = await profileResponse.json();
    const personUrn = `urn:li:person:${profileData.sub}`;

    console.log('LinkedIn profile:', personUrn);

    // Step 2: Register upload
    const registerResponse = await fetch(
      'https://api.linkedin.com/v2/assets?action=registerUpload',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-video'],
            owner: personUrn,
            serviceRelationships: [
              {
                relationshipType: 'OWNER',
                identifier: 'urn:li:userGeneratedContent',
              },
            ],
          },
        }),
      }
    );

    if (!registerResponse.ok) {
      const error = await registerResponse.text();
      console.error('Failed to register upload:', error);
      throw new Error(`LinkedIn register error: ${error}`);
    }

    const registerData = await registerResponse.json();
    const uploadUrl = registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    const asset = registerData.value.asset;

    console.log('Upload registered:', { asset, uploadUrl });

    // Step 3: Upload video
    const videoResponse = await fetch(videoUrl);
    const videoBlob = await videoResponse.blob();

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      body: videoBlob,
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload video to LinkedIn');
    }

    console.log('Video uploaded successfully');

    // Step 4: Create post
    const postResponse = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: caption,
            },
            shareMediaCategory: 'VIDEO',
            media: [
              {
                status: 'READY',
                media: asset,
              },
            ],
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': visibility,
        },
      }),
    });

    if (!postResponse.ok) {
      const error = await postResponse.text();
      console.error('Failed to create post:', error);
      throw new Error(`LinkedIn post error: ${error}`);
    }

    const postData = await postResponse.json();

    console.log('Successfully published to LinkedIn:', postData);

    return new Response(
      JSON.stringify({
        success: true,
        postId: postData.id,
        message: 'Successfully published to LinkedIn'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('LinkedIn publish error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
