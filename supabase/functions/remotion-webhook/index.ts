import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version, X-Remotion-Status, X-Remotion-Signature, X-Remotion-Mode',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Remotion webhook received');
    console.log('Request method:', req.method);
    console.log('Request headers:', JSON.stringify(Object.fromEntries(req.headers.entries())));
    
    // Parse webhook payload
    const payload = await req.json();
    console.log('Webhook payload:', JSON.stringify(payload, null, 2));

    const { type, renderId, outputFile, errors, bucketName } = payload;

    // Create admin client (webhooks don't have user auth)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Handle different webhook types
    if (type === 'success') {
      console.log(`Render ${renderId} completed successfully`);
      
      // Update video_renders table
      const { error: updateError } = await supabaseAdmin
        .from('video_renders')
        .update({
          status: 'completed',
          video_url: outputFile,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('render_id', renderId);

      if (updateError) {
        console.error('Failed to update video_renders:', updateError);
        throw updateError;
      }

      console.log('Video render marked as completed');
      
    } else if (type === 'error' || type === 'timeout') {
      console.error(`Render ${renderId} failed:`, errors);
      
      const errorMessage = Array.isArray(errors) 
        ? errors.join(', ') 
        : errors?.toString() || 'Unknown error';

      // Update video_renders table with error
      const { error: updateError } = await supabaseAdmin
        .from('video_renders')
        .update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('render_id', renderId);

      if (updateError) {
        console.error('Failed to update video_renders:', updateError);
        throw updateError;
      }

      console.log('Video render marked as failed');
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Webhook processed' }), 
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }), 
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
