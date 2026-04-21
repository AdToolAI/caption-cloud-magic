import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const TEST_USER_EMAIL = "ai-superuser@adtool-internal.test";
const TEST_USER_PASSWORD = "AiSuperuser_" + (Deno.env.get("SUPABASE_PROJECT_ID") || "test") + "_2026!Secure";

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface Scenario {
  name: string;
  category: "fast" | "slow";
  fn: string;
  body: Record<string, unknown> | ((ctx: TestContext) => Record<string, unknown>);
  expectedKeys?: string[];
  /** If true, skip if function does not exist (404) — treat as warning instead of fail */
  optional?: boolean;
  /** If set, the scenario passes when the response matches this expected failure (used for security-protected endpoints like signature-guarded webhooks) */
  expectFailure?: { status: number; bodyIncludes?: string };
}

interface TestContext {
  userId: string;
  userJwt: string;
  demoProjectId: string;
}

/**
 * Build the scenario list. `analyze-performance`/`analyze-hashtags` etc. need real data
 * which is seeded in setup phase. Tones are restricted to schema-compliant English enums.
 */
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
    body: {
      platform: "instagram",
      audience: "Fitness Enthusiasten",
      topic: "Personal Training",
      tone: "inspirational", // schema-compliant English enum
      language: "de", // output language stays German
    },
    expectedKeys: ["bios"],
  },
  {
    name: "Bio Generation (ES)",
    category: "fast",
    fn: "generate-bio",
    body: {
      platform: "instagram",
      audience: "Emprendedores digitales",
      topic: "Marketing digital",
      tone: "professional", // schema-compliant English enum
      language: "es",
    },
    expectedKeys: ["bios"],
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
    body: {
      // analyze-performance expects a `posts` array, not date range
      posts: [
        { engagement_rate: 0.07, caption_text: "Morning vibes ☕ #coffee #morning", provider: "instagram", posted_at: new Date(Date.now() - 2 * 86400000).toISOString() },
        { engagement_rate: 0.066, caption_text: "Quick workout routine 💪 #fitness", provider: "instagram", posted_at: new Date(Date.now() - 5 * 86400000).toISOString() },
        { engagement_rate: 0.079, caption_text: "Behind the scenes 🎬 #bts", provider: "instagram", posted_at: new Date(Date.now() - 7 * 86400000).toISOString() },
      ],
    },
  },
  {
    name: "Hashtag Analysis",
    category: "fast",
    fn: "analyze-hashtags",
    // schema only accepts { platform: string }, function reads metrics from DB
    body: { platform: "instagram" },
  },
  {
    name: "Posting Times Recommendation",
    category: "fast",
    fn: "analyze-posting-times",
    body: { platform: "instagram", timezone: "Europe/Berlin", niche: "fitness", goal: "engagement", language: "en" },
  },
  {
    name: "Image Generation",
    category: "slow",
    fn: "generate-studio-image",
    body: { prompt: "minimalist product shot of coffee cup on white background", style: "minimal", aspectRatio: "1:1", quality: "fast" },
  },
  {
    name: "Campaign Generation",
    category: "slow",
    fn: "generate-campaign",
    body: {
      goal: "awareness",
      topic: "fitness motivation",
      tone: "inspirational",
      audience: "young adults interested in fitness",
      durationWeeks: 1,
      platforms: ["instagram"],
      postFrequency: 3,
      language: "en",
    },
  },
  {
    name: "Comments Analysis",
    category: "fast",
    fn: "analyze-comments",
    body: (ctx) => ({ projectId: ctx.demoProjectId }),
  },
  // ─── Phase 2: System-Health Scenarios ───
  {
    name: "Trial Lifecycle Check",
    category: "fast",
    fn: "check-trial-status",
    body: { dry_run: true },
    optional: true,
  },
  {
    name: "Calendar Publish Dispatcher",
    category: "fast",
    fn: "calendar-publish-dispatcher",
    body: {},
    optional: true,
  },
  {
    name: "Stripe Webhook Reachability",
    category: "fast",
    fn: "stripe-webhook",
    body: { type: "ai_superuser_ping", _test: true },
    optional: true,
    // Webhook correctly rejects unsigned requests with HTTP 400 "No signature".
    // That proves the endpoint is reachable AND signature-protected → treat as pass.
    expectFailure: { status: 400, bodyIncludes: "No signature" },
  },
  {
    name: "Social Health Check",
    category: "fast",
    fn: "social-health",
    body: {},
    optional: true,
  },
  {
    name: "Consistency Watcher",
    category: "fast",
    fn: "consistency-watcher",
    body: {},
    optional: true,
  },
];

// ─────────────────────────────────────────────────────────────────────
// Setup Phase: Ensure test user exists with Enterprise wallet + demo data
// ─────────────────────────────────────────────────────────────────────
async function ensureTestUser(): Promise<TestContext> {
  // 1. Try to look up existing test user via profiles
  const { data: existingProfile } = await adminClient
    .from("profiles")
    .select("id")
    .eq("email", TEST_USER_EMAIL)
    .eq("is_test_account", true)
    .maybeSingle();

  let userId: string | undefined = existingProfile?.id;

  if (!userId) {
    console.log("[Superuser] Creating test user...");
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
      email_confirm: true,
      user_metadata: { is_ai_superuser: true, language: "en" },
    });
    if (createErr) {
      // Maybe user exists in auth but profile flag not set — try listing
      const { data: list } = await adminClient.auth.admin.listUsers();
      const found = list?.users.find((u) => u.email === TEST_USER_EMAIL);
      if (found) {
        userId = found.id;
        // Reset password so we can sign in
        await adminClient.auth.admin.updateUserById(userId, { password: TEST_USER_PASSWORD });
      } else {
        throw new Error(`Failed to create test user: ${createErr.message}`);
      }
    } else {
      userId = created.user!.id;
    }
  } else {
    // Always reset password to known value (in case it was rotated)
    await adminClient.auth.admin.updateUserById(userId, { password: TEST_USER_PASSWORD });
  }

  // 2. Ensure profile is flagged as test account + Enterprise plan
  await adminClient
    .from("profiles")
    .update({ is_test_account: true, plan: "enterprise" })
    .eq("id", userId);

  // 3. Ensure wallet has Enterprise plan with high credit balance
  await adminClient
    .from("wallets")
    .upsert(
      {
        user_id: userId,
        balance: 999_000_000,
        plan_code: "enterprise",
        monthly_credits: 999_000_000,
      },
      { onConflict: "user_id" },
    );

  // 4. Seed demo post_metrics (idempotent)
  await adminClient.rpc("seed_ai_superuser_demo_data", { _user_id: userId });

  // 4b. Seed demo project + comments (idempotent) for analyze-comments
  const DEMO_PROJECT_NAME = "AI Superuser Demo Project";
  const { data: existingProject } = await adminClient
    .from("projects")
    .select("id")
    .eq("user_id", userId)
    .eq("name", DEMO_PROJECT_NAME)
    .maybeSingle();

  let demoProjectId: string;
  if (existingProject?.id) {
    demoProjectId = existingProject.id;
  } else {
    const { data: newProject, error: projErr } = await adminClient
      .from("projects")
      .insert({ user_id: userId, name: DEMO_PROJECT_NAME })
      .select("id")
      .single();
    if (projErr || !newProject) throw new Error(`Failed to seed demo project: ${projErr?.message}`);
    demoProjectId = newProject.id;
  }

  // Ensure at least 2 demo comments exist for that project
  const { count: commentCount } = await adminClient
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("project_id", demoProjectId);

  if (!commentCount || commentCount < 2) {
    await adminClient.from("comments").insert([
      {
        project_id: demoProjectId,
        username: "test_user_1",
        text: "Love this content! When is the next post coming?",
        external_comment_id: "ai-superuser-demo-1",
        created_at_platform: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        project_id: demoProjectId,
        username: "test_user_2",
        text: "Great tips, very helpful 🙏",
        external_comment_id: "ai-superuser-demo-2",
        created_at_platform: new Date(Date.now() - 3600000).toISOString(),
      },
    ]);
  }

  // 5. Sign in to get a fresh JWT
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signInErr } = await userClient.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });
  if (signInErr || !signIn.session) {
    throw new Error(`Failed to sign in test user: ${signInErr?.message || "no session"}`);
  }

  return { userId: userId!, userJwt: signIn.session.access_token, demoProjectId };
}

async function hashSchema(obj: unknown): Promise<string> {
  if (!obj || typeof obj !== "object") return "primitive";
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const encoder = new TextEncoder();
  const data = encoder.encode(keys.join("|"));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
}

async function runScenario(scenario: Scenario, ctx: TestContext, triggeredBy: string): Promise<void> {
  const startTime = Date.now();
  const requestBody = typeof scenario.body === "function" ? scenario.body(ctx) : scenario.body;

  const { data: runRow } = await adminClient
    .from("ai_superuser_runs")
    .insert({
      scenario_name: scenario.name,
      status: "running",
      full_request_json: requestBody,
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
        // Use real user JWT for auth-protected functions
        "Authorization": `Bearer ${ctx.userJwt}`,
        "apikey": ANON_KEY,
        "X-AI-Superuser": "true",
      },
      body: JSON.stringify(requestBody),
    });

    httpStatus = response.status;
    const text = await response.text();
    try {
      responseData = JSON.parse(text);
    } catch {
      responseData = { raw: text.substring(0, 500) };
    }

    if (response.status === 404 && scenario.optional) {
      status = "warning";
      errorMessage = `Function '${scenario.fn}' not deployed (optional)`;
    } else if (scenario.expectFailure) {
      // Reachability check: pass when response matches the expected guarded failure
      const matchesStatus = response.status === scenario.expectFailure.status;
      const matchesBody = !scenario.expectFailure.bodyIncludes
        || text.toLowerCase().includes(scenario.expectFailure.bodyIncludes.toLowerCase());
      if (matchesStatus && matchesBody) {
        status = "pass";
        schemaHash = await hashSchema(responseData);
      } else {
        status = "fail";
        errorMessage = `Reachability check failed — expected HTTP ${scenario.expectFailure.status}`
          + (scenario.expectFailure.bodyIncludes ? ` with body containing "${scenario.expectFailure.bodyIncludes}"` : "")
          + `, got HTTP ${response.status}: ${text.substring(0, 200)}`;
      }
    } else if (!response.ok) {
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
    await adminClient
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

  console.log(`[Superuser] ${scenario.name}: ${status} (${latencyMs}ms) HTTP ${httpStatus}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "fast"; // 'fast' | 'full' | 'manual'
    const triggeredBy = body.triggeredBy || (mode === "full" ? "daily" : "cron");

    // Setup test user + auth (refreshes JWT each run)
    const ctx = await ensureTestUser();
    console.log(`[Superuser] Test user ready: ${ctx.userId}`);

    const scenarios = mode === "full" || mode === "manual"
      ? SCENARIOS
      : SCENARIOS.filter((s) => s.category === "fast");

    console.log(`[Superuser] Starting ${scenarios.length} scenarios in mode=${mode}`);

    // Run scenarios in parallel batches of 3
    const batchSize = 3;
    for (let i = 0; i < scenarios.length; i += batchSize) {
      const batch = scenarios.slice(i, i + batchSize);
      await Promise.all(batch.map((s) => runScenario(s, ctx, triggeredBy)));
    }

    // Aggregate result (last 60s)
    const { data: recentRuns } = await adminClient
      .from("ai_superuser_runs")
      .select("status")
      .gte("started_at", new Date(Date.now() - 120_000).toISOString());

    const summary = {
      total: recentRuns?.length || 0,
      passed: recentRuns?.filter((r) => r.status === "pass").length || 0,
      failed: recentRuns?.filter((r) => r.status === "fail").length || 0,
      warnings: recentRuns?.filter((r) => r.status === "warning").length || 0,
    };

    return new Response(JSON.stringify({ ok: true, mode, summary, testUserId: ctx.userId }), {
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
