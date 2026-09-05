import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";
import { tl, withLang } from "../_shared/i18n.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

serve((req: Request) => withLang(req, () => (async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "coach-chat" });


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

    // Get user profile with plan and name
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('plan, name, brand_name')
      .eq('id', user.id)
      .single();

    const userPlan = profile?.plan || 'free';

    // Get active brand kit for personalization
    const { data: brandKit } = await supabaseClient
      .from('brand_kits')
      .select('brand_name, target_audience, brand_tone, keywords, mood, style_direction')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    // Get connected platforms
    const { data: platforms } = await supabaseClient
      .from('platform_credentials')
      .select('platform')
      .eq('user_id', user.id)
      .eq('is_connected', true);
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

    // Build personalized user context
    const userName = profile?.name || 'there';
    const brandName = brandKit?.brand_name || profile?.brand_name || null;
    const targetAudience = brandKit?.target_audience || null;
    const brandTone = brandKit?.brand_tone || 'friendly';
    const keywords = Array.isArray(brandKit?.keywords) ? brandKit.keywords.join(', ') : null;
    const connectedPlatforms = platforms?.map(p => p.platform).join(', ') || 'None connected';

    // Build highly personalized system prompt.
    // IMPORTANT: the prompt itself is always English so the model never picks a
    // language from the prompt's own wording. The reply language is dictated
    // explicitly by the caller's UI language (default: English).
    const langMap: Record<string, string> = { de: 'German (Deutsch)', en: 'English', es: 'Spanish (Español)' };
    const langName = langMap[language] || 'English';

    let systemPrompt = `OUTPUT LANGUAGE (ABSOLUTE, HIGHEST PRIORITY): Write every single reply in ${langName}. Never switch to another language, never mix languages, and never mirror the language of these instructions. Even if the user writes in another language, answer in ${langName} unless the user explicitly asks for a different language.

CRITICAL: Never start a reply with formatting words like "Abs", "Paragraph", "Section". Start DIRECTLY with the content.

${language === 'de' ? `GRAMMAR RULE (MANDATORY for German output):
- Always write grammatically correct, complete German sentences
- Never start with fragments like "Die, welche...", "Das, was...", "Der, welcher..."
- Never start a sentence with a standalone article + comma

` : ''}You are an elite social media strategist with 15+ years of experience. You work for AdTool and have advised brands like Nike, Spotify and successful startups.

## YOUR USER
- Name: ${userName}
${brandName ? `- Brand/Business: **${brandName}**` : ''}
${targetAudience ? `- Target audience: ${targetAudience}` : ''}
- Desired tone: ${brandTone}
${keywords ? `- Important keywords: ${keywords}` : ''}
- Active platforms: ${connectedPlatforms}

## YOUR ANSWER PHILOSOPHY
1. **DEEP** - Give well-founded insights, not shallow tips
2. **DATA-DRIVEN** - Reference current trends, algorithm updates and studies where relevant
3. **PERSONALIZED** - Every answer is tailored to ${brandName ? `"${brandName}"` : 'this brand'}
4. **ACTIONABLE** - Concrete step-by-step guidance
5. **INSPIRING** - Share creative ideas and best practices

## FORMATTING (use Markdown!)
- Use **bold headings** (###) for sections
- Use bullet points (•) for lists and tips
- Use **bold** for key terms and highlights
- Use > quotes for important insights or pro tips
- Structure clearly with paragraphs
- Always end with a **concrete recommended action**

## AREAS OF EXPERTISE
- Platform algorithms & reach (Instagram, TikTok, LinkedIn, Facebook, YouTube)
- Content formats & best practices (carousels, reels, stories, lives, shorts)
- Hashtag & SEO optimization for social media
- Optimal posting times & frequency strategies
- Hook writing & storytelling techniques
- Community building & engagement strategies
- Content repurposing across platforms
- Viral mechanics & trend usage

## STRICTLY FORBIDDEN
- Never start with formatting words like "Abs", "Paragraph", "Section"
- No meta comments about the formatting of your answer
- No openers like "Sure!", "Of course!", "Here is..."
- Start IMMEDIATELY with the substantive content (e.g. a heading or the first tip)

REMINDER: The entire reply must be written in ${langName}.`;


    // Add Pro-specific capabilities
    if (userPlan === 'pro' || userPlan === 'enterprise') {
      systemPrompt += `

## PRO MODE ACTIVE
You can deliver advanced multi-step analyses, personalized growth roadmaps, detailed content audits and deep strategy consulting. Use your full expert knowledge!`;
    }

    // Prepare conversation messages (last 20 for performance)
    const recentMessages = (messages || []).slice(-20);
    
    // KRITISCH: Bereinige alte "Abs"-Nachrichten bevor sie ans Modell gehen
    // Das Modell lernt von der History - wenn dort "Abs" steht, kopiert es das
    const cleanedMessages = recentMessages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.role === 'assistant' 
        ? msg.content
            .replace(/^Abs!?\s*/i, '')
            .replace(/^Absatz\s*/i, '')
            .replace(/^Abschnitt\s*/i, '')
        : msg.content
    }));

    const conversationMessages = [
      { role: 'system', content: systemPrompt },
      ...cleanedMessages
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
          temperature: 0.7,
          max_tokens: 4000,
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

    // Stream the response with proper line buffering
    const reader = response.body?.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let fullResponse = '';
    let lineBuffer = ''; // Buffer for incomplete SSE lines

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader!.read();
            if (done) break;

            // Accumulate chunks in buffer
            lineBuffer += decoder.decode(value, { stream: true });
            
            // Process only complete lines (ending with \n)
            let newlineIndex: number;
            while ((newlineIndex = lineBuffer.indexOf('\n')) !== -1) {
              const line = lineBuffer.slice(0, newlineIndex);
              lineBuffer = lineBuffer.slice(newlineIndex + 1);

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
                  // JSON parse error - line might be incomplete, skip it
                }
              }
            }
          }
          
          // Process any remaining buffer content
          if (lineBuffer.startsWith('data: ')) {
            const data = lineBuffer.slice(6);
            if (data !== '[DONE]') {
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  fullResponse += content;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                }
              } catch (e) { /* ignore */ }
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
})(req)));
