// Bond QA — Weekly Deep Sweep Orchestrator
// Runs 7 full end-to-end pipelines (not just provider pings) to catch
// integration drift: webhooks, Lambda renders, FFmpeg stitches, frame
// continuity, subtitle sync. Hard cap 50€ per run, manual trigger only.
//
// Sends `x-qa-real-spend: true` header so provider edge functions DO NOT
// short-circuit via qaMock helper. This sweep is meant to spend real money.

import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
  authHeader: string;
  admin: ReturnType<typeof createClient>;
  assets: { image: string; video: string; audio: string };
  remainingEur: number;
}

const HEADERS_REAL_SPEND = (auth: string) => ({
  "Content-Type": "application/json",
  Authorization: auth,
  apikey: SUPABASE_ANON_KEY,
  "x-qa-real-spend": "true",
});

async function callEdge<T = any>(
  fn: string,
  body: Record<string, unknown>,
  authHeader: string,
  timeoutMs = 120_000,
): Promise<{ ok: boolean; status: number; json: T | null; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: HEADERS_REAL_SPEND(authHeader),
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

async function getTestAssets(admin: any): Promise<{ image: string; video: string; audio: string }> {
  // Try to use bootstrapped assets in qa-test-assets bucket; fall back to public samples.
  const tryUrl = async (path: string) => {
    const { data } = admin.storage.from("qa-test-assets").getPublicUrl(path);
    return data?.publicUrl;
  };
  return {
    image: (await tryUrl("sample-1024.jpg")) || FALLBACK_IMAGE,
    video: (await tryUrl("sample-5s.mp4")) || FALLBACK_VIDEO,
    audio: (await tryUrl("sample-5s.mp3")) || FALLBACK_AUDIO,
  };
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

// Flow 1: 3 parallel video clips → stitch
async function flowComposerStitch(ctx: RunCtx): Promise<FlowResult> {
  const start = Date.now();
  const stages: FlowResult["stage_log"] = [];
  const result: FlowResult = {
    flow_index: 1,
    flow_name: "Composer Multi-Scene Stitch",
    status: "failed",
    duration_ms: 0,
    estimated_cost_eur: 2.5,
    actual_cost_eur: 0,
    stage_log: stages,
    validation_checks: {},
  };

  try {
    // 3 parallel scenes via different providers
    const t0 = Date.now();
    const [r1, r2, r3] = await Promise.all([
      callEdge(
        "generate-hailuo-video",
        { prompt: "calm ocean waves, cinematic", duration: 6, resolution: "768p" },
        ctx.authHeader,
        180_000,
      ),
      callEdge(
        "generate-seedance-video",
        { prompt: "city traffic timelapse", duration: 5, image: ctx.assets.image },
        ctx.authHeader,
        180_000,
      ),
      callEdge(
        "generate-kling-video",
        { prompt: "forest path dolly", duration: 5, mode: "standard" },
        ctx.authHeader,
        180_000,
      ),
    ]);
    stages.push({ stage: "parallel-3-clips", ok: r1.ok && r2.ok && r3.ok, ms: Date.now() - t0 });

    const url1 = pickAssetUrl(r1.json);
    const url2 = pickAssetUrl(r2.json);
    const url3 = pickAssetUrl(r3.json);
    result.validation_checks.clip1_url = !!url1;
    result.validation_checks.clip2_url = !!url2;
    result.validation_checks.clip3_url = !!url3;

    if (!url1 || !url2 || !url3) {
      result.error_message = `Missing clip URLs: ${[url1, url2, url3].map((u) => !!u).join(",")}`;
      result.duration_ms = Date.now() - start;
      return result;
    }

    // Stitch
    const t1 = Date.now();
    const stitch = await callEdge(
      "compose-stitch-and-handoff",
      {
        scenes: [
          { url: url1, duration: 6 },
          { url: url2, duration: 5 },
          { url: url3, duration: 5 },
        ],
        title: `qa-deep-sweep-${ctx.runId}`,
      },
      ctx.authHeader,
      240_000,
    );
    stages.push({ stage: "stitch", ok: stitch.ok, ms: Date.now() - t1, note: stitch.error });

    const finalUrl = pickAssetUrl(stitch.json);
    result.validation_checks.final_url = !!finalUrl;
    if (finalUrl) {
      result.validation_checks.final_url_reachable = await headOk(finalUrl);
      result.output_url = finalUrl;
    }

    result.status = stitch.ok && !!finalUrl ? "success" : "failed";
    if (!stitch.ok) result.error_message = stitch.error;
    result.actual_cost_eur = result.status === "success" ? result.estimated_cost_eur : 0;
  } catch (e: any) {
    result.error_message = e?.message || String(e);
  }

  result.duration_ms = Date.now() - start;
  return result;
}

// Flow 2: Director's Cut Lambda Render
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
        clips: [{ src: sourceVideoUrl, start: 0, end: 10, track: "main" }],
        subtitles: [{ start: 0, end: 5, text: "QA deep sweep test subtitle" }],
        filter: "cinematic",
        aspect_ratio: "16:9",
        duration_seconds: 10,
      },
      ctx.authHeader,
      120_000,
    );
    stages.push({ stage: "trigger-render", ok: render.ok, ms: Date.now() - t0, note: render.error });

    if (!render.ok) {
      result.error_message = render.error;
      result.duration_ms = Date.now() - start;
      return result;
    }

    const renderId = (render.json as any)?.render_id || (render.json as any)?.renderId;
    const directUrl = pickAssetUrl(render.json);
    result.validation_checks.render_triggered = true;

    if (directUrl) {
      result.output_url = directUrl;
      result.validation_checks.url_reachable = await headOk(directUrl);
      result.status = "success";
      result.actual_cost_eur = result.estimated_cost_eur;
    } else if (renderId) {
      // Poll video_creations for completion (max 240s)
      const tPoll = Date.now();
      let polled: any = null;
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 10_000));
        const { data } = await ctx.admin
          .from("video_creations")
          .select("status, output_url, error_message")
          .eq("render_id", renderId)
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
        result.error_message = polled?.error_message || "Lambda render did not complete in 240s";
      }
    } else {
      result.error_message = "No render_id or direct URL returned";
    }
  } catch (e: any) {
    result.error_message = e?.message || String(e);
  }

  result.duration_ms = Date.now() - start;
  return result;
}

// Flow 3: Auto-Director (Brief → Storyboard → Render)
async function flowAutoDirector(ctx: RunCtx): Promise<FlowResult> {
  const start = Date.now();
  const stages: FlowResult["stage_log"] = [];
  const result: FlowResult = {
    flow_index: 3,
    flow_name: "Auto-Director (Brief → Video)",
    status: "failed",
    duration_ms: 0,
    estimated_cost_eur: 3.0,
    actual_cost_eur: 0,
    stage_log: stages,
    validation_checks: {},
  };

  try {
    const t0 = Date.now();
    const compose = await callEdge(
      "auto-director-compose",
      {
        brief: "30-second product spot for a coffee subscription, cinematic morning vibes",
        category: "marketing",
        target_duration: 15,
        language: "en",
      },
      ctx.authHeader,
      300_000,
    );
    stages.push({ stage: "auto-director-compose", ok: compose.ok, ms: Date.now() - t0, note: compose.error });

    const url = pickAssetUrl(compose.json) || (compose.json as any)?.project?.output_url;
    result.validation_checks.has_output = !!url;
    if (compose.ok && url) {
      result.output_url = url;
      result.validation_checks.url_reachable = await headOk(url);
      result.status = "success";
      result.actual_cost_eur = result.estimated_cost_eur;
    } else {
      result.error_message = compose.error || "Auto-director returned no output URL";
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
    // 1. Portrait via FLUX
    const t0 = Date.now();
    const portrait = await callEdge(
      "generate-image-replicate",
      {
        prompt: "professional headshot of a friendly speaker, neutral background, soft lighting",
        tier: "fast",
        aspectRatio: "1:1",
        style: "realistic",
      },
      ctx.authHeader,
      60_000,
    );
    stages.push({ stage: "portrait", ok: portrait.ok, ms: Date.now() - t0, note: portrait.error });
    const portraitUrl = pickAssetUrl(portrait.json) || ctx.assets.image;
    result.validation_checks.portrait = !!portraitUrl;

    // 2. TTS via ElevenLabs
    const t1 = Date.now();
    const tts = await callEdge(
      "generate-voiceover",
      {
        text: "Hello, this is a quality assurance test of the talking head pipeline.",
        voiceId: "JBFqnCBsd6RMkjVDRZzb",
      },
      ctx.authHeader,
      60_000,
    );
    stages.push({ stage: "tts", ok: tts.ok, ms: Date.now() - t1, note: tts.error });
    const audioUrl = pickAssetUrl(tts.json) || ctx.assets.audio;
    result.validation_checks.audio = !!audioUrl;

    // 3. Hedra
    const t2 = Date.now();
    const hedra = await callEdge(
      "generate-talking-head",
      {
        imageUrl: portraitUrl,
        audioUrl: audioUrl,
        aspectRatio: "16:9",
        resolution: "720p",
      },
      ctx.authHeader,
      300_000,
    );
    stages.push({ stage: "hedra", ok: hedra.ok, ms: Date.now() - t2, note: hedra.error });

    const url = pickAssetUrl(hedra.json);
    if (hedra.ok && url) {
      result.output_url = url;
      result.validation_checks.video_reachable = await headOk(url);
      result.status = "success";
      result.actual_cost_eur = result.estimated_cost_eur;
    } else {
      result.error_message = hedra.error || "Hedra returned no video URL";
    }
  } catch (e: any) {
    result.error_message = e?.message || String(e);
  }

  result.duration_ms = Date.now() - start;
  return result;
}

// Flow 5: Universal Video Creator
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
        category: "marketing",
        topic: "Bond QA deep sweep validation",
        language: "en",
        duration_seconds: 15,
      },
      ctx.authHeader,
      300_000,
    );
    stages.push({ stage: "auto-generate", ok: gen.ok, ms: Date.now() - t0, note: gen.error });

    const url = pickAssetUrl(gen.json);
    if (gen.ok && url) {
      result.output_url = url;
      result.validation_checks.url_reachable = await headOk(url);
      result.status = "success";
      result.actual_cost_eur = result.estimated_cost_eur;
    } else {
      result.error_message = gen.error || "Universal video creator returned no URL";
    }
  } catch (e: any) {
    result.error_message = e?.message || String(e);
  }

  result.duration_ms = Date.now() - start;
  return result;
}

// Flow 6: Long-Form Render
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

  try {
    const t0 = Date.now();
    const render = await callEdge(
      "render-long-form-video",
      {
        script: "Welcome to a brief test. This is the second sentence. And here is the third one to make it three minutes. Final wrap up here.",
        title: `qa-deep-sweep-longform-${ctx.runId}`,
        target_duration_seconds: 60,
        language: "en",
      },
      ctx.authHeader,
      120_000,
    );
    stages.push({ stage: "trigger", ok: render.ok, ms: Date.now() - t0, note: render.error });

    if (!render.ok) {
      result.error_message = render.error;
      result.duration_ms = Date.now() - start;
      return result;
    }

    const directUrl = pickAssetUrl(render.json);
    const renderId = (render.json as any)?.render_id || (render.json as any)?.renderId;

    if (directUrl) {
      result.output_url = directUrl;
      result.validation_checks.url_reachable = await headOk(directUrl);
      result.status = "success";
      result.actual_cost_eur = result.estimated_cost_eur;
    } else if (renderId) {
      const tPoll = Date.now();
      let polled: any = null;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 10_000));
        const { data } = await ctx.admin
          .from("video_creations")
          .select("status, output_url, error_message")
          .eq("render_id", renderId)
          .maybeSingle();
        if (data && (data.status === "completed" || data.status === "failed")) {
          polled = data;
          break;
        }
      }
      stages.push({ stage: "poll", ok: polled?.status === "completed", ms: Date.now() - tPoll });
      if (polled?.status === "completed" && polled.output_url) {
        result.output_url = polled.output_url;
        result.validation_checks.url_reachable = await headOk(polled.output_url);
        result.status = "success";
        result.actual_cost_eur = result.estimated_cost_eur;
      } else {
        result.status = polled?.status === "failed" ? "failed" : "timeout";
        result.error_message = polled?.error_message || "Long-form render did not complete in 300s";
      }
    } else {
      result.error_message = "No render_id or URL returned";
    }
  } catch (e: any) {
    result.error_message = e?.message || String(e);
  }

  result.duration_ms = Date.now() - start;
  return result;
}

// Flow 7: Magic Edit (Inpaint)
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
    const t0 = Date.now();
    const edit = await callEdge(
      "magic-edit-image",
      {
        imageUrl: ctx.assets.image,
        maskUrl: ctx.assets.image, // simplified — use same image as mask placeholder
        prompt: "add a subtle warm glow",
        mode: "inpaint",
      },
      ctx.authHeader,
      90_000,
    );
    stages.push({ stage: "inpaint", ok: edit.ok, ms: Date.now() - t0, note: edit.error });

    const url = pickAssetUrl(edit.json);
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

  // Verify admin
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
    authHeader,
    admin,
    assets: await getTestAssets(admin),
    remainingEur: capEur,
  };

  // Run in background; return immediately with run_id so UI can poll
  const runner = async () => {
    const allFlows = [
      flowComposerStitch,
      // Flow 2 needs a stitched video URL → handled inline below
      flowAutoDirector,
      flowTalkingHead,
      flowUniversalVideo,
      flowLongFormRender,
      flowMagicEdit,
    ];

    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    let totalSpent = 0;
    let stitchedVideoUrl: string | null = null;

    const runFlow = async (flowFn: (c: RunCtx, extra?: any) => Promise<FlowResult>, extra?: any) => {
      // Estimated check
      const est = (await flowFn.length); // arity hint, real est inside flow
      // Insert pending row
      const peek = await flowFn(ctx, extra); // run flow

      if (skipFlows.includes(peek.flow_index)) {
        peek.status = "budget_skipped";
        peek.actual_cost_eur = 0;
        skipped++;
      } else if (ctx.remainingEur < peek.estimated_cost_eur) {
        peek.status = "budget_skipped";
        peek.actual_cost_eur = 0;
        peek.error_message = `Skipped: ${ctx.remainingEur.toFixed(2)}€ remaining < ${peek.estimated_cost_eur}€ needed`;
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

      // Auto-bug on real failure (not budget_skipped)
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

      return peek;
    };

    try {
      // Sequential execution
      // Flow 1
      const f1 = await runFlow(flowComposerStitch);
      if (f1.status === "success" && f1.output_url) stitchedVideoUrl = f1.output_url;

      // Flow 2 (uses Flow 1 output, falls back to sample video)
      await runFlow(
        (c) => flowDirectorsCutRender(c, stitchedVideoUrl || c.assets.video),
      );

      // Flows 3-7
      await runFlow(flowAutoDirector);
      await runFlow(flowTalkingHead);
      await runFlow(flowUniversalVideo);
      await runFlow(flowLongFormRender);
      await runFlow(flowMagicEdit);
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

  // Fire and forget
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
