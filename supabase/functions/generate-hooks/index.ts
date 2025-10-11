import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, platform, tone, audience, styles, language } = await req.json();
    
    console.log('Generating hooks for:', { topic, platform, tone, audience, styles, language });

    // Authenticate user
    const authHeader = req.headers.get('Authorization')!;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Check usage limits for free users
    const { data: profileData } = await supabaseClient
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    if (profileData?.plan === 'free') {
      const today = new Date().toISOString().split('T')[0];
      const { data: usageData } = await supabaseClient
        .from('hooks_history')
        .select('id')
        .eq('user_id', user.id)
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`);

      if (usageData && usageData.length >= 3) {
        return new Response(
          JSON.stringify({ error: 'Daily limit reached', code: 'LIMIT_REACHED' }),
          {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Build AI prompt
    const languageCode = language === 'de' ? 'de' : language === 'es' ? 'es' : 'en';
    const audienceText = audience ? `\nAUDIENCE: ${audience}` : '';
    const stylesText = styles.join(', ');
    
    const aiPrompt = `You are an expert social media copywriter. Create viral first-line hooks optimized for short-form posts (feed, reels, shorts).

Rules:
- Keep each hook concise (ideally 60–110 characters).
- Make it platform-aware: ${platform}.
- Avoid hashtags and links in the hook.
- Never include quotation marks around the hook itself.
- Vary styles and emotional triggers to maximize scroll-stopping power.
- Language: ${languageCode}.

TOPIC: ${topic}${audienceText}
TONE: ${tone}
PLATFORM: ${platform}
STYLES_TO_INCLUDE: ${stylesText}

Return JSON ONLY in this exact schema:
{
  "hooks": [
    {"style":"Curiosity","text":"..."},
    {"style":"Humor","text":"..."},
    {"style":"Provocation","text":"..."},
    {"style":"Authority","text":"..."},
    {"style":"Relatable","text":"..."}
  ],
  "notes": "1-2 short lines on why these hooks work for this platform."
}`;

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Calling Lovable AI...');
    let aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: aiPrompt
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Lovable AI error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    let aiData = await aiResponse.json();
    let aiContent = aiData.choices[0].message.content;
    console.log('AI response received');

    // Parse the JSON response
    let parsedResult;
    let retryCount = 0;
    
    while (retryCount < 2) {
      try {
        const jsonMatch = aiContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        const jsonText = jsonMatch ? jsonMatch[1] : aiContent;
        parsedResult = JSON.parse(jsonText);
        
        // Validate structure
        if (parsedResult.hooks && Array.isArray(parsedResult.hooks) && parsedResult.hooks.length === 5) {
          break;
        } else {
          throw new Error('Invalid hook structure');
        }
      } catch (parseError) {
        console.error('Failed to parse AI response, attempt:', retryCount + 1);
        
        if (retryCount === 0) {
          // Retry once
          console.log('Retrying AI call...');
          aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                {
                  role: 'user',
                  content: aiPrompt
                }
              ],
            }),
          });
          
          if (aiResponse.ok) {
            aiData = await aiResponse.json();
            aiContent = aiData.choices[0].message.content;
          }
        } else {
          throw new Error('Failed to parse AI response after retry');
        }
        
        retryCount++;
      }
    }

    if (!parsedResult) {
      throw new Error('Failed to generate valid hooks');
    }

    // Save to database
    const { error: insertError } = await supabaseClient
      .from('hooks_history')
      .insert({
        user_id: user.id,
        platform,
        tone,
        audience: audience || null,
        topic,
        styles_json: styles,
        hooks_json: parsedResult.hooks,
        language: languageCode,
      });

    if (insertError) {
      console.error('Error saving hooks:', insertError);
      throw insertError;
    }

    console.log('Hooks saved successfully');

    return new Response(
      JSON.stringify(parsedResult),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in generate-hooks:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});