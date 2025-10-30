import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Input validation schema
    const requestSchema = z.object({
      message: z.string()
        .trim()
        .min(1, 'Message cannot be empty')
        .max(5000, 'Message too long'),
      sessionId: z.string().uuid('Invalid session ID'),
      language: z.enum(['en', 'de', 'es']).default('en')
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validation.error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { message, sessionId, language } = validation.data;

    // Get user plan
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    const userPlan = profile?.plan || 'free';

    // Check daily message limit for free users
    if (userPlan === 'free') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { count } = await supabaseClient
        .from('coach_messages')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('role', 'user')
        .gte('created_at', today.toISOString());

      if (count && count >= 5) {
        return new Response(
          JSON.stringify({ error: 'Daily limit reached. Upgrade to Pro for unlimited messages.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Save user message
    await supabaseClient
      .from('coach_messages')
      .insert({
        session_id: sessionId,
        role: 'user',
        content: message,
      });

    // Get conversation history
    const { data: messages } = await supabaseClient
      .from('coach_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build system prompt with context
    let systemPrompt = `You are CaptionGenie's AI Content Coach, an expert social-media strategist and content mentor.

Core responsibilities:
- Advise creators, entrepreneurs, and brands on growing reach, engagement, and consistency
- Provide proven strategies with practical examples
- Use a positive, encouraging tone
- Give concrete, step-by-step insights (avoid generic advice)
- Tailor advice to the user's platform, tone, goals, and content style

Knowledge domains:
- Platform algorithms (Instagram, TikTok, LinkedIn, Facebook, X/Twitter)
- Post formats (carousels, videos, stories, reels)
- Hashtag and keyword optimization
- Posting frequency and timing strategy
- Audience engagement and storytelling
- Content repurposing across platforms
- Brand tone consistency
- Caption writing best practices

Response guidelines:
- Keep answers concise but actionable (2-4 paragraphs)
- Use bullet points for step-by-step advice
- Reference specific tactics and examples
- Ask clarifying questions if needed
- Celebrate wins and encourage experimentation

Language: ${language}`;

    // Add Pro-specific capabilities
    if (userPlan === 'pro') {
      systemPrompt += `\n\nDeep Strategy Mode (Pro): You can provide extended multi-step analysis, personalized growth roadmaps, and detailed content audits.`;
    }

    // Prepare conversation messages (last 20 for performance)
    const recentMessages = (messages || []).slice(-20);
    const conversationMessages = [
      { role: 'system', content: systemPrompt },
      ...recentMessages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }))
    ];

    // Timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    let response;
    try {
      response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: conversationMessages,
          stream: true,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        console.error('[COACH] Request timeout');
        return new Response(
          JSON.stringify({ 
            error: 'Request timeout. Please try again.',
            code: 'TIMEOUT' 
          }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[COACH] AI API error:', response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ 
            error: 'Rate limit exceeded. Please try again in a moment.',
            code: 'RATE_LIMIT_EXCEEDED' 
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ 
            error: 'Insufficient credits. Please upgrade your plan.',
            code: 'INSUFFICIENT_CREDITS' 
          }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          error: 'AI service error. Please try again.',
          code: 'AI_SERVICE_ERROR' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Stream the response
    const reader = response.body?.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let fullResponse = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader!.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) {
                    fullResponse += content;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          }

          // Save assistant response
          if (fullResponse) {
            await supabaseClient
              .from('coach_messages')
              .insert({
                session_id: sessionId,
                role: 'assistant',
                content: fullResponse,
              });
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Error in coach-chat function:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process chat message' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
