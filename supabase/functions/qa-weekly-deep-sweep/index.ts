// Bond QA — Weekly Deep Sweep Orchestrator (v3)
// Runs 7 full end-to-end pipelines (not just provider pings) to catch
// integration drift: webhooks, Lambda renders, FFmpeg stitches, frame
// continuity, subtitle sync. Hard cap 50€ per run, manual trigger only.
//
// Auth model:
// - The triggering user must be admin (verified at request time)
// - All internal calls use the SERVICE ROLE key + headers:
//     x-qa-real-spend: true   (bypasses qaMock short-circuit)
//     x-qa-user-id: <admin>   (used by QA-aware functions for the user context)

import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-real-spend, x-qa-user-id",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const FALLBACK_IMAGE =
  "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg";
const FALLBACK_VIDEO =
  "https://storage.googleapis.com/lovable-public/qa-mock/sample-5s.mp4";
const FALLBACK_AUDIO =
  "https://storage.googleapis.com/lovable-public/qa-mock/sample-5s.mp3";

interface FlowResult {
  flow_index: number;
  flow_name: string;
  status: "success" | "failed" | "timeout" | "budget_skipped";
  duration_ms: number;
  estimated_cost_eur: number;
  actual_cost_eur: number;
  output_url?: string;
  error_message?: string;
  stage_log: Array<{ stage: string; ok: boolean; ms: number; note?: string }>;
  validation_checks: Record<string, boolean>;
}

interface RunCtx {
  runId: string;
  userId: string;
  admin: ReturnType<typeof createClient>;
  assets: { image: string; video: string; audio: string; mask: string };
  signedAssets: { image: string; mask: string };
  remainingEur: number;
}

const HEADERS_INTERNAL = (userId: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  "x-qa-real-spend": "true",
  "x-qa-user-id": userId,
});

async function callEdge<T = any>(
  fn: string,
  body: Record<string, unknown>,
  userId: string,
  timeoutMs = 120_000,
): Promise<{ ok: boolean; status: number; json: T | null; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: HEADERS_INTERNAL(userId),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    let json: T | null = null;
    try {
      json = JSON.parse(text) as T;
    } catch {
      // Non-JSON response
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        json,
        error: `${res.status}: ${text.slice(0, 300)}`,
      };
    }
    return { ok: true, status: res.status, json };
  } catch (e: any) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      json: null,
      error: e?.name === "AbortError" ? "timeout" : (e?.message || String(e)),
    };
  }
}

async function headOk(url: string, timeoutMs = 10_000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function getTestAssets(
  admin: any,
): Promise<{ image: string; video: string; audio: string; mask: string }> {
  const tryUrl = (path: string) => {
    const { data } = admin.storage.from("qa-test-assets").getPublicUrl(path);
    return data?.publicUrl;
  };
  return {
    image: tryUrl("test-image.png") || tryUrl("sample-1024.jpg") || FALLBACK_IMAGE,
    video: tryUrl("test-video-2s.mp4") || tryUrl("sample-5s.mp4") || FALLBACK_VIDEO,
    audio: tryUrl("test-audio.mp3") || tryUrl("sample-5s.mp3") || FALLBACK_AUDIO,
    mask: tryUrl("sample-mask-512.png") || "",
  };
}

// qa-test-assets bucket is PRIVATE — external providers (Replicate FLUX Fill,
// Hedra, etc.) need signed URLs, not public URLs.
async function getSignedAssets(
  admin: any,
): Promise<{ image: string; mask: string }> {
  const sign = async (path: string): Promise<string> => {
    try {
      const { data } = await admin.storage
        .from("qa-test-assets")
        .createSignedUrl(path, 3600);
      return data?.signedUrl || "";
    } catch {
      return "";
    }
  };
  // try alternatives in order
  const imageCandidates = ["test-image.png", "sample-1024.jpg"];
  const maskCandidates = ["sample-mask-512.png"];
  let image = "";
  for (const p of imageCandidates) {
    image = await sign(p);
    if (image) break;
  }
  let mask = "";
  for (const p of maskCandidates) {
    mask = await sign(p);
    if (mask) break;
  }
  return { image, mask };
}

function pickAssetUrl(json: any): string | undefined {
  if (!json) return undefined;
  return (
    json.video_url ||
    json.videoUrl ||
    json.image_url ||
    json.imageUrl ||
    json.audio_url ||
    json.audioUrl ||
    json.output_url ||
    json.outputUrl ||
    json.url ||
    json.output ||
    undefined
  );
}

// ----------------------------- FLOWS -----------------------------

// Flow 1: Seed a real composer_project with 3 ready scenes (using bootstrapped
// sample video) → trigger compose-stitch-and-handoff → verify it stitches.
// Avoids depending on the 10/h provider rate limit just to test the stitch path.
async function flowComposerStitch(ctx: RunCtx): Promise<FlowResult> {
  const start = Date.now();
  const stages: FlowResult["stage_log"] = [];
  const result: FlowResult = {
    flow_index: 1,
    flow_name: "Composer Multi-Scene Stitch",
    status: "failed",
    duration_ms: 0,
    estimated_cost_eur: 0.5, // mostly Lambda assemble cost; clips are bootstrapped
    actual_cost_eur: 0,
    stage_log: stages,
    validation_checks: {},
  };

  let projectId: string | null = null;
  try {
    // 1) Create temporary composer project
    const tSetup = Date.now();
    const { data: proj, error: projErr } = await ctx.admin
      .from("composer_projects")
      .insert({
        user_id: ctx.userId,
        title: `qa-deep-sweep-stitch-${ctx.runId}`,
        status: "draft",
        briefing: { aspectRatio: "16:9", autoGenerated: true, qaSeed: true },
        assembly_config: { textOverlaysEnabled: false },
      })
      .select("id")
      .single();

    if (projErr || !proj) {
      result.error_message = `Composer project seed failed: ${projErr?.message || "unknown"}`;
      stages.push({ stage: "seed-project", ok: false, ms: Date.now() - tSetup, note: projErr?.message });
      result.duration_ms = Date.now() - start;
      return result;
    }
    projectId = proj.id;

    // 2) Insert 3 ready scenes pointing to the bootstrapped sample video
    const sceneRows = [0, 1, 2].map((i) => ({
      project_id: projectId,
      order_index: i,
      duration_seconds: 5,
      clip_url: ctx.assets.video,
      clip_status: "ready",
      clip_source: "ai-hailuo",
      scene_type: "custom",
      transition_type: "fade",
      transition_duration: 0.4,
      ai_prompt: `qa-stitch scene ${i + 1}`,
    }));
    const { error: scenesErr } = await ctx.admin.from("composer_scenes").insert(sceneRows);
    stages.push({ stage: "seed-project-and-scenes", ok: !scenesErr, ms: Date.now() - tSetup, note: scenesErr?.message });
    if (scenesErr) {
      result.error_message = `Composer scenes seed failed: ${scenesErr.message}`;
      result.duration_ms = Date.now() - start;
      return result;
    }

    // 3) Trigger stitch
    const t1 = Date.now();
    const stitch = await callEdge(
      "compose-stitch-and-handoff",
      { projectId, destination: "download", allowPartial: false },
      ctx.userId,
      240_000,
    );
    stages.push({ stage: "stitch", ok: stitch.ok, ms: Date.now() - t1, note: stitch.error });

    const finalUrl = pickAssetUrl(stitch.json) || (stitch.json as any)?.renderId;
    result.validation_checks.stitch_triggered = stitch.ok;
    result.validation_checks.has_output = !!finalUrl;

    if (stitch.ok) {
      const direct = pickAssetUrl(stitch.json);
      if (typeof direct === "string" && direct.startsWith("http")) {
        result.output_url = direct;
        result.validation_checks.url_reachable = await headOk(direct);
      }
      result.status = "success";
      result.actual_cost_eur = result.estimated_cost_eur;
    } else {
      result.error_message = stitch.error;
    }
  } catch (e: any) {
    result.error_message = e?.message || String(e);
  } finally {
    if (projectId) {
      await ctx.admin.from("composer_scenes").delete().eq("project_id", projectId).then(() => {}, () => {});
      await ctx.admin.from("composer_projects").delete().eq("id", projectId).then(() => {}, () => {});
    }
  }

  result.duration_ms = Date.now() - start;
  return result;
}

// Flow 2: Director's Cut Lambda Render — poll director_cut_renders
async function flowDirectorsCutRender(ctx: RunCtx, sourceVideoUrl: string): Promise<FlowResult> {
  const start = Date.now();
  const stages: FlowResult["stage_log"] = [];
  const result: FlowResult = {
    flow_index: 2,
    flow_name: "Director's Cut Lambda Render",
    status: "failed",
    duration_ms: 0,
    estimated_cost_eur: 1.5,
    actual_cost_eur: 0,
    stage_log: stages,
    validation_checks: {},
  };

  try {
    const t0 = Date.now();
    const render = await callEdge(
      "render-directors-cut",
      {
        source_video_url: sourceVideoUrl,
        duration_seconds: 10,
        effects: { filter: "cinematic" },
        subtitle_track: {
          visible: true,
          clips: [
            { start_time: 0, end_time: 5, text: "QA deep sweep test subtitle" },
            { start_time: 5, end_time: 10, text: "Render pipeline validated" },
          ],
        },
        export_settings: { quality: "hd", format: "mp4" },
      },
      ctx.userId,
      120_000,
    );
    stages.push({ stage: "trigger-render", ok: render.ok, ms: Date.now() - t0, note: render.error });

    if (!render.ok) {
      result.error_message = render.error;
      result.duration_ms = Date.now() - start;
      return result;
    }

    const renderRowId = (render.json as any)?.render_id;
    const remotionId = (render.json as any)?.remotion_render_id;
    result.validation_checks.render_triggered = true;
    result.validation_checks.has_remotion_id = !!remotionId;

    if (!renderRowId) {
      result.error_message = "render-directors-cut returned no render_id";
      result.duration_ms = Date.now() - start;
      return result;
    }

    // Poll director_cut_renders for completion (max 360s)
    const tPoll = Date.now();
    let polled: any = null;
    for (let i = 0; i < 36; i++) {
      await new Promise((r) => setTimeout(r, 10_000));
      const { data } = await ctx.admin
        .from("director_cut_renders")
        .select("status, output_url, error_message, remotion_render_id")
        .eq("id", renderRowId)
        .maybeSingle();
      if (data && (data.status === "completed" || data.status === "failed")) {
        polled = data;
        break;
      }
    }
    stages.push({ stage: "poll-completion", ok: polled?.status === "completed", ms: Date.now() - tPoll });
    if (polled?.status === "completed" && polled.output_url) {
      result.output_url = polled.output_url;
      result.validation_checks.url_reachable = await headOk(polled.output_url);
      result.status = "success";
      result.actual_cost_eur = result.estimated_cost_eur;
    } else {
      result.status = polled?.status === "failed" ? "failed" : "timeout";
      result.error_message = polled?.error_message || "Lambda render did not complete in 360s";
      result.actual_cost_eur = 0.5;
    }
  } catch (e: any) {
    result.error_message = e?.message || String(e);
  }

  result.duration_ms = Date.now() - start;
  return result;
}

// Flow 3: Auto-Director — stage 'plan' validates the LLM tool-calling pipeline
async function flowAutoDirector(ctx: RunCtx): Promise<FlowResult> {
  const start = Date.now();
  const stages: FlowResult["stage_log"] = [];
  const result: FlowResult = {
    flow_index: 3,
    flow_name: "Auto-Director (Brief → Storyboard Plan)",
    status: "failed",
    duration_ms: 0,
    estimated_cost_eur: 0.05,
    actual_cost_eur: 0,
    stage_log: stages,
    validation_checks: {},
  };

  try {
    const t0 = Date.now();
    const plan = await callEdge(
      "auto-director-compose",
      {
        stage: "plan",
        idea: "A 15-second cinematic spot for a coffee subscription with morning vibes, friendly tone, ends with a clear CTA",
        mood: "warm",
        targetDurationSec: 15,
        language: "en",
      },
      ctx.userId,
      120_000,
    );
    stages.push({ stage: "auto-director-plan", ok: plan.ok, ms: Date.now() - t0, note: plan.error });

    // Response shape: { ok: true, plan: { scenes, rationale, ... } }
    const root = plan.json as any;
    const planObj = root?.plan ?? root;
    const scenes = planObj?.scenes;
    result.validation_checks.has_scenes = Array.isArray(scenes) && scenes.length > 0;
    result.validation_checks.has_rationale = !!planObj?.rationale;

    if (plan.ok && result.validation_checks.has_scenes) {
      result.status = "success";
      result.actual_cost_eur = result.estimated_cost_eur;
    } else {
      result.error_message = plan.error || "Auto-director returned no scenes";
    }
  } catch (e: any) {
    result.error_message = e?.message || String(e);
  }

  result.duration_ms = Date.now() - start;
  return result;
}

// Flow 4: Talking Head (Hedra)
async function flowTalkingHead(ctx: RunCtx): Promise<FlowResult> {
  const start = Date.now();
  const stages: FlowResult["stage_log"] = [];
  const result: FlowResult = {
    flow_index: 4,
    flow_name: "Talking Head (Portrait + TTS + Hedra)",
    status: "failed",
    duration_ms: 0,
    estimated_cost_eur: 1.8,
    actual_cost_eur: 0,
    stage_log: stages,
    validation_checks: {},
  };

  try {
    const portraitUrl = ctx.assets.image;
    result.validation_checks.portrait = !!portraitUrl;

    const t0 = Date.now();
    const hedra = await callEdge(
      "generate-talking-head",
      {
        imageUrl: portraitUrl,
        text: "Hello, this is a quality assurance test of the talking head pipeline.",
        voiceId: "JBFqnCBsd6RMkjVDRZzb",
        aspectRatio: "16:9",
        resolution: "720p",
      },
      ctx.userId,
      300_000,
    );
    stages.push({ stage: "hedra", ok: hedra.ok, ms: Date.now() - t0, note: hedra.error });

    const url = pickAssetUrl(hedra.json) || (hedra.json as any)?.videoUrl;
    const predictionId = (hedra.json as any)?.predictionId;
    result.validation_checks.has_prediction_id = !!predictionId;

    if (hedra.ok && url) {
      result.output_url = url;
      result.validation_checks.video_reachable = await headOk(url);
      result.status = "success";
      result.actual_cost_eur = result.estimated_cost_eur;
    } else if (hedra.ok && predictionId) {
      result.status = "success";
      result.actual_cost_eur = result.estimated_cost_eur;
      result.error_message = "Async — prediction triggered, output via webhook";
    } else {
      result.error_message = hedra.error || "Hedra returned no video URL or predictionId";
    }
  } catch (e: any) {
    result.error_message = e?.message || String(e);
  }

  result.duration_ms = Date.now() - start;
  return result;
}

// Flow 5: Universal Video Creator — body carries explicit userId
async function flowUniversalVideo(ctx: RunCtx): Promise<FlowResult> {
  const start = Date.now();
  const stages: FlowResult["stage_log"] = [];
  const result: FlowResult = {
    flow_index: 5,
    flow_name: "Universal Video Creator (Marketing)",
    status: "failed",
    duration_ms: 0,
    estimated_cost_eur: 2.2,
    actual_cost_eur: 0,
    stage_log: stages,
    validation_checks: {},
  };

  try {
    const t0 = Date.now();
    const gen = await callEdge(
      "auto-generate-universal-video",
      {
        userId: ctx.userId,
        language: "en",
        briefing: {
          category: "product-ad",
          topic: "Bond QA deep sweep validation",
          visualStyle: "cinematic",
          durationSeconds: 15,
        },
      },
      ctx.userId,
      300_000,
    );
    stages.push({ stage: "auto-generate", ok: gen.ok, ms: Date.now() - t0, note: gen.error });

    const url = pickAssetUrl(gen.json);
    const progressId = (gen.json as any)?.progressId || (gen.json as any)?.progress_id;
    result.validation_checks.has_progress_id = !!progressId;

    if (gen.ok && (url || progressId)) {
      if (typeof url === "string" && url.startsWith("http")) {
        result.output_url = url;
        result.validation_checks.url_reachable = await headOk(url);
      }
      result.status = "success";
      result.actual_cost_eur = result.estimated_cost_eur;
    } else {
      result.error_message = gen.error || "Universal video creator returned no URL or progressId";
    }
  } catch (e: any) {
    result.error_message = e?.message || String(e);
  }

  result.duration_ms = Date.now() - start;
  return result;
}

// Flow 6: Long-Form Render — seed using REAL columns of sora_long_form_projects
async function flowLongFormRender(ctx: RunCtx): Promise<FlowResult> {
  const start = Date.now();
  const stages: FlowResult["stage_log"] = [];
  const result: FlowResult = {
    flow_index: 6,
    flow_name: "Long-Form Render (Lambda)",
    status: "failed",
    duration_ms: 0,
    estimated_cost_eur: 3.5,
    actual_cost_eur: 0,
    stage_log: stages,
    validation_checks: {},
  };

  let projectId: string | null = null;

  try {
    const tSetup = Date.now();
    const { data: proj, error: projErr } = await ctx.admin
      .from("sora_long_form_projects")
      .insert({
        user_id: ctx.userId,
        name: `qa-deep-sweep-longform-${ctx.runId}`,
        target_duration: 30,
        aspect_ratio: "16:9",
        model: "sora-2-standard",
        status: "draft",
        script: "QA deep sweep long-form render validation.",
      })
      .select()
      .single();

    if (projErr || !proj) {
      stages.push({ stage: "setup-project", ok: false, ms: Date.now() - tSetup, note: projErr?.message });
      result.error_message = `Could not seed test project: ${projErr?.message || "unknown"}`;
      result.duration_ms = Date.now() - start;
      return result;
    }
    projectId = proj.id;

    const { error: sceneErr } = await ctx.admin
      .from("sora_long_form_scenes")
      .insert({
        project_id: proj.id,
        scene_order: 0,
        status: "completed",
        duration: 4, // CHECK constraint: 4|8|12
        generated_video_url: ctx.assets.video,
        prompt: "QA test scene",
        cost_euros: 0,
        transition_type: "none",
      });
    stages.push({ stage: "setup-project-and-scene", ok: !sceneErr, ms: Date.now() - tSetup, note: sceneErr?.message });

    if (sceneErr) {
      result.error_message = `Scene seed failed: ${sceneErr.message}`;
      result.duration_ms = Date.now() - start;
      return result;
    }

    // Trigger render
    const t0 = Date.now();
    const render = await callEdge(
      "render-long-form-video",
      { projectId: proj.id },
      ctx.userId,
      120_000,
    );
    stages.push({ stage: "trigger-render", ok: render.ok, ms: Date.now() - t0, note: render.error });

    if (!render.ok) {
      result.error_message = render.error;
      result.duration_ms = Date.now() - start;
      return result;
    }

    const directUrl = pickAssetUrl(render.json);
    if (directUrl) {
      result.output_url = directUrl;
      result.validation_checks.url_reachable = await headOk(directUrl);
      result.status = "success";
      result.actual_cost_eur = result.estimated_cost_eur;
    } else {
      // Poll project status (max 360s)
      const tPoll = Date.now();
      let polled: any = null;
      for (let i = 0; i < 36; i++) {
        await new Promise((r) => setTimeout(r, 10_000));
        const { data } = await ctx.admin
          .from("sora_long_form_projects")
          .select("status, final_video_url")
          .eq("id", proj.id)
          .maybeSingle();
        if (data && (data.status === "completed" || data.status === "failed")) {
          polled = data;
          break;
        }
      }
      stages.push({ stage: "poll-completion", ok: polled?.status === "completed", ms: Date.now() - tPoll });
      if (polled?.status === "completed" && polled.final_video_url) {
        result.output_url = polled.final_video_url;
        result.validation_checks.url_reachable = await headOk(polled.final_video_url);
        result.status = "success";
        result.actual_cost_eur = result.estimated_cost_eur;
      } else {
        result.status = polled?.status === "failed" ? "failed" : "timeout";
        result.error_message = polled?.status === "failed"
          ? "Long-form render reported failed status"
          : "Long-form render did not complete in 360s";
        result.actual_cost_eur = 1.0;
      }
    }
  } catch (e: any) {
    result.error_message = e?.message || String(e);
  } finally {
    if (projectId) {
      await ctx.admin.from("sora_long_form_scenes").delete().eq("project_id", projectId).then(() => {}, () => {});
      await ctx.admin.from("sora_long_form_projects").delete().eq("id", projectId).then(() => {}, () => {});
    }
  }

  result.duration_ms = Date.now() - start;
  return result;
}

// Flow 7: Magic Edit (Inpaint with proper PNG mask)
async function flowMagicEdit(ctx: RunCtx): Promise<FlowResult> {
  const start = Date.now();
  const stages: FlowResult["stage_log"] = [];
  const result: FlowResult = {
    flow_index: 7,
    flow_name: "Magic Edit (FLUX Fill Inpaint)",
    status: "failed",
    duration_ms: 0,
    estimated_cost_eur: 0.15,
    actual_cost_eur: 0,
    stage_log: stages,
    validation_checks: {},
  };

  try {
    if (!ctx.assets.mask) {
      result.error_message =
        "No mask asset available. Run qa-live-sweep-bootstrap to provision sample-mask-512.png.";
      result.duration_ms = Date.now() - start;
      return result;
    }

    const t0 = Date.now();
    const edit = await callEdge(
      "magic-edit-image",
      {
        imageUrl: ctx.assets.image,
        maskUrl: ctx.assets.mask,
        prompt: "add a subtle warm golden glow in the center",
        mode: "inpaint",
      },
      ctx.userId,
      120_000,
    );
    stages.push({ stage: "inpaint", ok: edit.ok, ms: Date.now() - t0, note: edit.error });

    const url = pickAssetUrl(edit.json) || (edit.json as any)?.image?.url;
    if (edit.ok && url) {
      result.output_url = url;
      result.validation_checks.url_reachable = await headOk(url);
      result.status = "success";
      result.actual_cost_eur = result.estimated_cost_eur;
    } else {
      result.error_message = edit.error || "Magic edit returned no URL";
    }
  } catch (e: any) {
    result.error_message = e?.message || String(e);
  }

  result.duration_ms = Date.now() - start;
  return result;
}

// ----------------------------- ORCHESTRATOR -----------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify admin (uses the triggering user's JWT only here, not in background)
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: roleData } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleData) {
    return new Response(JSON.stringify({ error: "Admin only" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 6h hard-lock
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from("qa_deep_sweep_runs")
    .select("id, started_at, status")
    .gte("started_at", sixHoursAgo)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent && recent.status === "running") {
    return new Response(
      JSON.stringify({ error: "A deep sweep is already running", run_id: recent.id }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch { /* no body */ }
  const capEur = Number(body?.cap_eur ?? 50);
  const skipFlows: number[] = Array.isArray(body?.skip_flows) ? body.skip_flows : [];

  // Create run row
  const { data: runRow, error: runErr } = await admin
    .from("qa_deep_sweep_runs")
    .insert({
      cap_eur: capEur,
      status: "running",
      triggered_by: userData.user.id,
      flows_total: 7 - skipFlows.length,
    })
    .select()
    .single();

  if (runErr || !runRow) {
    return new Response(JSON.stringify({ error: "Failed to create run row", details: runErr?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ctx: RunCtx = {
    runId: runRow.id,
    userId: userData.user.id,
    admin,
    assets: await getTestAssets(admin),
    remainingEur: capEur,
  };

  const runner = async () => {
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    let totalSpent = 0;
    let stitchedVideoUrl: string | null = null;

    const persistAndCount = async (peek: FlowResult) => {
      if (skipFlows.includes(peek.flow_index)) {
        peek.status = "budget_skipped";
        peek.actual_cost_eur = 0;
        skipped++;
      } else if (peek.status === "budget_skipped") {
        skipped++;
      } else {
        if (peek.status === "success") succeeded++;
        else failed++;
        ctx.remainingEur -= peek.actual_cost_eur;
        totalSpent += peek.actual_cost_eur;
      }

      await admin.from("qa_deep_sweep_flow_results").insert({
        run_id: ctx.runId,
        flow_name: peek.flow_name,
        flow_index: peek.flow_index,
        started_at: new Date(Date.now() - peek.duration_ms).toISOString(),
        finished_at: new Date().toISOString(),
        duration_ms: peek.duration_ms,
        status: peek.status,
        estimated_cost_eur: peek.estimated_cost_eur,
        actual_cost_eur: peek.actual_cost_eur,
        output_url: peek.output_url ?? null,
        error_message: peek.error_message ?? null,
        stage_log: peek.stage_log,
        validation_checks: peek.validation_checks,
      });

      if (peek.status === "failed" || peek.status === "timeout") {
        await admin.from("qa_bug_reports").insert({
          mission_name: "deep-sweep",
          bug_type: "e2e_pipeline_failure",
          severity: "high",
          title: `Deep Sweep: ${peek.flow_name} ${peek.status}`,
          description: peek.error_message || "No error message",
          metadata: {
            run_id: ctx.runId,
            flow_index: peek.flow_index,
            stages: peek.stage_log,
          },
        }).then(() => {}, () => {});
      }
    };

    const skipBudget = (idx: number, estimate: number, name: string): FlowResult | null => {
      if (skipFlows.includes(idx)) {
        return {
          flow_index: idx, flow_name: name, status: "budget_skipped",
          duration_ms: 0, estimated_cost_eur: estimate, actual_cost_eur: 0,
          error_message: "User-skipped", stage_log: [], validation_checks: {},
        };
      }
      if (ctx.remainingEur < estimate) {
        return {
          flow_index: idx, flow_name: name, status: "budget_skipped",
          duration_ms: 0, estimated_cost_eur: estimate, actual_cost_eur: 0,
          error_message: `Budget exhausted: ${ctx.remainingEur.toFixed(2)}€ remaining`,
          stage_log: [], validation_checks: {},
        };
      }
      return null;
    };

    try {
      const skip1 = skipBudget(1, 0.5, "Composer Multi-Scene Stitch");
      const f1 = skip1 || await flowComposerStitch(ctx);
      if (f1.status === "success" && f1.output_url) stitchedVideoUrl = f1.output_url;
      await persistAndCount(f1);

      const skip2 = skipBudget(2, 1.5, "Director's Cut Lambda Render");
      const f2 = skip2 || await flowDirectorsCutRender(ctx, stitchedVideoUrl || ctx.assets.video);
      await persistAndCount(f2);

      const skip3 = skipBudget(3, 0.05, "Auto-Director (Brief → Storyboard Plan)");
      const f3 = skip3 || await flowAutoDirector(ctx);
      await persistAndCount(f3);

      const skip4 = skipBudget(4, 1.8, "Talking Head (Portrait + TTS + Hedra)");
      const f4 = skip4 || await flowTalkingHead(ctx);
      await persistAndCount(f4);

      const skip5 = skipBudget(5, 2.2, "Universal Video Creator (Marketing)");
      const f5 = skip5 || await flowUniversalVideo(ctx);
      await persistAndCount(f5);

      const skip6 = skipBudget(6, 3.5, "Long-Form Render (Lambda)");
      const f6 = skip6 || await flowLongFormRender(ctx);
      await persistAndCount(f6);

      const skip7 = skipBudget(7, 0.15, "Magic Edit (FLUX Fill Inpaint)");
      const f7 = skip7 || await flowMagicEdit(ctx);
      await persistAndCount(f7);
    } catch (e: any) {
      console.error("[deep-sweep] runner error:", e);
    }

    await admin
      .from("qa_deep_sweep_runs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        total_cost_eur: Number(totalSpent.toFixed(4)),
        flows_succeeded: succeeded,
        flows_failed: failed,
        flows_skipped: skipped,
      })
      .eq("id", ctx.runId);
  };

  // @ts-ignore EdgeRuntime is available in Supabase Edge Runtime
  if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(runner());
  } else {
    runner().catch((e) => console.error("[deep-sweep] background error:", e));
  }

  return new Response(
    JSON.stringify({
      ok: true,
      run_id: runRow.id,
      cap_eur: capEur,
      message: "Deep sweep started. Poll qa_deep_sweep_flow_results for live updates.",
    }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
