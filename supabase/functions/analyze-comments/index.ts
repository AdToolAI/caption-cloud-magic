import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
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

    const { projectId } = await req.json();
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

    // Get all comments for this project that need analysis
    const { data: comments, error: commentsError } = await supabaseClient
      .from("comments")
      .select(`
        id,
        text,
        username,
        created_at_platform,
        comment_analysis (
          comment_id,
          updated_at
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
          message: "Keine Kommentare zu analysieren",
          analyzed: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter comments that need analysis (no analysis or older than 24h)
    const now = new Date();
    const commentsToAnalyze = comments.filter(c => {
      if (!c.comment_analysis || c.comment_analysis.length === 0) return true;
      const analysis = c.comment_analysis[0];
      const updatedAt = new Date(analysis.updated_at);
      const hoursSince = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);
      return hoursSince > 24;
    });

    if (commentsToAnalyze.length === 0) {
      return new Response(
        JSON.stringify({ 
          requestId,
          message: "Alle Kommentare bereits aktuell analysiert",
          analyzed: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Batch analysis via Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const batchTexts = commentsToAnalyze.map(c => c.text).join("\n---\n");
    const systemPrompt = `Du bist ein Social-Media-Analyse-Experte. Analysiere jeden Kommentar einzeln und gib für jeden eine strukturierte JSON-Antwort zurück.

Für jeden Kommentar bestimme:
- language (de/en/es/fr/it/etc.)
- sentiment (positive/neutral/negative)
- intent (praise/complaint/question/feature_request/bug_report/spam/sales_lead/other)
- topics (Array von 1-3 Hauptthemen)
- toxicity (none/mild/severe)
- urgency (low/medium/high)
- priority_score (0-100)
- action (reply/escalate_support/ignore_block/follow_up_dm)

Antworte NUR mit einem JSON-Array mit genau ${commentsToAnalyze.length} Objekten.`;

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
          { role: "user", content: `Analysiere diese ${commentsToAnalyze.length} Kommentare:\n\n${batchTexts}` }
        ],
      }),
    });

    if (!aiResponse.ok) {
      console.error("AI gateway error:", await aiResponse.text());
      throw new Error("AI analysis failed");
    }

    const aiData = await aiResponse.json();
    const aiText = aiData.choices[0].message.content;
    
    // Parse AI response
    let analyses: any[];
    try {
      const jsonMatch = aiText.match(/\[[\s\S]*\]/);
      analyses = JSON.parse(jsonMatch ? jsonMatch[0] : aiText);
    } catch (e) {
      console.error("Failed to parse AI response:", aiText);
      throw new Error("Invalid AI response format");
    }

    // Store analyses
    let analyzed = 0;
    for (let i = 0; i < Math.min(commentsToAnalyze.length, analyses.length); i++) {
      const comment = commentsToAnalyze[i];
      const analysis = analyses[i];

      await supabaseClient
        .from("comment_analysis")
        .upsert({
          comment_id: comment.id,
          language: analysis.language || "de",
          sentiment: analysis.sentiment || "neutral",
          intent: analysis.intent || "other",
          topics: analysis.topics || [],
          toxicity: analysis.toxicity || "none",
          urgency: analysis.urgency || "low",
          priority_score: analysis.priority_score || 50,
          action: analysis.action || "reply",
          updated_at: now.toISOString(),
        }, {
          onConflict: "comment_id"
        });
      
      analyzed++;
    }

    return new Response(
      JSON.stringify({
        requestId,
        analyzed,
        message: `${analyzed} Kommentare analysiert`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error analyzing comments:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
