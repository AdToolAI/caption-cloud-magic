import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { originalVideoId, variations } = await req.json();

    if (!originalVideoId || !variations || !Array.isArray(variations)) {
      throw new Error('originalVideoId and variations array are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Get user from token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log('Creating batch videos for user:', user.id);

    // Get original video
    const { data: originalVideo, error: videoError } = await supabase
      .from('video_creations')
      .select('*')
      .eq('id', originalVideoId)
      .single();

    if (videoError || !originalVideo) {
      throw new Error('Original video not found');
    }

    // Check user has enough credits
    const totalCost = variations.length * 5; // 5 credits per variant
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (!wallet || wallet.balance < totalCost) {
      return new Response(
        JSON.stringify({ 
          error: 'Insufficient credits',
          required: totalCost,
          available: wallet?.balance || 0
        }),
        {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get next version number
    const { data: versions } = await supabase
      .from('video_creations')
      .select('version_number')
      .or(`id.eq.${originalVideoId},parent_video_id.eq.${originalVideoId}`)
      .order('version_number', { ascending: false })
      .limit(1);

    const nextVersion = (versions?.[0]?.version_number || 0) + 1;

    // Create all variations
    const createdVideos = [];
    
    for (let i = 0; i < variations.length; i++) {
      const variant = variations[i];
      
      // Merge customizations
      const customizations = {
        ...originalVideo.customizations,
        ...variant.customizations,
      };

      // Create video creation record
      const { data: newVideo, error: createError } = await supabase
        .from('video_creations')
        .insert({
          user_id: user.id,
          template_id: originalVideo.template_id,
          customizations,
          status: 'pending',
          parent_video_id: originalVideoId,
          version_number: nextVersion + i,
          quality: customizations.quality || originalVideo.quality,
        })
        .select()
        .single();

      if (createError || !newVideo) {
        console.error('Error creating variant:', createError);
        continue;
      }

      // Deduct credits
      await supabase.rpc('deduct_credits', {
        p_user_id: user.id,
        p_amount: 5
      });

      // TODO: Trigger video generation (call Shotstack API or queue job)
      // For now, just mark as queued
      await supabase
        .from('video_creations')
        .update({ status: 'processing' })
        .eq('id', newVideo.id);

      createdVideos.push({
        id: newVideo.id,
        version_number: newVideo.version_number,
        variant_name: variant.name,
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        videos: createdVideos,
        totalCost
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in batch-create-videos:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
