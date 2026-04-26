// Motion Studio Superuser — fokussierter E2E-Test-Bot für die Composer-Pipeline.
// Mirrors the architecture of ai-superuser-test-runner but tests ONLY motion-studio paths.

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

const MODULE_NAME = "motion-studio";

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface TestContext {
  userId: string;
  userJwt: string;
  testProjectId: string;
  testSceneId: string | null;
}

interface Scenario {
  name: string;
  category: "fast" | "slow";
  /** When set, scenario calls a Supabase edge function */
  fn?: string;
  /** When set, scenario performs a custom DB/logic check */
  custom?: (ctx: TestContext) => Promise<{ ok: boolean; message?: string; data?: unknown }>;
  body?: Record<string, unknown> | ((ctx: TestContext) => Record<string, unknown> | Promise<Record<string, unknown>>);
  expectedKeys?: string[];
  /** If true, status<500 is OK (reachability check) */
  expectReachable?: boolean;
  /** If set, missing env var → warning instead of fail */
  secretEnv?: string;
  /** If true, function not deployed (404) → warning instead of fail */
  optional?: boolean;
}

// ============================================================================
// SCENARIOS — 18 motion-studio specific tests
// ============================================================================

const SCENARIOS: Scenario[] = [
  // -------- Phase 1: Pipeline Setup (Smoke) --------
  {
    name: "MS-1: Project Create",
    category: "fast",
    custom: async (ctx) => {
      const { data, error } = await adminClient
        .from("composer_projects")
        .select("id, briefing, category, video_mode")
        .eq("id", ctx.testProjectId)
        .maybeSingle();
      if (error) return { ok: false, message: error.message };
      if (!data) return { ok: false, message: "Test project not found" };
      return { ok: true, data: { id: data.id, category: data.category } };
    },
  },
  {
    name: "MS-2: Briefing Schema Validation",
    category: "fast",
    custom: async (ctx) => {
      const { data } = await adminClient
        .from("composer_projects")
        .select("briefing")
        .eq("id", ctx.testProjectId)
        .single();
      const briefing = data?.briefing as Record<string, unknown> | null;
      if (!briefing) return { ok: false, message: "Briefing missing" };
      const required = ["topic", "audience", "tone"];
      const missing = required.filter((k) => !briefing[k]);
      if (missing.length > 0) return { ok: false, message: `Missing briefing fields: ${missing.join(", ")}` };
      return { ok: true, data: briefing };
    },
  },
  {
    name: "MS-3: Auto-Director Compose",
    category: "fast",
    fn: "auto-director-compose",
    body: () => ({
      stage: "plan",
      idea: "Premium coffee subscription launch for urban professionals",
      mood: "cinematic",
      targetDurationSec: 15,
      enginePreference: "auto",
      language: "en",
    }),
    expectedKeys: ["scenes"],
  },

  // -------- Phase 2: Asset Generation --------
  {
    name: "MS-4: Scene Image Generation",
    category: "slow",
    fn: "generate-composer-image-scene",
    body: (ctx) => ({
      sceneId: ctx.testSceneId ?? "00000000-0000-0000-0000-000000000000",
      prompt: "Cinematic close-up of a steaming espresso cup on dark marble, golden hour lighting",
      aspectRatio: "16:9",
    }),
    expectedKeys: ["imageUrl"],
    secretEnv: "REPLICATE_API_KEY",
  },
  {
    name: "MS-5: Stock Media Bucket Health",
    category: "fast",
    custom: async () => {
      const { data, error } = await adminClient.storage.listBuckets();
      if (error) return { ok: false, message: error.message };
      // Real existing composer buckets in this project
      const required = ["composer-uploads", "composer-frames", "composer-nle-exports"];
      const present = data?.map((b) => b.name) ?? [];
      const missing = required.filter((r) => !present.includes(r));
      if (missing.length > 0) {
        return { ok: false, message: `Missing buckets: ${missing.join(", ")}` };
      }
      return { ok: true, data: { required, totalBuckets: present.length } };
    },
  },
  {
    name: "MS-6: Music Library Bucket Health",
    category: "fast",
    custom: async () => {
      const { data, error } = await adminClient.storage.listBuckets();
      if (error) return { ok: false, message: error.message };
      const audioBuckets = data?.filter((b) =>
        ["voiceover-audio", "background-music", "audio-assets", "audio-studio"].includes(b.name),
      );
      return (audioBuckets?.length ?? 0) > 0
        ? { ok: true, data: { audioBuckets: audioBuckets!.map((b) => b.name) } }
        : { ok: false, message: "No audio bucket present" };
    },
  },
  {
    name: "MS-7: Talking Head (Hedra) Reachability",
    category: "slow",
    fn: "generate-talking-head",
    body: () => ({
      imageUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=512",
      text: "Test motion studio talking head reachability",
      voiceId: "EXAVITQu4vr4xnSDxMaL",
      aspectRatio: "9:16",
      resolution: "480p",
    }),
    expectReachable: true,
    secretEnv: "REPLICATE_API_KEY",
  },
  {
    name: "MS-8: Trending Templates Available",
    category: "fast",
    custom: async () => {
      const { data, error, count } = await adminClient
        .from("composer_template_suggestions")
        .select("id, title, category", { count: "exact" })
        .eq("is_public", true)
        .limit(5);
      if (error) return { ok: false, message: error.message };
      if (!data || data.length === 0) {
        return { ok: false, message: "No public template suggestions found — aggregator may need to run" };
      }
      return { ok: true, data: { totalPublic: count, sample: data.slice(0, 3) } };
    },
  },

  // -------- Phase 3: Brand & Reframe --------
  {
    name: "MS-9: Brand Consistency Analysis",
    category: "fast",
    fn: "analyze-brand-consistency",
    body: async (ctx) => {
      // Look up the test user's brand kit (seeded in setup)
      const { data: kit } = await adminClient
        .from("brand_kits")
        .select("id")
        .eq("user_id", ctx.userId)
        .limit(1)
        .maybeSingle();
      return {
        brandKitId: kit?.id ?? "00000000-0000-0000-0000-000000000000",
        contentType: "caption",
        contentId: ctx.testProjectId,
        content: "Premium coffee. Crafted for the bold. Subscribe today and elevate every morning.",
      };
    },
    expectReachable: true,
  },
  {
    name: "MS-10: Brand Voice Analysis",
    category: "fast",
    fn: "analyze-brand-voice",
    body: async (ctx) => {
      const { data: kit } = await adminClient
        .from("brand_kits")
        .select("id")
        .eq("user_id", ctx.userId)
        .limit(1)
        .maybeSingle();
      return {
        brandKitId: kit?.id ?? "00000000-0000-0000-0000-000000000000",
        samples: [
          { text: "Premium coffee. Crafted for the bold.", platform: "instagram" },
          { text: "Wake up to greatness. Every morning, redefined.", platform: "instagram" },
          { text: "Your daily ritual deserves better.", platform: "tiktok" },
        ],
        language: "en",
      };
    },
    expectReachable: true,
  },
  {
    name: "MS-11: Smart Reframe (analyze-scene-subject)",
    category: "fast",
    fn: "analyze-scene-subject",
    body: (ctx) => ({
      projectId: ctx.testProjectId,
      sourceAspect: "16:9",
      targetAspect: "9:16",
    }),
    expectReachable: true,
    optional: true,
  },
  {
    name: "MS-12: Reframe Fallback Hardening",
    category: "fast",
    fn: "analyze-scene-subject",
    body: () => ({
      projectId: "00000000-0000-0000-0000-000000000000",
      sourceAspect: "16:9",
      targetAspect: "9:16",
    }),
    expectReachable: true,
    optional: true,
  },

  // -------- Phase 4: Render & Export --------
  {
    name: "MS-13: Render Lambda Bundle Verification",
    category: "fast",
    custom: async () => {
      const siteUrl = Deno.env.get("REMOTION_SERVE_URL") || Deno.env.get("REMOTION_SITE_URL");
      if (!siteUrl) {
        return { ok: false, message: "REMOTION_SERVE_URL/SITE_URL not configured" };
      }
      try {
        const resp = await fetch(siteUrl, { method: "HEAD" });
        if (resp.status >= 500) {
          return { ok: false, message: `Bundle URL unhealthy: HTTP ${resp.status}` };
        }
        return { ok: true, data: { siteUrl, status: resp.status } };
      } catch (e) {
        return { ok: false, message: `Bundle fetch failed: ${(e as Error).message}` };
      }
    },
  },
  {
    name: "MS-14: Render Composer (small E2E)",
    category: "slow",
    fn: "render-with-remotion",
    body: (ctx) => ({
      projectId: ctx.testProjectId,
      compositionId: "SmokeTestVideo",
      durationInFrames: 90,
      framesPerLambda: 270,
    }),
    expectReachable: true,
    optional: true,
    secretEnv: "AWS_LAMBDA_REMOTION_FUNCTION",
  },
  {
    name: "MS-15: Multi-Format Export Pipeline",
    category: "slow",
    fn: "render-multi-format-batch",
    body: (ctx) => ({
      projectId: ctx.testProjectId,
      presets: [
        { key: "ig-reels", platform: "instagram", aspect: "9:16", width: 1080, height: 1920 },
        { key: "ig-feed", platform: "instagram", aspect: "1:1", width: 1080, height: 1080 },
      ],
    }),
    expectReachable: true,
  },
  {
    name: "MS-16: NLE Export FCPXML",
    category: "fast",
    fn: "composer-export-fcpxml",
    body: (ctx) => ({ projectId: ctx.testProjectId }),
    expectReachable: true,
  },
  {
    name: "MS-17: NLE Export EDL",
    category: "fast",
    fn: "composer-export-edl",
    body: (ctx) => ({ projectId: ctx.testProjectId }),
    expectReachable: true,
  },

  // -------- Phase 5: Integrity --------
  {
    name: "MS-18: Orphan Scene Drift Check",
    category: "fast",
    custom: async () => {
      const { count, error: cntErr } = await adminClient
        .from("composer_scenes")
        .select("id", { count: "exact", head: true })
        .is("project_id", null);
      if (cntErr) return { ok: false, message: cntErr.message };
      if ((count ?? 0) > 0) {
        return { ok: false, message: `Found ${count} orphaned scenes (project_id NULL)` };
      }
      return { ok: true, data: { orphans: 0 } };
    },
  },
];

// ============================================================================
// SETUP — test user + test project
// ============================================================================

async function ensureTestUser(): Promise<{ userId: string; userJwt: string }> {
  const { data: existingUserRes } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 });
  let userId = existingUserRes?.users?.find((u) => u.email === TEST_USER_EMAIL)?.id;

  if (!userId) {
    const { data: created, error } = await adminClient.auth.admin.createUser({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
      email_confirm: true,
    });
    if (error || !created.user) throw new Error(`Failed to create test user: ${error?.message}`);
    userId = created.user.id;
  } else {
    await adminClient.auth.admin.updateUserById(userId, { password: TEST_USER_PASSWORD });
  }

  await adminClient.from("profiles").update({ is_test_account: true, plan: "enterprise" }).eq("id", userId);
  await adminClient.from("wallets").upsert(
    { user_id: userId, balance: 999_000_000, plan_code: "enterprise", monthly_credits: 999_000_000 },
    { onConflict: "user_id" },
  );

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signInErr } = await userClient.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });
  if (signInErr || !signIn.session) throw new Error(`Sign in failed: ${signInErr?.message}`);

  return { userId, userJwt: signIn.session.access_token };
}

async function ensureTestProject(userId: string): Promise<{ projectId: string; sceneId: string | null }> {
  const { data: existing } = await adminClient
    .from("composer_projects")
    .select("id")
    .eq("user_id", userId)
    .eq("is_test_run", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let projectId: string;
  if (existing?.id) {
    projectId = existing.id;
  } else {
    const { data: created, error } = await adminClient
      .from("composer_projects")
      .insert({
        user_id: userId,
        title: "[Motion Studio Superuser] Test Project",
        category: "product-ad",
        video_mode: "video",
        is_test_run: true,
        briefing: {
          topic: "Premium coffee subscription launch",
          audience: "Urban professionals 25-40",
          tone: "energetic",
          platform: "instagram",
          duration: 15,
          aspect: "9:16",
        },
        storyboard: [],
        assembly_config: { aspect: "9:16", fps: 30 },
        smart_reframe_enabled: true,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(`Failed to create test project: ${error?.message}`);
    projectId = created.id;
  }

  const { data: scene } = await adminClient
    .from("composer_scenes")
    .select("id")
    .eq("project_id", projectId)
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();

  let sceneId: string | null = scene?.id ?? null;
  if (!sceneId) {
    const { data: newScene } = await adminClient
      .from("composer_scenes")
      .insert({
        project_id: projectId,
        order_index: 0,
        scene_type: "intro",
        duration_seconds: 3,
        clip_source: "ai-image",
        ai_prompt: "Cinematic espresso cup on marble",
        clip_status: "pending",
      })
      .select("id")
      .single();
    sceneId = newScene?.id ?? null;
  }

  return { projectId, sceneId };
}

// ============================================================================
// RUNNER
// ============================================================================

async function hashSchema(obj: unknown): Promise<string> {
  if (!obj || typeof obj !== "object") return "primitive";
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const data = new TextEncoder().encode(keys.join("|"));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 16);
}

async function runScenario(scenario: Scenario, ctx: TestContext, triggeredBy: string): Promise<void> {
  const startTime = Date.now();
  const requestBody =
    typeof scenario.body === "function" ? await scenario.body(ctx) : (scenario.body ?? null);

  const { data: runRow } = await adminClient
    .from("ai_superuser_runs")
    .insert({
      scenario_name: scenario.name,
      status: "running",
      module: MODULE_NAME,
      full_request_json: requestBody ?? {},
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
  let renderUrl: string | null = null;

  if (scenario.secretEnv && !Deno.env.get(scenario.secretEnv)) {
    status = "warning";
    errorMessage = `${scenario.secretEnv} not configured — skipped`;
  } else {
    try {
      if (scenario.custom) {
        const result = await scenario.custom(ctx);
        responseData = result.data ?? null;
        if (result.ok) {
          status = "pass";
          schemaHash = await hashSchema(responseData);
        } else {
          status = "fail";
          errorMessage = result.message ?? "Custom check failed";
        }
      } else if (scenario.fn) {
        const url = `${SUPABASE_URL}/functions/v1/${scenario.fn}`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ctx.userJwt}`,
            apikey: ANON_KEY,
            "X-AI-Superuser": "true",
          },
          body: JSON.stringify(requestBody ?? {}),
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
        } else if (scenario.expectReachable) {
          if (response.status < 500) {
            status = "pass";
            schemaHash = await hashSchema(responseData);
          } else {
            status = scenario.optional ? "warning" : "fail";
            errorMessage = `Endpoint unreachable — HTTP ${response.status}: ${text.substring(0, 200)}`;
          }
        } else if (!response.ok) {
          status = scenario.optional ? "warning" : "fail";
          errorMessage = `HTTP ${response.status}: ${text.substring(0, 300)}`;
        } else {
          schemaHash = await hashSchema(responseData);
          if (scenario.expectedKeys && responseData && typeof responseData === "object") {
            const missing = scenario.expectedKeys.filter(
              (k) => !(k in (responseData as Record<string, unknown>)),
            );
            if (missing.length > 0) {
              status = "warning";
              errorMessage = `Missing expected keys: ${missing.join(", ")}`;
            }
          }
        }

        const rd = responseData as Record<string, unknown> | null;
        if (rd && typeof rd === "object") {
          renderUrl = (rd.outputUrl ?? rd.videoUrl ?? rd.renderUrl ?? null) as string | null;
        }
      } else {
        status = "fail";
        errorMessage = "Scenario has no fn or custom handler";
      }
    } catch (err) {
      status = "fail";
      errorMessage = err instanceof Error ? err.message : String(err);
    }
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
        render_url: renderUrl,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
  }

  console.log(`[MS-Superuser] ${scenario.name}: ${status} (${latencyMs}ms)`);
}

// ============================================================================
// CLEANUP — keep at most 1 test project per user; delete >1h-old extras
// ============================================================================

async function cleanupOldTestProjects(userId: string, keepProjectId: string): Promise<number> {
  const { data: extras, error } = await adminClient
    .from("composer_projects")
    .select("id")
    .eq("user_id", userId)
    .eq("is_test_run", true)
    .neq("id", keepProjectId)
    .lt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

  if (error || !extras || extras.length === 0) return 0;

  const ids = extras.map((p) => p.id);
  await adminClient.from("composer_projects").delete().in("id", ids);
  return ids.length;
}

// ============================================================================
// HTTP HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "fast"; // 'fast' | 'full'
    const triggeredBy = body.triggeredBy || "manual";

    const { userId, userJwt } = await ensureTestUser();
    const { projectId, sceneId } = await ensureTestProject(userId);

    const ctx: TestContext = { userId, userJwt, testProjectId: projectId, testSceneId: sceneId };
    console.log(`[MS-Superuser] Ready — user=${userId}, project=${projectId}, mode=${mode}`);

    const scenarios = mode === "full" ? SCENARIOS : SCENARIOS.filter((s) => s.category === "fast");

    const batchSize = 3;
    for (let i = 0; i < scenarios.length; i += batchSize) {
      const batch = scenarios.slice(i, i + batchSize);
      await Promise.all(batch.map((s) => runScenario(s, ctx, triggeredBy)));
    }

    const cleaned = await cleanupOldTestProjects(userId, projectId);

    const { data: recentRuns } = await adminClient
      .from("ai_superuser_runs")
      .select("status")
      .eq("module", MODULE_NAME)
      .gte("started_at", new Date(Date.now() - 600_000).toISOString());

    const summary = {
      total: recentRuns?.length || 0,
      passed: recentRuns?.filter((r) => r.status === "pass").length || 0,
      failed: recentRuns?.filter((r) => r.status === "fail").length || 0,
      warnings: recentRuns?.filter((r) => r.status === "warning").length || 0,
      cleanedUpProjects: cleaned,
    };

    return new Response(
      JSON.stringify({ ok: true, mode, summary, testProjectId: projectId, testUserId: userId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[MS-Superuser] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
