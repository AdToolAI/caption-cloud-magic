import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Static fallback holidays (if API fails)
const staticHolidays: Record<string, any[]> = {
  DE: [
    { month: 1, day: 1, name: "Neujahr", type: "public" },
    { month: 5, day: 1, name: "Tag der Arbeit", type: "public" },
    { month: 10, day: 3, name: "Tag der Deutschen Einheit", type: "public" },
    { month: 12, day: 25, name: "1. Weihnachtstag", type: "public" },
    { month: 12, day: 26, name: "2. Weihnachtstag", type: "public" },
  ],
  GB: [
    { month: 1, day: 1, name: "New Year's Day", type: "public" },
    { month: 5, day: 6, name: "Early May Bank Holiday", type: "public" },
    { month: 12, day: 25, name: "Christmas Day", type: "public" },
    { month: 12, day: 26, name: "Boxing Day", type: "public" },
  ],
  ES: [
    { month: 1, day: 1, name: "Año Nuevo", type: "public" },
    { month: 5, day: 1, name: "Día del Trabajo", type: "public" },
    { month: 10, day: 12, name: "Fiesta Nacional de España", type: "public" },
    { month: 12, day: 25, name: "Navidad", type: "public" },
  ],
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { region = 'DE', month, year, brand_kit_id } = await req.json();

    // Fetch holidays for the specified month
    let holidays: any[] = [];
    
    try {
      // Try to fetch from public API (date.nager.at is free)
      const apiUrl = `https://date.nager.at/api/v3/PublicHolidays/${year}/${region}`;
      const apiResponse = await fetch(apiUrl);
      
      if (apiResponse.ok) {
        const apiHolidays = await apiResponse.json();
        holidays = apiHolidays
          .filter((h: any) => new Date(h.date).getMonth() + 1 === month)
          .map((h: any) => ({
            date: h.date,
            name: h.localName || h.name,
            type: h.type || 'public',
          }));
      } else {
        throw new Error('API request failed');
      }
    } catch (apiError) {
      console.log('Using static fallback holidays');
      // Fallback to static data
      holidays = (staticHolidays[region] || [])
        .filter(h => h.month === month)
        .map(h => ({
          date: `${year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`,
          name: h.name,
          type: h.type,
        }));
    }

    // Get brand context if available
    let brandContext = '';
    if (brand_kit_id) {
      const { data: brandKit } = await supabaseClient
        .from('brand_kits')
        .select('brand_name, brand_tone, target_audience, brand_values')
        .eq('id', brand_kit_id)
        .single();

      if (brandKit) {
        brandContext = `Brand: ${brandKit.brand_name || 'N/A'}
Tone: ${brandKit.brand_tone || 'professional'}
Audience: ${brandKit.target_audience || 'general'}
Values: ${JSON.stringify(brandKit.brand_values || [])}`;
      }
    }

    // Generate AI content ideas for each holiday
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    const holidaysWithIdeas = await Promise.all(
      holidays.map(async (holiday) => {
        const prompt = `Generate 3 creative social media content ideas for "${holiday.name}" on ${holiday.date}.

${brandContext ? `Consider this brand context:\n${brandContext}\n` : ''}

Return exactly 3 short, actionable content ideas (max 15 words each). Be specific and creative.

Format: Just 3 bullet points, no introduction.`;

        try {
          const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                { role: 'system', content: 'You are a creative social media content strategist.' },
                { role: 'user', content: prompt }
              ],
              max_tokens: 200,
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const content = aiData.choices?.[0]?.message?.content || '';
            
            // Parse ideas from AI response
            const ideas = content
              .split('\n')
              .filter((line: string) => line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().startsWith('*'))
              .map((line: string) => line.replace(/^[•\-*]\s*/, '').trim())
              .filter((idea: string) => idea.length > 0)
              .slice(0, 3);

            return {
              ...holiday,
              ideas: ideas.length > 0 ? ideas : [
                `Share the story behind ${holiday.name}`,
                `Create a themed visual celebrating this day`,
                `Engage your audience with a holiday-themed question`
              ],
            };
          }
        } catch (aiError) {
          console.error('AI generation failed:', aiError);
        }

        // Fallback ideas
        return {
          ...holiday,
          ideas: [
            `Share the story behind ${holiday.name}`,
            `Create a themed visual celebrating this day`,
            `Engage your audience with a holiday-themed question`
          ],
        };
      })
    );

    return new Response(
      JSON.stringify({
        code: 'HOLIDAYS_FETCHED',
        holidays: holidaysWithIdeas,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in calendar-holiday-suggestions:', error);
    return new Response(
      JSON.stringify({
        error: 'INTERNAL_ERROR',
        code: 'INTERNAL_ERROR',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
