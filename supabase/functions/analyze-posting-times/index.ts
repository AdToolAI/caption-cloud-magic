import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Static fallback data
const postingStats: Record<string, { times: string[], peak: string }> = {
  instagram: {
    times: ["Wednesday 19:00-21:00", "Friday 18:00-20:00", "Sunday 10:00-12:00"],
    peak: "evening"
  },
  tiktok: {
    times: ["Thursday 17:00-19:00", "Saturday 11:00-13:00", "Sunday 20:00-22:00"],
    peak: "afternoon-evening"
  },
  linkedin: {
    times: ["Tuesday 08:00-10:00", "Wednesday 09:00-11:00", "Thursday 12:00-13:00"],
    peak: "morning-midday"
  },
  facebook: {
    times: ["Wednesday 13:00-16:00", "Thursday 12:00-15:00", "Friday 13:00-16:00"],
    peak: "midday-afternoon"
  },
  x: {
    times: ["Monday 12:00-13:00", "Wednesday 12:00-13:00", "Friday 09:00-10:00"],
    peak: "midday"
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Input validation
    const requestSchema = z.object({
      platform: z.string().regex(/^[a-zA-Z]+$/).max(50),
      timezone: z.string().max(100),
      niche: z.string().max(200).optional(),
      goal: z.string().max(200).optional(),
      language: z.string().regex(/^[a-z]{2}$/).optional(),
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validation.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { platform, timezone, niche, goal, language } = validation.data;
    
    console.log('Analyzing posting times for:', { platform, timezone, niche, goal, language });

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
        .from('post_time_advice')
        .select('id')
        .eq('user_id', user.id)
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`);

      if (usageData && usageData.length >= 2) {
        return new Response(
          JSON.stringify({ error: 'Daily limit reached', code: 'LIMIT_REACHED' }),
          {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Get fallback times
    const fallbackTimes = postingStats[platform.toLowerCase()]?.times || postingStats.instagram.times;

    // Build AI prompt
    const nicheText = niche ? ` targeting the ${niche} industry` : '';
    const goalText = goal ? ` with a focus on ${goal}` : '';
    const aiPrompt = `Based on the selected platform ${platform}, the timezone ${timezone}${nicheText}${goalText}, estimate the top 3 optimal posting time windows for maximum reach and engagement.

Use global social-media behavior patterns (e.g., evenings for lifestyle content, mornings for business content).

Return a JSON object with these exact fields:
{
  "times": ["Day HH:MM-HH:MM", "Day HH:MM-HH:MM", "Day HH:MM-HH:MM"],
  "explanation": "Brief explanation why these times work",
  "tips": ["Practical tip 1", "Practical tip 2"]
}

Important: 
- Convert times to ${timezone} timezone
- Consider ${platform} audience behavior
- Keep times realistic and actionable
- Generate the output in ${language === 'de' ? 'German' : language === 'es' ? 'Spanish' : 'English'} language`;

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Calling Lovable AI...');
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
            role: 'user',
            content: aiPrompt
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Lovable AI error:', aiResponse.status, errorText);
      // Fallback to static data if AI fails
      console.log('Using fallback data');
      const result = {
        times: fallbackTimes,
        explanation: `Based on general ${platform} engagement patterns in ${timezone}.`,
        tips: [`Post during ${postingStats[platform.toLowerCase()]?.peak || 'peak'} hours`, 'Test different times to find what works best for your audience']
      };
      
      await supabaseClient
        .from('post_time_advice')
        .insert({
          user_id: user.id,
          platform,
          timezone,
          niche: niche || null,
          goal: goal || null,
          ai_result_json: result,
        });

      return new Response(
        JSON.stringify(result),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0].message.content;
    console.log('AI response received');

    // Parse the JSON response
    let parsedResult;
    try {
      const jsonMatch = aiContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : aiContent;
      parsedResult = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse AI response, using fallback:', aiContent);
      parsedResult = {
        times: fallbackTimes,
        explanation: `Based on general ${platform} engagement patterns in ${timezone}.`,
        tips: [`Post during ${postingStats[platform.toLowerCase()]?.peak || 'peak'} hours`, 'Test different times to find what works best for your audience']
      };
    }

    // Save to database
    const { error: insertError } = await supabaseClient
      .from('post_time_advice')
      .insert({
        user_id: user.id,
        platform,
        timezone,
        niche: niche || null,
        goal: goal || null,
        ai_result_json: parsedResult,
      });

    if (insertError) {
      console.error('Error saving advice:', insertError);
      throw insertError;
    }

    console.log('Advice saved successfully');

    return new Response(
      JSON.stringify(parsedResult),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in analyze-posting-times:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to analyze posting times' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});