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
    const { platform, audience, topic, tone, keywords, language } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Check daily usage limit for free users
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Get user from auth header
    const token = authHeader?.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check user's plan
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    const isPro = profile?.plan === 'pro';

    // Check daily limit for free users
    if (!isPro) {
      const today = new Date().toISOString().split('T')[0];
      const { count } = await supabase
        .from('bios_history')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', `${today}T00:00:00Z`)
        .lt('created_at', `${today}T23:59:59Z`);

      if (count && count >= 2) {
        return new Response(JSON.stringify({ 
          error: 'Daily limit reached',
          limitReached: true 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const maxChars = platform === 'linkedin' ? 220 : 150;
    const keywordsText = keywords ? `Keywords to include: ${keywords}` : '';
    
    const systemPrompt = `You are an expert social-media copywriter who specializes in writing high-converting profile bios.
Given the platform, target audience, topic, tone, and optional keywords,
create 3 optimized social-media bios that include:
- clear personality (based on tone)
- strategic keywords for search/discoverability
- a short CTA or hook
- max ${maxChars} characters for ${platform}
${keywordsText}
Format your response as valid JSON with this structure:
{
  "bios": [
    {"platform":"${platform}","text":"bio text here"},
    {"platform":"${platform}","text":"bio text here"},
    {"platform":"${platform}","text":"bio text here"}
  ],
  "explanation": "2-3 short sentences on why these bios work"
}`;

    const userPrompt = `Platform: ${platform}
Target Audience: ${audience}
Focus/Niche: ${topic}
Tone: ${tone}
Language: ${language}`;

    console.log('Calling Lovable AI with prompt:', { platform, audience, topic, tone });

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
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      return new Response(JSON.stringify({ error: 'AI generation failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    console.log('AI response:', content);

    // Parse JSON from response
    let biosData;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      biosData = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return new Response(JSON.stringify({ error: 'Invalid AI response format' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Store in history
    const { error: insertError } = await supabase
      .from('bios_history')
      .insert({
        user_id: user.id,
        platform,
        audience,
        topic,
        tone,
        keywords: keywords || null,
        bios_json: biosData,
        language
      });

    if (insertError) {
      console.error('Failed to store bio history:', insertError);
    }

    return new Response(JSON.stringify(biosData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-bio function:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
