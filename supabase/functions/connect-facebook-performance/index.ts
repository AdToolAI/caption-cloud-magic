import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    // Create Supabase client with Service Role Key for access to app_secrets
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    console.log(`Connecting Facebook for user ${user.id}`);

    // 1. Load FB_PAGE_ACCESS_TOKEN from app_secrets
    const { data: tokenData, error: tokenError } = await supabase
      .from('app_secrets')
      .select('encrypted_value')
      .eq('name', 'IG_PAGE_ACCESS_TOKEN')
      .maybeSingle();

    if (tokenError || !tokenData?.encrypted_value) {
      throw new Error('Facebook token not found in app_secrets. Please set it up in Instagram Publishing first.');
    }

    console.log('Facebook token found in app_secrets');

    // 2. Get FB_PAGE_ID from environment
    const FB_PAGE_ID = Deno.env.get('IG_PAGE_ID') || '17841477402452109';
    console.log(`Using Facebook Page ID: ${FB_PAGE_ID}`);

    // 3. Check if connection already exists
    const { data: existingConnection } = await supabase
      .from('social_connections')
      .select('id')
      .eq('user_id', user.id)
      .eq('provider', 'facebook')
      .maybeSingle();

    if (existingConnection) {
      // Update existing connection
      const { data: connection, error: updateError } = await supabase
        .from('social_connections')
        .update({
          account_id: FB_PAGE_ID,
          account_name: '@captiongenie_socialmanager',
          access_token_hash: btoa(tokenData.encrypted_value),
          token_expires_at: null,
          account_metadata: { account_type: 'page' },
          last_sync_at: null
        })
        .eq('id', existingConnection.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      console.log('Facebook connection updated successfully');

      return new Response(
        JSON.stringify({ success: true, connection }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Create new social_connections entry
    const { data: connection, error: insertError } = await supabase
      .from('social_connections')
      .insert({
        user_id: user.id,
        provider: 'facebook',
        account_id: FB_PAGE_ID,
        account_name: '@captiongenie_socialmanager',
        access_token_hash: btoa(tokenData.encrypted_value),
        token_expires_at: null,
        account_metadata: { account_type: 'page' }
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    console.log('Facebook connection created successfully');

    return new Response(
      JSON.stringify({ success: true, connection }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error connecting Facebook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
