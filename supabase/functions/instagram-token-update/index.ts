import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { newToken, action } = await req.json();

    // Validate action
    if (action === 'validate') {
      // Validate token without saving
      if (!newToken || newToken.length < 250) {
        return new Response(
          JSON.stringify({ 
            valid: false, 
            error: 'Token must be at least 250 characters long',
            length: newToken?.length || 0
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Test token against Instagram API
      console.log('Testing Instagram token...');
      const testResponse = await fetch(
        `https://graph.instagram.com/me?fields=id,username&access_token=${newToken}`
      );

      if (!testResponse.ok) {
        const error = await testResponse.json();
        console.error('Instagram API test failed:', error);
        return new Response(
          JSON.stringify({ 
            valid: false, 
            error: error.error?.message || 'Token validation failed',
            length: newToken.length
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const accountData = await testResponse.json();
      console.log('Token validated successfully:', accountData);

      return new Response(
        JSON.stringify({ 
          valid: true, 
          accountId: accountData.id,
          username: accountData.username,
          length: newToken.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'save') {
      // Validate token first
      if (!newToken || newToken.length < 250) {
        throw new Error('Token must be at least 250 characters long');
      }

      // Test token
      const testResponse = await fetch(
        `https://graph.instagram.com/me?fields=id,username&access_token=${newToken}`
      );

      if (!testResponse.ok) {
        const error = await testResponse.json();
        throw new Error(error.error?.message || 'Invalid token');
      }

      const accountData = await testResponse.json();

      // Backup old token
      const { data: oldSecret } = await supabase
        .from('app_secrets')
        .select('encrypted_value')
        .eq('name', 'IG_PAGE_ACCESS_TOKEN')
        .single();

      if (oldSecret) {
        console.log('Backing up old token...');
        await supabase
          .from('kv_secrets_backup')
          .insert({
            name: 'IG_PAGE_ACCESS_TOKEN',
            encrypted_value: oldSecret.encrypted_value,
            token_last6: oldSecret.encrypted_value.slice(-6),
            expires_at: null
          });
      }

      // Update token in app_secrets
      console.log('Updating token in app_secrets...');
      const { error: updateError } = await supabase
        .from('app_secrets')
        .update({ 
          encrypted_value: newToken,
          updated_at: new Date().toISOString()
        })
        .eq('name', 'IG_PAGE_ACCESS_TOKEN');

      if (updateError) {
        console.error('Error updating token:', updateError);
        throw new Error('Failed to update token');
      }

      console.log('Token updated successfully!');

      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Token successfully updated',
          accountId: accountData.id,
          username: accountData.username
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});