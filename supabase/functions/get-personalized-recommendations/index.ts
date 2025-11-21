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

    // Fetch user behavior events
    const { data: events } = await supabase
      .from('user_behavior_events')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    // Analyze patterns
    const templateViews = events?.filter(e => e.event_type === 'template_view') || [];
    const templateSelections = events?.filter(e => e.event_type === 'template_select') || [];
    const projectCreations = events?.filter(e => e.event_type === 'project_create') || [];

    // Count template usage
    const templateCounts: Record<string, number> = {};
    templateSelections.forEach(event => {
      const tid = event.template_id;
      if (tid) {
        templateCounts[tid] = (templateCounts[tid] || 0) + 1;
      }
    });

    // Get most used templates
    const topTemplateIds = Object.entries(templateCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id]) => id);

    // Fetch template details
    const { data: topTemplates } = await supabase
      .from('content_templates')
      .select('*')
      .in('id', topTemplateIds);

    // Analyze content types
    const contentTypeCounts: Record<string, number> = {};
    projectCreations.forEach(event => {
      const type = event.content_type;
      if (type) {
        contentTypeCounts[type] = (contentTypeCounts[type] || 0) + 1;
      }
    });

    const preferredContentType = Object.entries(contentTypeCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 'ad';

    // Get similar templates
    const { data: similarTemplates } = await supabase
      .from('content_templates')
      .select('*')
      .eq('content_type', preferredContentType)
      .eq('is_public', true)
      .limit(10);

    // Use AI for personalized insights
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (LOVABLE_API_KEY) {
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content: 'Provide personalized content recommendations based on user behavior. Return JSON with insights and suggestions.'
            },
            {
              role: 'user',
              content: `User behavior:
- Total template views: ${templateViews.length}
- Total projects: ${projectCreations.length}
- Preferred content type: ${preferredContentType}
- Most used templates: ${topTemplateIds.length}

Provide personalized recommendations.`
            }
          ],
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const insights = aiData.choices[0].message.content;

        return new Response(
          JSON.stringify({ 
            success: true,
            templates: topTemplates || [],
            similar_templates: similarTemplates || [],
            preferred_content_type: preferredContentType,
            ai_insights: insights,
            stats: {
              total_views: templateViews.length,
              total_selections: templateSelections.length,
              total_projects: projectCreations.length,
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fallback without AI
    return new Response(
      JSON.stringify({ 
        success: true,
        templates: topTemplates || [],
        similar_templates: similarTemplates || [],
        preferred_content_type: preferredContentType,
        stats: {
          total_views: templateViews.length,
          total_selections: templateSelections.length,
          total_projects: projectCreations.length,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-personalized-recommendations:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
