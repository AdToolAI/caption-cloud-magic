// aggregate-trending-templates
// Periodically scans top-performing composer projects and upserts
// anonymized "trending templates" into composer_template_suggestions.
//
// Scoring: views * 0.3 + completion * 0.5 + shares * 0.2
// Window: last 14 days. Top 25 projects.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ProjectRow = {
  id: string;
  user_id: string | null;
  title: string | null;
  category: string | null;
  total_duration_sec: number | null;
  scenes_json: unknown;
  briefing_json: unknown;
  aspect_ratio: string | null;
  thumbnail_url: string | null;
  output_video_url: string | null;
};

function anonymizeBriefing(b: any): Record<string, unknown> {
  if (!b || typeof b !== "object") return {};
  // Strip user/brand-specific fields; keep generic structural info
  const safe: Record<string, unknown> = {};
  const allowedKeys = [
    "duration",
    "aspectRatio",
    "tone",
    "pace",
    "style",
    "language",
    "visualStyle",
    "category",
  ];
  for (const k of allowedKeys) {
    if (k in b) safe[k] = b[k];
  }
  return safe;
}

function anonymizeScenes(scenes: unknown): any[] {
  if (!Array.isArray(scenes)) return [];
  return scenes.map((s: any, idx: number) => ({
    sceneType: s?.sceneType ?? s?.scene_type ?? "custom",
    durationSeconds: Number(s?.durationSeconds ?? s?.duration_seconds ?? 5),
    clipSource: s?.clipSource ?? s?.clip_source ?? "ai-hailuo",
    clipQuality: s?.clipQuality ?? s?.clip_quality ?? "standard",
    // Generic prompt placeholder — strip user PII / brand strings
    aiPrompt:
      typeof s?.aiPrompt === "string" && s.aiPrompt.length < 240
        ? s.aiPrompt.replace(/\b(?:[A-Z][a-z]+\s+){2,}/g, "").trim()
        : undefined,
    transitionType: s?.transitionType ?? "fade",
    transitionDuration: Number(s?.transitionDuration ?? 0.5),
    _orderIndex: idx,
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const windowStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date();

  try {
    // 1) Pull recent completed composer projects
    const { data: projects, error: projErr } = await admin
      .from("composer_projects")
      .select(
        "id, user_id, title, category, total_duration_sec, scenes_json, briefing_json, aspect_ratio, thumbnail_url, output_video_url"
      )
      .eq("status", "completed")
      .gte("created_at", windowStart.toISOString())
      .limit(200);

    if (projErr) throw projErr;
    const projectList = (projects ?? []) as ProjectRow[];

    if (projectList.length === 0) {
      return new Response(
        JSON.stringify({ aggregated: 0, message: "No completed projects in window." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2) Fetch performance metrics (best-effort; tables may be empty)
    const projectIds = projectList.map((p) => p.id);

    const { data: variants } = await admin
      .from("ab_test_variants")
      .select("draft_id, views, engagement_count, conversions, avg_watch_time")
      .in("draft_id", projectIds);

    const metricsByProject = new Map<
      string,
      { views: number; completion: number; shares: number }
    >();

    (variants ?? []).forEach((v: any) => {
      const id = v.draft_id as string;
      const cur = metricsByProject.get(id) ?? {
        views: 0,
        completion: 0,
        shares: 0,
      };
      cur.views += Number(v.views ?? 0);
      cur.completion = Math.max(cur.completion, Number(v.avg_watch_time ?? 0));
      cur.shares += Number(v.conversions ?? 0);
      metricsByProject.set(id, cur);
    });

    // 3) Score and pick top 25
    const scored = projectList
      .map((p) => {
        const m = metricsByProject.get(p.id) ?? { views: 0, completion: 0, shares: 0 };
        const score = m.views * 0.3 + m.completion * 0.5 + m.shares * 0.2;
        return { project: p, metrics: m, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);

    // 4) Build anonymized rows for upsert
    const rows = scored
      .filter((s) => Array.isArray(s.project.scenes_json) && (s.project.scenes_json as any[]).length > 0)
      .map((s) => {
        const anonScenes = anonymizeScenes(s.project.scenes_json);
        const anonBriefing = anonymizeBriefing(s.project.briefing_json);
        return {
          source_project_id: s.project.id,
          title: s.project.title ?? "Trending Template",
          description: `Top-performing structure with ${anonScenes.length} scenes.`,
          category: s.project.category ?? "product-ad",
          scene_count: anonScenes.length,
          total_duration_sec: Number(s.project.total_duration_sec ?? 0),
          performance_score: Number(s.score.toFixed(4)),
          views_count: s.metrics.views,
          completion_rate: s.metrics.completion,
          shares_count: s.metrics.shares,
          thumbnail_url: s.project.thumbnail_url,
          preview_video_url: s.project.output_video_url,
          structure_json: {
            aspect_ratio: s.project.aspect_ratio ?? "9:16",
            briefing_defaults: anonBriefing,
            scenes: anonScenes,
          },
          tags: [s.project.category ?? "general"].filter(Boolean) as string[],
          is_public: true,
          is_featured: false,
          aggregation_window_start: windowStart.toISOString(),
          aggregation_window_end: windowEnd.toISOString(),
        };
      });

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ aggregated: 0, message: "No qualifying projects." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Replace strategy: clear non-featured rows older than 30 days, then insert fresh batch.
    await admin
      .from("composer_template_suggestions")
      .delete()
      .eq("is_featured", false)
      .lt("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const { error: insErr, data: inserted } = await admin
      .from("composer_template_suggestions")
      .insert(rows)
      .select("id");

    if (insErr) throw insErr;

    return new Response(
      JSON.stringify({
        aggregated: inserted?.length ?? 0,
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("aggregate-trending-templates error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
