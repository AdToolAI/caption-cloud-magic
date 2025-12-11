import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { originalQuestion, coachAnswer, language = 'de' } = await req.json();

    if (!originalQuestion || !coachAnswer) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Truncate answer to keep prompt short
    const truncatedAnswer = coachAnswer.length > 500 
      ? coachAnswer.substring(0, 500) + '...' 
      : coachAnswer;

    const systemPrompt = language === 'de' 
      ? `Du bist ein Content-Strategie-Experte. Generiere EINE kurze Anschlussfrage (max 60 Zeichen), die thematisch zur vorherigen Frage und Antwort passt.

REGELN:
- Max 60 Zeichen
- Direkte, einfache Frage
- Thematisch passend zum Gespräch
- Keine Einleitung, nur die Frage
- Deutsch

Beispiele guter Anschlussfragen:
- "Welche Posting-Zeiten funktionieren am besten?"
- "Wie oft sollte ich Stories posten?"
- "Was macht einen guten Hook aus?"`
      : `You are a content strategy expert. Generate ONE short follow-up question (max 60 chars) that relates to the previous Q&A.

RULES:
- Max 60 characters
- Direct, simple question
- Thematically related
- No intro, just the question
- English

Good examples:
- "What posting times work best?"
- "How often should I post Stories?"
- "What makes a good hook?"`;

    const userPrompt = language === 'de'
      ? `Ursprüngliche Frage: "${originalQuestion}"

Coach-Antwort (Zusammenfassung): ${truncatedAnswer}

Generiere EINE passende Anschlussfrage:`
      : `Original question: "${originalQuestion}"

Coach answer (summary): ${truncatedAnswer}

Generate ONE relevant follow-up question:`;

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
        max_tokens: 100,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error('Failed to generate follow-up question');
    }

    const data = await response.json();
    let followupQuestion = data.choices?.[0]?.message?.content?.trim() || '';

    // Clean up the response
    followupQuestion = followupQuestion
      .replace(/^[\"']|[\"']$/g, '') // Remove quotes
      .replace(/^\d+\.\s*/, '') // Remove numbering
      .replace(/^[-•]\s*/, '') // Remove bullets
      .trim();

    // Ensure it ends with ?
    if (followupQuestion && !followupQuestion.endsWith('?')) {
      followupQuestion += '?';
    }

    // Truncate if too long
    if (followupQuestion.length > 80) {
      followupQuestion = followupQuestion.substring(0, 77) + '...?';
    }

    console.log(`[generate-followup-question] Generated: "${followupQuestion}"`);

    return new Response(
      JSON.stringify({ followupQuestion }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error generating follow-up question:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate follow-up question';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

