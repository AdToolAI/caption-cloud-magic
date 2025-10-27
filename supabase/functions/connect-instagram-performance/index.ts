import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encryptToken } from '../_shared/crypto.ts';

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

    console.log(`Connecting Instagram for user ${user.id}`);

    // 1. Load IG_PAGE_ACCESS_TOKEN from app_secrets
    const { data: tokenData, error: tokenError } = await supabase
      .from('app_secrets')
      .select('encrypted_value')
      .eq('name', 'IG_PAGE_ACCESS_TOKEN')
      .maybeSingle();

    if (tokenError || !tokenData?.encrypted_value) {
      throw new Error('Instagram token not found in app_secrets. Please set it up in Instagram Publishing first.');
    }

    console.log('Instagram token found in app_secrets');

    // 2. Get IG_USER_ID from environment
    const IG_USER_ID = Deno.env.get('IG_USER_ID') || '17841477402452109';
    console.log(`Using Instagram account ID: ${IG_USER_ID}`);

    // 3. Check if connection already exists
    const { data: existingConnection } = await supabase
      .from('social_connections')
      .select('id')
      .eq('user_id', user.id)
      .eq('provider', 'instagram')
      .maybeSingle();

    if (existingConnection) {
      // Update existing connection
      const { data: connection, error: updateError } = await supabase
        .from('social_connections')
        .update({
          account_id: IG_USER_ID,
          account_name: '@captiongenie_socialmanager',
          access_token_hash: await encryptToken(tokenData.encrypted_value),
          token_expires_at: null,
          account_metadata: { account_type: 'business' },
          last_sync_at: null
        })
        .eq('id', existingConnection.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      console.log('Instagram connection updated successfully');

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
        provider: 'instagram',
        account_id: IG_USER_ID,
        account_name: '@captiongenie_socialmanager',
        access_token_hash: await encryptToken(tokenData.encrypted_value),
        token_expires_at: null,
        account_metadata: { account_type: 'business' }
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    console.log('Instagram connection created successfully');

    return new Response(
      JSON.stringify({ success: true, connection }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error connecting Instagram:', error);
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
