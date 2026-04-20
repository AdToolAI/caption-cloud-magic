import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface Scenario {
  name: string;
  category: "fast" | "slow";
  fn: string;
  body: Record<string, unknown>;
  expectedKeys?: string[];
}

const SCENARIOS: Scenario[] = [
  {
    name: "Caption Generation (EN)",
    category: "fast",
    fn: "generate-caption",
    body: { topic: "Morning coffee routine", platform: "instagram", tone: "casual", language: "en" },
    expectedKeys: ["caption"],
  },
  {
    name: "Bio Generation (DE)",
    category: "fast",
    fn: "generate-bio",
    body: { platform: "instagram", audience: "Fitness Enthusiasten", topic: "Personal Training", tone: "motivierend", language: "de" },
    expectedKeys: ["bios"],
  },
  {
    name: "Bio Generation (ES)",
    category: "fast",
    fn: "generate-bio",
    body: { platform: "instagram", audience: "Emprendedores", topic: "Marketing digital", tone: "profesional", language: "es" },
    expectedKeys: ["bios"],
  },
  {
    name: "Hooks Generation",
    category: "fast",
    fn: "generate-hooks",
    body: { topic: "Productivity tips", platform: "tiktok", tone: "energetic", language: "en", styles: ["question", "statistic"] },
    expectedKeys: ["hooks"],
  },
  {
    name: "Reel Script (30s)",
    category: "fast",
    fn: "generate-reel-script",
    body: { topic: "5 morning habits", duration: 30, style: "educational", hook: "Did you know?", language: "en" },
    expectedKeys: ["script"],
  },
  {
    name: "Trend Radar Fetch",
    category: "fast",
    fn: "fetch-trends",
    body: { platform: "instagram", language: "en", category: "general" },
  },
  {
    name: "Performance Analytics",
    category: "fast",
    fn: "analyze-performance",
    body: { startDate: new Date(Date.now() - 7 * 86400000).toISOString(), endDate: new Date().toISOString(), platform: "instagram" },
  },
  {
    name: "Hashtag Analysis",
    category: "fast",
    fn: "analyze-hashtags",
    body: { platform: "instagram", timeframe: "week" },
  },
  {
    name: "Posting Times Recommendation",
    category: "fast",
    fn: "analyze-posting-times",
    body: { platform: "instagram", timezone: "Europe/Berlin", niche: "fitness", goal: "engagement" },
  },
  {
    name: "Image Generation",
    category: "slow",
    fn: "generate-studio-image",
    body: { prompt: "minimalist product shot of coffee cup", style: "minimal", aspectRatio: "1:1" },
  },
  {
    name: "Comments Analysis",
    category: "fast",
    fn: "analyze-comments",
    body: {
      comments: [{ id: "test-1", text: "Love this content!" }, { id: "test-2", text: "When is the next post?" }],
      generateReplies: true,
      language: "en",
    },
  },
  {
    name: "Campaign Generation",
    category: "slow",
    fn: "generate-campaign",
    body: {
      title: "Test Campaign",
      goal: "awareness",
      topic: "fitness",
      tone: "energetic",
      platforms: ["instagram"],
      durationWeeks: 1,
      postFrequency: 3,
      language: "en",
    },
  },
];

async function hashSchema(obj: unknown): Promise<string> {
  if (!obj || typeof obj !== "object") return "primitive";
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const encoder = new TextEncoder();
  const data = encoder.encode(keys.join("|"));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
}

async function runScenario(scenario: Scenario, triggeredBy: string): Promise<void> {
  const startTime = Date.now();
  const { data: runRow } = await supabase
    .from("ai_superuser_runs")
    .insert({
      scenario_name: scenario.name,
      status: "running",
      full_request_json: scenario.body,
      triggered_by: triggeredBy,
    })
    .select("id")
    .single();

  const runId = runRow?.id;
  let status: "pass" | "fail" | "warning" = "pass";
  let httpStatus: number | null = null;
  let errorMessage: string | null = null;
  let responseData: unknown = null;
  let schemaHash: string | null = null;

  try {
    const url = `${SUPABASE_URL}/functions/v1/${scenario.fn}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        "X-AI-Superuser": "true",
      },
      body: JSON.stringify(scenario.body),
    });

    httpStatus = response.status;
    const text = await response.text();
    try {
      responseData = JSON.parse(text);
    } catch {
      responseData = { raw: text.substring(0, 500) };
    }

    if (!response.ok) {
      status = "fail";
      errorMessage = `HTTP ${response.status}: ${text.substring(0, 300)}`;
    } else {
      schemaHash = await hashSchema(responseData);
      if (scenario.expectedKeys && responseData && typeof responseData === "object") {
        const missing = scenario.expectedKeys.filter((k) => !(k in (responseData as Record<string, unknown>)));
        if (missing.length > 0) {
          status = "warning";
          errorMessage = `Missing expected keys: ${missing.join(", ")}`;
        }
      }
    }
  } catch (err) {
    status = "fail";
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  const latencyMs = Date.now() - startTime;

  if (runId) {
    await supabase
      .from("ai_superuser_runs")
      .update({
        status,
        latency_ms: latencyMs,
        http_status: httpStatus,
        error_message: errorMessage,
        response_schema_hash: schemaHash,
        full_response_json: responseData,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
  }

  console.log(`[Superuser] ${scenario.name}: ${status} (${latencyMs}ms)`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "fast"; // 'fast' | 'full' | 'manual'
    const triggeredBy = body.triggeredBy || (mode === "full" ? "daily" : "cron");

    const scenarios = mode === "full" || mode === "manual"
      ? SCENARIOS
      : SCENARIOS.filter((s) => s.category === "fast");

    console.log(`[Superuser] Starting ${scenarios.length} scenarios in mode=${mode}`);

    // Run scenarios in parallel batches of 3 to avoid overwhelming the system
    const batchSize = 3;
    for (let i = 0; i < scenarios.length; i += batchSize) {
      const batch = scenarios.slice(i, i + batchSize);
      await Promise.all(batch.map((s) => runScenario(s, triggeredBy)));
    }

    // Aggregate result
    const { data: recentRuns } = await supabase
      .from("ai_superuser_runs")
      .select("status")
      .gte("started_at", new Date(Date.now() - 60000).toISOString());

    const summary = {
      total: recentRuns?.length || 0,
      passed: recentRuns?.filter((r) => r.status === "pass").length || 0,
      failed: recentRuns?.filter((r) => r.status === "fail").length || 0,
      warnings: recentRuns?.filter((r) => r.status === "warning").length || 0,
    };

    return new Response(JSON.stringify({ ok: true, mode, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Superuser] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
