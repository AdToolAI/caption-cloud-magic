import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Request started`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', requestId }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validation
    const requestSchema = z.object({
      platform: z.string().max(50),
      replyStyle: z.enum(['neutral', 'friendly', 'humorous', 'formal']).default('neutral'),
      items: z.array(z.object({
        username: z.string().max(100).nullable(),
        comment: z.string().min(3).max(1000),
      })).min(1).max(2000),
      lang: z.enum(['auto', 'de', 'en', 'es']).default('auto'),
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(JSON.stringify({ 
        error: 'Invalid input', 
        details: validation.error.issues,
        requestId 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { platform, replyStyle, items, lang } = validation.data;
    console.log(`[${requestId}] Processing ${items.length} comments`);

    // Check rate limiting
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    const isPro = profile?.plan === 'pro';

    if (!isPro && items.length > 20) {
      return new Response(JSON.stringify({ 
        error: 'Free plan limit exceeded',
        message: 'Free plan allows max 20 comments per analysis',
        requestId
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Analyze comments
    const analyzedItems: any[] = [];
    let useFallback = false;

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      
      try {
        if (!lovableApiKey) {
          throw new Error('No AI key available');
        }

        const systemPrompt = `You are an expert social media comment analyzer. Analyze comments in multiple languages and provide detailed insights.

Return ONLY valid JSON with this exact structure:
{
  "language": "de|en|es|...",
  "sentiment": "positive|neutral|negative",
  "toxicity": "none|mild|severe",
  "intent": "praise|complaint|question|feature_request|bug_report|spam|sales_lead|other",
  "topics": ["topic1", "topic2"],
  "urgency": "low|medium|high",
  "priorityScore": 0-100,
  "action": "reply|escalate_support|ignore_block|follow_up_dm|convert_lead",
  "replySuggestions": ["reply1", "reply2"],
  "riskNotes": "any warnings about toxicity or sensitive content"
}

Rules:
- Detect language automatically
- Sentiment: positive for praise/happiness, negative for complaints/anger, neutral otherwise
- Toxicity: severe for hate speech/threats, mild for rude language, none otherwise
- Intent: categorize the main purpose of the comment
- Topics: extract 2-4 key topics mentioned
- Urgency: high for complaints/bugs/urgent questions, medium for regular questions, low for praise
- PriorityScore: 0-100 based on urgency + toxicity + intent (complaints/bugs = high)
- Action: recommend best action (reply, escalate to support, ignore spam, etc.)
- ReplySuggestions: 1-2 de-escalating, professional ${replyStyle} responses in the comment's language
- RiskNotes: warn about toxic content - NEVER mirror offensive words in replies`;

        const userPrompt = `Platform: ${platform}
Comment: "${item.comment}"
Username: ${item.username || 'Anonymous'}

Analyze this comment comprehensively.`;

        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_object' },
          }),
        });

        if (!aiResponse.ok) {
          throw new Error(`AI API error: ${aiResponse.status}`);
        }

        const aiData = await aiResponse.json();
        const analysis = JSON.parse(aiData.choices[0].message.content);

        analyzedItems.push({
          idx,
          username: item.username || 'Anonymous',
          comment: item.comment,
          language: analysis.language || 'unknown',
          sentiment: analysis.sentiment || 'neutral',
          toxicity: analysis.toxicity || 'none',
          intent: analysis.intent || 'other',
          topics: analysis.topics || [],
          urgency: analysis.urgency || 'medium',
          priorityScore: analysis.priorityScore || 50,
          action: analysis.action || 'reply',
          replySuggestions: analysis.replySuggestions || [],
          riskNotes: analysis.riskNotes || undefined,
        });

      } catch (error) {
        console.error(`[${requestId}] AI analysis failed for comment ${idx}, using fallback:`, error);
        useFallback = true;

        // Fallback heuristic analysis
        const comment = item.comment.toLowerCase();
        
        // Detect language (simple heuristic)
        let language = 'en';
        if (/[äöüß]/.test(comment)) language = 'de';
        if (/[¿¡ñ]/.test(comment)) language = 'es';

        // Sentiment
        const positiveWords = ['great', 'love', 'awesome', 'excellent', 'super', 'toll', 'mega', 'genial', 'excelente'];
        const negativeWords = ['bad', 'hate', 'terrible', 'awful', 'schlecht', 'schwachsinn', 'horrible', 'terrible'];
        let sentiment = 'neutral';
        if (positiveWords.some(w => comment.includes(w))) sentiment = 'positive';
        if (negativeWords.some(w => comment.includes(w))) sentiment = 'negative';

        // Toxicity
        const toxicWords = ['idiot', 'stupid', 'dumb', 'dumm', 'idiota'];
        const severeToxicWords = ['hate', 'kill', 'die', 'hass'];
        let toxicity = 'none';
        if (toxicWords.some(w => comment.includes(w))) toxicity = 'mild';
        if (severeToxicWords.some(w => comment.includes(w))) toxicity = 'severe';

        // Intent
        let intent = 'other';
        if (comment.includes('?') || comment.includes('wie') || comment.includes('what')) intent = 'question';
        if (sentiment === 'positive') intent = 'praise';
        if (sentiment === 'negative') intent = 'complaint';
        if (comment.includes('bug') || comment.includes('fehler') || comment.includes('error')) intent = 'bug_report';

        // Topics (simple extraction)
        const topics: string[] = [];
        if (comment.includes('design') || comment.includes('seite')) topics.push('Design');
        if (comment.includes('preis') || comment.includes('price')) topics.push('Preis');
        if (comment.includes('support') || comment.includes('hilfe')) topics.push('Support');

        analyzedItems.push({
          idx,
          username: item.username || 'Anonymous',
          comment: item.comment,
          language,
          sentiment,
          toxicity,
          intent,
          topics,
          urgency: sentiment === 'negative' ? 'high' : 'medium',
          priorityScore: sentiment === 'negative' ? 75 : 50,
          action: toxicity === 'severe' ? 'ignore_block' : 'reply',
          replySuggestions: [
            language === 'de' 
              ? 'Danke für Ihr Feedback! Wir nehmen das ernst und arbeiten daran.' 
              : 'Thanks for your feedback! We take this seriously and are working on it.'
          ],
          riskNotes: toxicity !== 'none' ? 'Fallback analysis - review manually' : undefined,
        });
      }
    }

    // Calculate summary
    const summary = {
      total: analyzedItems.length,
      bySentiment: {
        positive: analyzedItems.filter(c => c.sentiment === 'positive').length,
        neutral: analyzedItems.filter(c => c.sentiment === 'neutral').length,
        negative: analyzedItems.filter(c => c.sentiment === 'negative').length,
      },
      byIntent: analyzedItems.reduce((acc: any, c) => {
        acc[c.intent] = (acc[c.intent] || 0) + 1;
        return acc;
      }, {}),
      toxicity: {
        mild: analyzedItems.filter(c => c.toxicity === 'mild').length,
        severe: analyzedItems.filter(c => c.toxicity === 'severe').length,
      },
      topTopics: Object.entries(
        analyzedItems.reduce((acc: any, c) => {
          c.topics.forEach((t: string) => {
            acc[t] = (acc[t] || 0) + 1;
          });
          return acc;
        }, {})
      )
        .map(([topic, count]) => ({ topic, count: count as number }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };

    console.log(`[${requestId}] Analysis complete. Fallback: ${useFallback}`);

    // Generate timeseries data (group by day)
    const timeseriesMap = new Map<string, { pos: number; neu: number; neg: number }>();
    analyzedItems.forEach(item => {
      const date = new Date().toISOString().split('T')[0];
      if (!timeseriesMap.has(date)) {
        timeseriesMap.set(date, { pos: 0, neu: 0, neg: 0 });
      }
      const day = timeseriesMap.get(date)!;
      if (item.sentiment === 'positive') day.pos++;
      else if (item.sentiment === 'neutral') day.neu++;
      else day.neg++;
    });
    
    const timeseries = {
      byDay: Array.from(timeseriesMap.entries()).map(([date, counts]) => ({
        date,
        pos: counts.pos,
        neu: counts.neu,
        neg: counts.neg
      }))
    };

    // Generate heatmap (topic x sentiment)
    const heatmapMap = new Map<string, { positive: number; neutral: number; negative: number }>();
    analyzedItems.forEach(item => {
      item.topics.forEach((topic: string) => {
        if (!heatmapMap.has(topic)) {
          heatmapMap.set(topic, { positive: 0, neutral: 0, negative: 0 });
        }
        const heat = heatmapMap.get(topic)!;
        if (item.sentiment === 'positive') heat.positive++;
        else if (item.sentiment === 'neutral') heat.neutral++;
        else if (item.sentiment === 'negative') heat.negative++;
      });
    });
    
    const heatmap = Array.from(heatmapMap.entries())
      .map(([topic, counts]) => ({ topic, ...counts }))
      .sort((a, b) => (b.positive + b.neutral + b.negative) - (a.positive + a.neutral + a.negative))
      .slice(0, 5);

    // Count unanswered questions and sales leads
    const unansweredQuestions = analyzedItems.filter(c => c.intent === 'question').length;
    const salesLeads = analyzedItems.filter(c => c.intent === 'sales_lead').length;

    // Generate AI insights
    const insights: any[] = [];
    
    // Insight 1: Most problematic topic
    const negativeByTopic = new Map<string, number>();
    analyzedItems.forEach(item => {
      if (item.sentiment === 'negative') {
        item.topics.forEach((topic: string) => {
          negativeByTopic.set(topic, (negativeByTopic.get(topic) || 0) + 1);
        });
      }
    });
    
    if (negativeByTopic.size > 0) {
      const topNegTopic = Array.from(negativeByTopic.entries())
        .sort((a, b) => b[1] - a[1])[0];
      const totalNeg = analyzedItems.filter(c => c.sentiment === 'negative').length;
      const percentage = Math.round((topNegTopic[1] / totalNeg) * 100);
      
      insights.push({
        title: `${topNegTopic[0]} erzeugt höchste Unzufriedenheit`,
        evidence: `${topNegTopic[1]} negative Erwähnungen (${percentage}% aller negativen Kommentare)`,
        interpretation: `Das Thema "${topNegTopic[0]}" sorgt für die meisten negativen Reaktionen.`,
        action: `Content zu "${topNegTopic[0]}" überarbeiten und Value-Beweise erstellen.`,
        impact: topNegTopic[1] > 5 ? 'hoch' : 'mittel'
      });
    }

    // Insight 2: Unanswered questions backlog
    if (unansweredQuestions > 0) {
      insights.push({
        title: `Antwort-Backlog: ${unansweredQuestions} offene Fragen`,
        evidence: `${unansweredQuestions} Kommentare mit Fragestellung identifiziert`,
        interpretation: 'Fragen sollten schnell beantwortet werden, um Engagement zu erhöhen.',
        action: 'Quick-Reply-Sprint durchführen und SLA-Reminder aktivieren.',
        impact: unansweredQuestions > 10 ? 'hoch' : 'mittel'
      });
    }

    // Insight 3: Sales leads
    if (salesLeads > 0) {
      insights.push({
        title: `Lead-Potenzial: ${salesLeads} Kommentare mit Kaufabsicht`,
        evidence: `${salesLeads} Kommentare zeigen Interesse an Produkten/Services`,
        interpretation: 'Diese Kommentare bieten direktes Verkaufspotenzial.',
        action: 'DM-Follow-up-Vorlage nutzen und persönlich kontaktieren.',
        impact: 'hoch'
      });
    }

    // Insight 4: Toxicity alert
    const toxicCount = analyzedItems.filter(c => c.toxicity === 'severe').length;
    if (toxicCount > 0) {
      insights.push({
        title: `Toxizitäts-Warnung: ${toxicCount} schwere Fälle`,
        evidence: `${toxicCount} Kommentare mit schwerer Toxizität erkannt`,
        interpretation: 'Diese Kommentare erfordern sofortige Aufmerksamkeit und möglicherweise Moderation.',
        action: 'Toxische Kommentare prüfen, ggf. melden und Community-Richtlinien durchsetzen.',
        impact: 'hoch'
      });
    }

    // Insight 5: Sentiment trend
    const posPercentage = Math.round((summary.bySentiment.positive / summary.total) * 100);
    
    // Generate diagnostics
    const negPercentage = Math.round((summary.bySentiment.negative / summary.total) * 100);
    const posVsNeg = summary.bySentiment.positive / Math.max(summary.bySentiment.negative, 1);
    
    // Status: Mood
    let mood = 'Gemischt';
    if (posVsNeg >= 2) mood = 'Gut';
    else if (summary.bySentiment.negative >= summary.bySentiment.positive) mood = 'Kritisch';
    
    // Status: Risk
    let risk = 'Niedrig';
    const severeCount = analyzedItems.filter(c => c.toxicity === 'severe').length;
    if (severeCount >= 3 || unansweredQuestions >= 10) risk = 'Mittel';
    if (severeCount >= 3 && unansweredQuestions >= 10) risk = 'Hoch';
    
    // Status: Momentum (simplified - always stable without historical data)
    const momentum = 'stabil';
    
    // Key findings
    const keyFindings: string[] = [];
    if (negPercentage > 30) {
      keyFindings.push(`Negatives Sentiment bei ${negPercentage}% der Kommentare.`);
    }
    if (negativeByTopic.size > 0) {
      const topNegTopic = Array.from(negativeByTopic.entries()).sort((a, b) => b[1] - a[1])[0];
      const totalNeg = analyzedItems.filter(c => c.sentiment === 'negative').length;
      const percentage = Math.round((topNegTopic[1] / totalNeg) * 100);
      keyFindings.push(`Top-Thema '${topNegTopic[0]}' verursacht ${percentage}% der negativen Kommentare.`);
    }
    if (unansweredQuestions > 0) {
      keyFindings.push(`${unansweredQuestions} offene Fragen identifiziert.`);
    }
    
    // Quick wins
    const quickWins: string[] = [];
    if (unansweredQuestions > 0) {
      quickWins.push('SLA-Antwort-Sprint für offene Fragen starten (heute).');
    }
    if (salesLeads > 0) {
      quickWins.push(`DM-Follow-up an ${salesLeads} Sales-Leads senden (heute).`);
    }
    if (negativeByTopic.size > 0) {
      const topNegTopic = Array.from(negativeByTopic.entries()).sort((a, b) => b[1] - a[1])[0];
      quickWins.push(`Antwortvorlage für Thema "${topNegTopic[0]}" erstellen.`);
    }
    
    // Actions
    const actions: Array<{ title: string; impact: string; eta: string }> = [];
    if (negativeByTopic.size > 0) {
      const topNegTopic = Array.from(negativeByTopic.entries()).sort((a, b) => b[1] - a[1])[0];
      actions.push({
        title: `Carousel zu "${topNegTopic[0]}" mit Value-Beweisen erstellen`,
        impact: 'hoch',
        eta: '3 Tage'
      });
    }
    const questionCount = analyzedItems.filter(c => c.intent === 'question').length;
    if (questionCount > 5) {
      actions.push({
        title: 'Q&A-Highlight zu häufigen Fragen anlegen',
        impact: 'mittel',
        eta: 'heute'
      });
    }
    const bugCount = analyzedItems.filter(c => c.intent === 'bug_report').length;
    if (bugCount > 0) {
      actions.push({
        title: 'Status-Update zu Bug-Reports posten',
        impact: 'hoch',
        eta: '1 Tag'
      });
    }
    
    // Risks
    const risks: string[] = [];
    const mildCount = analyzedItems.filter(c => c.toxicity === 'mild').length;
    if (severeCount > 0) {
      risks.push(`${severeCount} Fälle schwerer Toxizität – Kommentare moderieren.`);
    } else if (mildCount > 0) {
      risks.push(`${mildCount} Fälle milder Toxizität – beobachten.`);
    }
    if (unansweredQuestions > 10) {
      risks.push('SLA-Risiko durch hohe Anzahl offener Fragen.');
    }
    
    // Experiments
    const experiments: string[] = [];
    if (posPercentage < 60) {
      experiments.push('Hook-Variante testen (Problem-first vs. Benefit-first), Ziel: +15% positive Reaktionen.');
    }
    
    const diagnostics = {
      status: { mood, risk, momentum },
      keyFindings,
      quickWins,
      actions,
      risks,
      experiments
    };

    return new Response(JSON.stringify({
      requestId,
      summary: {
        ...summary,
        deltaVsPrev: 0,
        unansweredQuestions,
        salesLeads
      },
      timeseries,
      heatmap,
      insights,
      diagnostics,
      items: analyzedItems,
      isFallback: useFallback,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    return new Response(JSON.stringify({ 
      error: 'Analysis failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      requestId
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
