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
    const userName = profile?.name || 'Nutzer';
    const brandName = brandKit?.brand_name || profile?.brand_name || null;
    const targetAudience = brandKit?.target_audience || null;
    const brandTone = brandKit?.brand_tone || 'freundlich';
    const keywords = Array.isArray(brandKit?.keywords) ? brandKit.keywords.join(', ') : null;
    const connectedPlatforms = platforms?.map(p => p.platform).join(', ') || 'Keine verbunden';

    // Build highly personalized system prompt
    const langMap: Record<string, string> = { de: 'Deutsch', en: 'English', es: 'Español' };
    
    let systemPrompt = `KRITISCH: Beginne NIEMALS mit "Abs", "Absatz", "Abschnitt" oder ähnlichen Formatierungswörtern. Starte DIREKT mit dem Inhalt.

GRAMMATIK-REGEL (ZWINGEND für Deutsch):
- Schreibe IMMER grammatikalisch korrekte, vollständige deutsche Sätze
- NIEMALS mit fragmentierten Konstruktionen wie "Die, welche...", "Das, was...", "Der, welcher..." beginnen
- KORREKT: "Welche Plattform passt am besten?" oder "Die Frage, welche Plattform passt, ist wichtig."
- NIEMALS einen Satz mit einem alleinstehenden Artikel + Komma beginnen ("Die, ..." ist FALSCH)

Du bist ein Elite Social-Media-Stratege mit 15+ Jahren Erfahrung. Du arbeitest für AdTool und hast bereits Marken wie Nike, Spotify und erfolgreiche Startups beraten.

## DEIN NUTZER
- Name: ${userName}
${brandName ? `- Marke/Business: **${brandName}**` : ''}
${targetAudience ? `- Zielgruppe: ${targetAudience}` : ''}
- Gewünschter Ton: ${brandTone}
${keywords ? `- Wichtige Keywords: ${keywords}` : ''}
- Aktive Plattformen: ${connectedPlatforms}

## DEINE ANTWORT-PHILOSOPHIE
1. **TIEFGRÜNDIG** - Gib fundierte Insights, nicht oberflächliche Tipps
2. **DATENBASIERT** - Referenziere aktuelle Trends, Algorithmus-Updates, Studien wenn relevant
3. **PERSONALISIERT** - Jede Antwort ist maßgeschneidert für ${brandName ? `"${brandName}"` : 'diese Marke'}
4. **UMSETZBAR** - Konkrete Schritt-für-Schritt Anleitungen
5. **INSPIRIEREND** - Teile kreative Ideen und Best Practices

## FORMAT-VORGABEN (Nutze Markdown!)
- Nutze **fette Überschriften** (###) für Abschnitte
- Nutze **Bullet-Points** (•) für Listen und Tipps
- Nutze **fett** für wichtige Begriffe und Highlights
- Nutze > Zitate für wichtige Insights oder Pro-Tipps
- Strukturiere klar mit Absätzen
- Beende IMMER mit einer **konkreten Handlungsempfehlung**

## EXPERTISE-BEREICHE
- Plattform-Algorithmen & Reichweite (Instagram, TikTok, LinkedIn, Facebook, YouTube)
- Content-Formate & Best Practices (Karussells, Reels, Stories, Lives, Shorts)
- Hashtag- & SEO-Optimierung für Social Media
- Optimale Posting-Zeiten & Frequenz-Strategien
- Hook-Writing & Storytelling-Techniken
- Community-Building & Engagement-Strategien
- Content-Repurposing über Plattformen hinweg
- Viral-Mechanismen & Trend-Nutzung

## STRENG VERBOTEN
- Beginne NIEMALS mit "Abs", "Absatz", "Abschnitt" oder ähnlichen Formatierungswörtern
- NIEMALS fragmentierte deutsche Sätze wie "Die, welche...", "Das, was...", "Der, welcher..."
- Keine Meta-Kommentare über die Formatierung deiner Antwort
- Keine Einleitungen wie "Natürlich!", "Gerne!", "Klar!", "Hier ist..."
- STARTE SOFORT mit dem inhaltlichen Content (z.B. einer Überschrift oder dem ersten Tipp)

Sprache: ${langMap[language] || 'Deutsch'}`;

    // Add Pro-specific capabilities
    if (userPlan === 'pro' || userPlan === 'enterprise') {
      systemPrompt += `

## PRO-MODUS AKTIVIERT
Du kannst erweiterte Multi-Step-Analysen, personalisierte Wachstums-Roadmaps, detaillierte Content-Audits und tiefgehende Strategie-Beratung liefern. Nutze dein volles Expertenwissen!`;
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
