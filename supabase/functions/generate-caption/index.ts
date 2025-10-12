import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Input validation schema
    const requestSchema = z.object({
      topic: z.string()
        .trim()
        .min(3, 'Topic too short')
        .max(200, 'Topic too long')
        .regex(/^[a-zA-Z0-9\s.,!?äöüßÄÖÜáéíóúñÁÉÍÓÚÑ-]+$/, 'Invalid characters in topic'),
      tone: z.enum(['professional', 'casual', 'friendly', 'formal', 'humorous', 'inspirational']),
      platform: z.enum(['instagram', 'facebook', 'linkedin', 'twitter', 'tiktok', 'youtube']),
      language: z.enum(['en', 'de', 'es'])
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validation.error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { topic, tone, platform, language } = validation.data;

    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user profile to check plan
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile error:', profileError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch profile" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check usage limits for free users
    if (profile.plan === 'free') {
      const today = new Date().toISOString().split('T')[0];
      
      const { data: usageData, error: usageError } = await supabase
        .from('usage')
        .select('count')
        .eq('user_id', user.id)
        .eq('date', today)
        .single();

      const currentUsage = usageData?.count || 0;

      // Get free limit from settings
      const { data: settingsData } = await supabase
        .from('settings')
        .select('value_json')
        .eq('key', 'free_limit')
        .single();

      const freeLimit = settingsData?.value_json?.limit || 3;

      if (currentUsage >= freeLimit) {
        return new Response(
          JSON.stringify({ error: "limit_reached", limit: freeLimit }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get settings for caption length and hashtag count
    const { data: captionSettings } = await supabase
      .from('settings')
      .select('value_json')
      .eq('key', 'caption_max_length')
      .single();

    const { data: hashtagSettings } = await supabase
      .from('settings')
      .select('value_json')
      .eq('key', 'hashtag_count')
      .single();

    const maxLength = captionSettings?.value_json?.length || 250;
    const hashtagCount = hashtagSettings?.value_json?.count || 5;

    // Generate caption using Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    const languageNames: Record<string, string> = {
      en: 'English',
      de: 'German',
      es: 'Spanish'
    };

    const prompt = `Write a short, engaging social media caption (max ${maxLength} characters) for ${platform} about "${topic}" in a ${tone} tone. Write in ${languageNames[language] || 'English'}. Then provide exactly ${hashtagCount} relevant hashtags.

Format your response exactly like this:
CAPTION: [your caption here]
HASHTAGS: #tag1 #tag2 #tag3 #tag4 #tag5`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a professional social media caption writer.' },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'AI generation failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const generatedText = aiData.choices[0].message.content;

    // Parse the response
    const captionMatch = generatedText.match(/CAPTION:\s*(.+?)(?=\nHASHTAGS:|$)/s);
    const hashtagsMatch = generatedText.match(/HASHTAGS:\s*(.+)/);

    const caption = captionMatch ? captionMatch[1].trim() : generatedText.slice(0, maxLength);
    const hashtagsText = hashtagsMatch ? hashtagsMatch[1].trim() : '';
    const hashtags = hashtagsText.split(/\s+/).filter((tag: string) => tag.startsWith('#')).slice(0, hashtagCount);

    // If not enough hashtags were generated, add generic ones
    const genericHashtags = ['#socialmedia', '#content', '#marketing', '#viral', '#trending'];
    while (hashtags.length < hashtagCount && genericHashtags.length > 0) {
      hashtags.push(genericHashtags.shift()!);
    }

    // Save caption to database
    const { error: insertError } = await supabase
      .from('captions')
      .insert({
        user_id: user.id,
        topic,
        tone,
        platform,
        caption_text: caption,
        hashtags,
        language
      });

    if (insertError) {
      console.error('Insert error:', insertError);
    }

    // Update usage for free users
    if (profile.plan === 'free') {
      const today = new Date().toISOString().split('T')[0];
      
      const { error: usageError } = await supabase.rpc('increment_usage', {
        user_id_param: user.id,
        date_param: today
      });

      if (usageError) {
        console.error('Usage update error:', usageError);
      }
    }

    return new Response(
      JSON.stringify({
        caption,
        hashtags
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in generate-caption:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});