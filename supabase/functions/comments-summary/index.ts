import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const requestId = crypto.randomUUID();

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "projectId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify project ownership
    const { data: project, error: projectError } = await supabaseClient
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: "Project not found or access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all comments with analysis
    const { data: comments, error: commentsError } = await supabaseClient
      .from("comments")
      .select(`
        id,
        text,
        username,
        status,
        comment_analysis (
          sentiment,
          intent,
          topics,
          toxicity,
          urgency
        )
      `)
      .eq("project_id", projectId)
      .order("ingested_at", { ascending: false })
      .limit(50);

    if (commentsError) throw commentsError;
    if (!comments || comments.length === 0) {
      return new Response(
        JSON.stringify({ 
          requestId,
          counts: { total: 0, positive: 0, neutral: 0, negative: 0 },
          positiveRate: 0,
          unansweredQuestions: 0,
          leadPotential: 0,
          toxicity: { none: 0, mild: 0, severe: 0 },
          topTopics: [],
          negativityDrivers: [],
          diagnostics: {
            mood: "Neutral",
            risk: "Niedrig",
            generalStatement: "Noch keine Daten vorhanden.",
            recommendations: [],
            quoteTargets: {
              positiveRateCurrent: 0,
              positiveRateTarget: 0.7,
              replyRateCurrent: 0,
              replyRateTarget: 0.9
            }
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate counts
    let positive = 0, neutral = 0, negative = 0;
    let unansweredQuestions = 0, leadPotential = 0;
    let toxicityNone = 0, toxicityMild = 0, toxicitySevere = 0;
    const topicCounts: Record<string, number> = {};
    const topicNegCounts: Record<string, number> = {};

    comments.forEach(c => {
      const analysis = c.comment_analysis?.[0];
      if (!analysis) return;

      // Sentiment
      if (analysis.sentiment === "positive") positive++;
      else if (analysis.sentiment === "neutral") neutral++;
      else if (analysis.sentiment === "negative") negative++;

      // Intent
      if (analysis.intent === "question" && c.status !== "replied") unansweredQuestions++;
      if (analysis.intent === "sales_lead") leadPotential++;

      // Toxicity
      if (analysis.toxicity === "none") toxicityNone++;
      else if (analysis.toxicity === "mild") toxicityMild++;
      else if (analysis.toxicity === "severe") toxicitySevere++;

      // Topics
      if (analysis.topics && Array.isArray(analysis.topics)) {
        analysis.topics.forEach((topic: string) => {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
          if (analysis.sentiment === "negative") {
            topicNegCounts[topic] = (topicNegCounts[topic] || 0) + 1;
          }
        });
      }
    });

    const total = comments.length;
    const positiveRate = positive + negative > 0 ? positive / (positive + negative) : 0;
    
    // Count questions for reply rate
    const totalQuestions = comments.filter(c => c.comment_analysis?.[0]?.intent === "question").length;
    const repliedQuestions = totalQuestions - unansweredQuestions;
    const replyRate = totalQuestions > 0 ? repliedQuestions / totalQuestions : 0;

    // Top topics
    const topTopics = Object.entries(topicCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([topic, count]) => ({ topic, count }));

    // Negativity drivers
    const negativityDrivers = Object.entries(topicNegCounts)
      .filter(([topic]) => topicCounts[topic] > 0)
      .map(([topic, negCount]) => ({
        topic,
        negShare: negCount / topicCounts[topic]
      }))
      .sort((a, b) => b.negShare - a.negShare)
      .slice(0, 5);

    // Diagnostics
    let mood = "Gemischt";
    if (positive >= 2 * negative) mood = "Gut";
    else if (negative >= positive) mood = "Kritisch";

    let risk = "Niedrig";
    if (toxicitySevere >= 1 || unansweredQuestions >= 5) risk = "Hoch";
    else if (toxicityMild >= 2 || (leadPotential >= 3 && unansweredQuestions > 0)) risk = "Mittel";

    // Generate recommendations via LLM
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let generalStatement = "Die Stimmung ist gemischt.";
    let recommendations: any[] = [];

    if (LOVABLE_API_KEY && comments.length > 0) {
      const summaryTexts = comments.slice(0, 20).map(c => c.text).join("\n");
      const systemPrompt = `Du bist ein Social-Media-Strategie-Experte. Fasse die Kommentare zusammen (max. 2 Sätze). Nenne das Top-Problem und was zu tun ist, um die Positive-Quote (aktuell ${(positiveRate * 100).toFixed(0)}%) und Antwort-Quote (aktuell ${(replyRate * 100).toFixed(0)}%) zu verbessern. Antworte präzise, umsetzungsorientiert, ohne Floskeln.

Dann gib 3 konkrete Handlungsempfehlungen im JSON-Format:
{
  "generalStatement": "...",
  "recommendations": [
    {"title": "...", "detail": "...", "impact": "hoch|mittel|niedrig", "eta": "heute|3 Tage|1 Woche"}
  ]
}`;

      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Stats: ${total} Kommentare, ${positive} positiv, ${negative} negativ, ${unansweredQuestions} offene Fragen, ${leadPotential} Leads.\n\nBeispiel-Kommentare:\n${summaryTexts}` }
            ],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const aiText = aiData.choices[0].message.content;
          const jsonMatch = aiText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            generalStatement = parsed.generalStatement || generalStatement;
            recommendations = parsed.recommendations || [];
          }
        }
      } catch (e) {
        console.error("LLM recommendation failed:", e);
      }
    }

    // Fallback recommendations if LLM failed
    if (recommendations.length === 0) {
      if (unansweredQuestions > 0) {
        recommendations.push({
          title: "Antwort-Sprint",
          detail: `Beantworte ${unansweredQuestions} offene Fragen noch heute.`,
          impact: "hoch",
          eta: "heute"
        });
      }
      if (negativityDrivers.length > 0) {
        const topDriver = negativityDrivers[0];
        recommendations.push({
          title: `${topDriver.topic}-Narrativ schärfen`,
          detail: "Post/Carousel mit konkreten Value-Beweisen & Vergleich.",
          impact: "hoch",
          eta: "3 Tage"
        });
      }
      if (leadPotential > 0) {
        recommendations.push({
          title: "Lead-Follow-ups",
          detail: `DM-Vorlage auf ${leadPotential} Leads anwenden.`,
          impact: "mittel",
          eta: "heute"
        });
      }
    }

    return new Response(
      JSON.stringify({
        requestId,
        counts: { total, positive, neutral, negative },
        positiveRate: parseFloat(positiveRate.toFixed(2)),
        unansweredQuestions,
        leadPotential,
        toxicity: { none: toxicityNone, mild: toxicityMild, severe: toxicitySevere },
        topTopics,
        negativityDrivers,
        diagnostics: {
          mood,
          risk,
          generalStatement,
          recommendations,
          quoteTargets: {
            positiveRateCurrent: parseFloat(positiveRate.toFixed(2)),
            positiveRateTarget: 0.7,
            replyRateCurrent: parseFloat(replyRate.toFixed(2)),
            replyRateTarget: 0.9
          }
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error creating summary:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
