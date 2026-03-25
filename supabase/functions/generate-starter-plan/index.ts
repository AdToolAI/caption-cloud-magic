import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const postingStats: Record<string, { times: string[]; peak: string }> = {
  instagram: { times: ["Wednesday 19:00-21:00", "Friday 18:00-20:00", "Sunday 10:00-12:00"], peak: "evening" },
  tiktok: { times: ["Thursday 17:00-19:00", "Saturday 11:00-13:00", "Sunday 20:00-22:00"], peak: "afternoon-evening" },
  linkedin: { times: ["Tuesday 08:00-10:00", "Wednesday 09:00-11:00", "Thursday 12:00-13:00"], peak: "morning-midday" },
  facebook: { times: ["Wednesday 13:00-16:00", "Thursday 12:00-15:00", "Friday 13:00-16:00"], peak: "midday-afternoon" },
  x: { times: ["Monday 12:00-13:00", "Wednesday 12:00-13:00", "Friday 09:00-10:00"], peak: "midday" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Not authenticated");

    const { niche, business_type, platforms, posting_goal, posts_per_week, experience_level } = await req.json();

    // Build platform timing context
    const platformTimings = (platforms || [])
      .filter((p: string) => postingStats[p])
      .map((p: string) => `${p}: Best times ${postingStats[p].times.join(", ")} (peak: ${postingStats[p].peak})`)
      .join("\n");

    // Calculate dates for next 7 days
    const today = new Date();
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return { date: d.toISOString().split("T")[0], dayOfWeek: d.getDay(), dayName: d.toLocaleDateString("en", { weekday: "long" }) };
    });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `You are a social media strategist. Generate exactly ${posts_per_week} post suggestions for a new user.

User profile:
- Niche: ${niche}
- Business type: ${business_type}
- Platforms: ${(platforms || []).join(", ")}
- Goal: ${posting_goal}
- Experience: ${experience_level}

Optimal posting times per platform:
${platformTimings}

Available dates (next 7 days):
${weekDates.map(d => `${d.dayName} ${d.date} (dayOfWeek: ${d.dayOfWeek})`).join("\n")}

Generate ${posts_per_week} posts spread across the week. Each post should use one of the user's chosen platforms and align with optimal posting times.

For each post provide:
- day_of_week (0=Sunday, 1=Monday...6=Saturday)
- suggested_date (YYYY-MM-DD from available dates)
- suggested_time (HH:MM in 24h format, matching optimal times)
- platform (one of the user's platforms)
- content_idea (concrete post idea specific to their niche, 1-2 sentences, in the user's likely language based on niche context)
- tips (actionable tip for this specific post to maximize engagement, 1-2 sentences)`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a social media expert. Return structured data only." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_starter_plan",
            description: "Create a weekly starter plan with post suggestions",
            parameters: {
              type: "object",
              properties: {
                posts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      day_of_week: { type: "integer" },
                      suggested_date: { type: "string" },
                      suggested_time: { type: "string" },
                      platform: { type: "string" },
                      content_idea: { type: "string" },
                      tips: { type: "string" },
                    },
                    required: ["day_of_week", "suggested_date", "suggested_time", "platform", "content_idea", "tips"],
                  },
                },
              },
              required: ["posts"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "create_starter_plan" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const { posts } = JSON.parse(toolCall.function.arguments);

    // Delete old starter plans for this user
    await supabase.from("starter_week_plans").delete().eq("user_id", user.id);

    // Insert new plans
    const rows = posts.map((p: any) => ({
      user_id: user.id,
      day_of_week: p.day_of_week,
      suggested_date: p.suggested_date,
      suggested_time: p.suggested_time,
      platform: p.platform,
      content_idea: p.content_idea,
      tips: p.tips,
      status: "suggested",
    }));

    const { data: insertedPlans, error: insertError } = await supabase
      .from("starter_week_plans")
      .insert(rows)
      .select();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, plans: insertedPlans }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-starter-plan error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
