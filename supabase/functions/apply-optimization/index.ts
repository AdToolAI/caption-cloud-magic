import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { optimization_id, selected_improvements } = await req.json();

    // Fetch optimization
    const { data: optimization, error: optError } = await supabase
      .from('post_optimizations')
      .select('*')
      .eq('id', optimization_id)
      .eq('user_id', user.id)
      .single();

    if (optError) throw optError;

    const improvements = optimization.suggested_improvements as any;
    const selectedItems = improvements.improvements.filter((imp: any, idx: number) => 
      selected_improvements.includes(idx)
    );

    // Apply improvements to post/draft
    const updates: any = {};
    
    selectedItems.forEach((imp: any) => {
      if (imp.category === 'text' && imp.suggested) {
        updates.caption = imp.suggested;
      } else if (imp.category === 'hashtags' && imp.suggested) {
        try {
          updates.hashtags = JSON.parse(imp.suggested);
        } catch {
          updates.hashtags = imp.suggested.split(' ').filter((h: string) => h.startsWith('#'));
        }
      }
    });

    let updatedData;
    if (optimization.post_id) {
      const { data } = await supabase
        .from('posts')
        .update(updates)
        .eq('id', optimization.post_id)
        .select()
        .single();
      updatedData = data;
    } else if (optimization.draft_id) {
      const { data } = await supabase
        .from('post_drafts')
        .update(updates)
        .eq('id', optimization.draft_id)
        .select()
        .single();
      updatedData = data;
    }

    // Update optimization record
    await supabase
      .from('post_optimizations')
      .update({
        applied_improvements: selectedItems.map((imp: any) => imp.category),
        applied_at: new Date().toISOString(),
      })
      .eq('id', optimization_id);

    return new Response(
      JSON.stringify({ 
        success: true,
        updated_data: updatedData,
        applied_count: selectedItems.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in apply-optimization:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
