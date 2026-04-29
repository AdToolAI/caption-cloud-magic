// Shared helper used across ALL expensive provider edge functions to detect
// QA test runs and decide whether to return a cached mock asset instead of
// burning real credits. Mounting this helper costs nothing if the caller is
// not a test user.
//
// Usage in any provider edge function (e.g. generate-hailuo-video):
//
//   import { resolveQaContext, returnMockOrContinue } from "../_shared/qaTestUser.ts";
//
//   const qa = await resolveQaContext(supabase, user.id, "ai-hailuo");
//   if (qa.shouldMock) {
//     return new Response(JSON.stringify(qa.mockResponse), { headers: corsHeaders });
//   }
//   // ... continue with real provider call

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type QaContext =
  | { isTestUser: false; shouldMock: false }
  | {
      isTestUser: true;
      shouldMock: boolean;
      missionId?: string;
      runId?: string;
      mockResponse?: any;
      reason: "no_active_run" | "provider_in_real_list" | "budget_exhausted" | "mocked";
    };

const ASSET_TYPE_BY_PROVIDER: Record<string, string> = {
  "ai-hailuo": "video",
  "ai-kling": "video",
  "ai-seedance": "video",
  "ai-wan": "video",
  "ai-luma": "video",
  "ai-sora": "video",
  "ai-pika": "video",
  "ai-vidu": "video",
  "ai-runway": "video",
  "ai-kling-omni": "video",
  "flux-pro": "image",
  "gemini-image": "image",
  "elevenlabs-tts": "voiceover",
  "stable-audio": "music",
  "minimax-music": "music",
  "hedra": "video",
};

const CATEGORY_BY_PROVIDER: Record<string, string> = {
  "ai-hailuo": "ai_video",
  "ai-kling": "ai_video",
  "ai-seedance": "ai_video",
  "ai-wan": "ai_video",
  "ai-luma": "ai_video",
  "ai-sora": "ai_video",
  "ai-pika": "ai_video",
  "ai-vidu": "ai_video",
  "ai-runway": "ai_video",
  "ai-kling-omni": "ai_video",
  "flux-pro": "ai_image",
  "gemini-image": "ai_image",
  "elevenlabs-tts": "voiceover",
  "stable-audio": "music",
  "minimax-music": "music",
  "hedra": "talking_head",
};

export async function resolveQaContext(
  supabase: SupabaseClient,
  userId: string,
  provider: string,
  estimatedCostCents = 100
): Promise<QaContext> {
  // 1) Is this user flagged as a QA test user?
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_test_user")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.is_test_user) {
    return { isTestUser: false, shouldMock: false };
  }

  // 2) Find current active QA run for this user (if any)
  const { data: activeRun } = await supabase
    .from("qa_test_runs")
    .select("id, mission_id, qa_missions(cost_real_providers, cost_cap_cents)")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!activeRun) {
    // QA user but no run active → always mock to avoid accidental burn
    return {
      isTestUser: true,
      shouldMock: true,
      mockResponse: buildMockResponse(provider),
      reason: "no_active_run",
    };
  }

  const mission: any = (activeRun as any).qa_missions ?? {};
  const allowedReal: string[] = mission.cost_real_providers ?? [];

  // 3) Provider not in this mission's real-list → mock
  if (!allowedReal.includes(provider)) {
    return {
      isTestUser: true,
      shouldMock: true,
      missionId: activeRun.mission_id ?? undefined,
      runId: activeRun.id,
      mockResponse: buildMockResponse(provider),
      reason: "mocked",
    };
  }

  // 4) Budget guard - check before allowing real spend
  const category = CATEGORY_BY_PROVIDER[provider] ?? "other";
  const { data: budgetOk } = await supabase.rpc("qa_check_budget", {
    _category: category,
    _amount_cents: estimatedCostCents,
  });

  if (!budgetOk) {
    return {
      isTestUser: true,
      shouldMock: true,
      missionId: activeRun.mission_id ?? undefined,
      runId: activeRun.id,
      mockResponse: buildMockResponse(provider),
      reason: "budget_exhausted",
    };
  }

  // 5) Real call allowed - record planned spend (will be reconciled on completion)
  await supabase.rpc("qa_record_spend", {
    _category: category,
    _amount_cents: estimatedCostCents,
  });

  return {
    isTestUser: true,
    shouldMock: false,
    missionId: activeRun.mission_id ?? undefined,
    runId: activeRun.id,
    reason: "provider_in_real_list",
  };
}

function buildMockResponse(provider: string): any {
  const assetType = ASSET_TYPE_BY_PROVIDER[provider] ?? "video";
  const mockUrls: Record<string, string> = {
    video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    image: "https://picsum.photos/seed/qamock/1024/1024",
    voiceover: "https://upload.wikimedia.org/wikipedia/commons/3/3d/Bird_Song.ogg",
    music: "https://upload.wikimedia.org/wikipedia/commons/3/3d/Bird_Song.ogg",
  };

  return {
    success: true,
    mock: true,
    provider,
    url: mockUrls[assetType],
    video_url: mockUrls[assetType],
    image_url: mockUrls[assetType],
    audio_url: mockUrls[assetType],
    duration: 5,
    width: 1280,
    height: 720,
    cost_cents: 0,
    qa_note: `Mocked response for QA test user (provider: ${provider})`,
  };
}

// Convenience wrapper: short-circuit at the start of a provider edge function
export async function maybeShortCircuit(
  req: Request,
  provider: string,
  estimatedCostCents = 100,
  corsHeaders: Record<string, string>
): Promise<Response | null> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return null;

    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    const userId = userData?.user?.id;
    if (!userId) return null;

    const ctx = await resolveQaContext(supabase, userId, provider, estimatedCostCents);
    if (ctx.isTestUser && ctx.shouldMock) {
      return new Response(JSON.stringify(ctx.mockResponse), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    return null;
  } catch (e) {
    console.error("[qaTestUser] maybeShortCircuit failed:", e);
    return null;
  }
}
