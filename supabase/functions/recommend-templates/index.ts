import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RecommendRequest {
  user_id: string;
  content_type: 'ad' | 'story' | 'reel' | 'tutorial' | 'testimonial' | 'news';
  brief: string;
  brand_kit_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { user_id, content_type, brief, brand_kit_id }: RecommendRequest = await req.json();

    if (!brief || brief.length < 20) {
      throw new Error('Brief muss mindestens 20 Zeichen lang sein');
    }

    // Fetch Brand Kit if provided
    let brandKitData = null;
    if (brand_kit_id) {
      const { data: brandKit } = await supabase
        .from('brand_kits')
        .select('brand_tone, brand_voice, color_palette, keywords')
        .eq('id', brand_kit_id)
        .single();
      brandKitData = brandKit;
    }

    // Fetch user's past content projects (last 10)
    const { data: pastProjects } = await supabase
      .from('content_projects')
      .select('template_id')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(10);

    const pastTemplateIds = pastProjects?.map(p => p.template_id).filter(Boolean) || [];

    // Fetch all templates for content_type
    const { data: allTemplates, error: templatesError } = await supabase
      .from('content_templates')
      .select('id, name, description, category, platform, aspect_ratio, ai_features')
      .eq('content_type', content_type);

    if (templatesError) throw templatesError;

    if (!allTemplates || allTemplates.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, recommendations: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const systemPrompt = `Du bist ein Video-Marketing-Experte, der die besten Video-Templates für User-Projekte empfiehlt.`;

    const userPrompt = `Analysiere folgendes User-Projekt und empfehle die TOP 3 besten Templates:

**User Brief:** "${brief}"

**Brand Informationen:**
${brandKitData ? `- Tone: ${brandKitData.brand_tone || 'nicht definiert'}
- Voice: ${JSON.stringify(brandKitData.brand_voice || {})}
- Keywords: ${(brandKitData.keywords || []).join(', ')}` : '- Keine Brand Kit Daten'}

**Vergangene Template-Nutzung:**
${pastTemplateIds.length > 0 ? pastTemplateIds.join(', ') : 'Keine bisherigen Projekte'}

**Verfügbare Templates:**
${allTemplates.map(t => `- ID: ${t.id}, Name: ${t.name}, Beschreibung: ${t.description}, Kategorie: ${t.category}, Platform: ${t.platform}, AI Features: ${t.ai_features}`).join('\n')}

Wähle die TOP 3 besten Templates basierend auf:
1. Match mit Brief und User-Anforderungen
2. Passung zum Brand Tone (falls vorhanden)
3. Erfolgreiche vergangene Template-Nutzung
4. AI Features, die dem Projekt helfen

Gib für jedes Template zurück:
- template_id: Die ID des Templates
- confidence: Score 0-100 (wie gut passt das Template)
- reason: Kurze Begründung (max. 80 Zeichen)`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'recommend_templates',
            description: 'Returns top 3 template recommendations',
            parameters: {
              type: 'object',
              properties: {
                recommendations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      template_id: { type: 'string', description: 'Template ID from the list' },
                      confidence: { type: 'number', description: 'Confidence score 0-100' },
                      reason: { type: 'string', description: 'Short reason (max 80 chars)' }
                    },
                    required: ['template_id', 'confidence', 'reason'],
                    additionalProperties: false
                  },
                  minItems: 1,
                  maxItems: 3
                }
              },
              required: ['recommendations'],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'recommend_templates' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      throw new Error('AI recommendation failed');
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error('No recommendations generated');
    }

    const result = JSON.parse(toolCall.function.arguments);

    // Enrich recommendations with template data
    const enrichedRecommendations = result.recommendations.map((rec: any) => {
      const template = allTemplates.find(t => t.id === rec.template_id);
      return {
        ...rec,
        template: template || null
      };
    });

    return new Response(
      JSON.stringify({ ok: true, recommendations: enrichedRecommendations }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Template recommendation error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
