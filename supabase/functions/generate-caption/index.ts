import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { ErrorResponses, createErrorResponse } from '../_shared/errorHandler.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  
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
      return ErrorResponses.validation(
        { validationErrors: validation.error.errors, requestId },
        'generate-caption input validation'
      );
    }

    const { topic, tone, platform, language } = validation.data;

    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return ErrorResponses.authentication(
        { reason: 'No authorization header', requestId },
        'generate-caption auth check'
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return ErrorResponses.authentication(
        { userError, requestId },
        'generate-caption user fetch'
      );
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

    const languageInstructions: Record<string, string> = {
      en: 'IMPORTANT: Write the entire caption in ENGLISH only.',
      de: 'WICHTIG: Schreibe die gesamte Caption NUR auf DEUTSCH.',
      es: 'IMPORTANTE: Escribe todo el texto SOLO en ESPAÑOL.'
    };

    const prompt = `${languageInstructions[language] || languageInstructions.en}

Write a short, engaging social media caption (max ${maxLength} characters) for ${platform} about "${topic}" in a ${tone} tone.

Then provide exactly ${hashtagCount} relevant hashtags.

Format your response exactly like this:
CAPTION: [your caption here in ${languageNames[language] || 'English'}]
HASHTAGS: #tag1 #tag2 #tag3 #tag4 #tag5`;

    const systemPromptLanguage: Record<string, string> = {
      en: 'You are a professional social media caption writer. Always write in English.',
      de: 'Du bist ein professioneller Social-Media-Texter. Schreibe IMMER auf Deutsch.',
      es: 'Eres un escritor profesional de subtítulos para redes sociales. Escribe SIEMPRE en español.'
    };

    const systemPrompt = systemPromptLanguage[language] || systemPromptLanguage.en;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      
      if (aiResponse.status === 429) {
        return ErrorResponses.rateLimit(
          { aiStatus: aiResponse.status, errorText, requestId },
          'generate-caption AI rate limit'
        );
      }
      
      if (aiResponse.status === 402) {
        return ErrorResponses.paymentRequired(
          { aiStatus: aiResponse.status, errorText, requestId },
          'generate-caption AI credits exhausted'
        );
      }
      
      return ErrorResponses.serviceUnavailable(
        { aiStatus: aiResponse.status, errorText, requestId },
        'generate-caption AI error'
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

    return new Response(
      JSON.stringify({
        caption,
        hashtags,
        requestId
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    return ErrorResponses.internal(
      { error: error instanceof Error ? error.message : String(error), requestId },
      'generate-caption unexpected error'
    );
  }
});