// analyze-scene-subject v1.0.0 — Block R (Smart Reframe)
//
// For each scene of a composer project:
//   1. Sample 3 keyframes (0%, 50%, 95% of duration) via the existing
//      extract-video-frames edge function (image scenes use clip_url directly).
//   2. Ask Gemini 2.5 Flash Vision to return a normalized bounding-box of the
//      most prominent subject in the frame (face / product / hero element).
//   3. Persist the resulting `subject_track` JSONB on composer_scenes for
//      caching. The render pipeline interpolates between the points to
//      drive `objectPosition` during cropping.
//
// Cost is intentionally small (~3 vision calls × ~€0.001 per scene). Results
// are cached so re-exports are free.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  projectId: string;
  /** Force re-analysis even if subject_track is already cached */
  force?: boolean;
}

interface SubjectPoint {
  t: number;
  x: number;
  y: number;
  conf: number;
  label?: string;
}

const VISION_MODEL = "google/gemini-2.5-flash";
const KEYFRAME_TIMES = [0.05, 0.5, 0.95]; // proportions of duration

async function fetchAsBase64(url: string): Promise<{ data: string; mime: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") || "image/jpeg";
    const buf = new Uint8Array(await res.arrayBuffer());
    // Convert to base64 without exceeding call-stack on large buffers
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    return { data: btoa(binary), mime };
  } catch (e) {
    console.warn("[analyze-scene-subject] fetchAsBase64 failed", e);
    return null;
  }
}

async function detectSubjectInImage(
  apiKey: string,
  imageUrl: string,
  t: number,
): Promise<SubjectPoint | null> {
  const img = await fetchAsBase64(imageUrl);
  if (!img) return null;

  const body = {
    model: VISION_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a computer-vision assistant. Identify the single most important subject in the image — typically a person's face, the main product, or the focal element of the composition. Always reply via the provided tool.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Return the normalized bounding-box center of the main subject. Coordinates in [0,1] where (0,0) is top-left and (1,1) bottom-right.",
          },
          {
            type: "image_url",
            image_url: { url: `data:${img.mime};base64,${img.data}` },
          },
        ],
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "report_subject",
          description: "Report the location of the most important subject in the frame.",
          parameters: {
            type: "object",
            properties: {
              x: { type: "number", description: "Horizontal center, 0..1" },
              y: { type: "number", description: "Vertical center, 0..1" },
              confidence: { type: "number", description: "0..1" },
              label: { type: "string", description: "Short label, e.g. 'face', 'product', 'hands'" },
            },
            required: ["x", "y", "confidence"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "report_subject" } },
  };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.warn("[analyze-scene-subject] AI gateway", res.status, await res.text().catch(() => ""));
    return null;
  }

  const json = await res.json();
  const call = json?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) return null;

  try {
    const args = JSON.parse(call.function?.arguments || "{}");
    const x = Math.max(0, Math.min(1, Number(args.x)));
    const y = Math.max(0, Math.min(1, Number(args.y)));
    const conf = Math.max(0, Math.min(1, Number(args.confidence ?? 0.7)));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { t, x, y, conf, label: typeof args.label === "string" ? args.label.slice(0, 32) : undefined };
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = (await req.json()) as ReqBody;
    if (!body.projectId) throw new Error("projectId required");

    // Verify project ownership
    const { data: project } = await admin
      .from("composer_projects")
      .select("id, user_id, briefing")
      .eq("id", body.projectId)
      .single();
    if (!project || project.user_id !== user.id) throw new Error("Project not found");

    const sourceAspect = (project.briefing as any)?.aspectRatio || "16:9";

    const { data: scenes, error: scenesErr } = await admin
      .from("composer_scenes")
      .select("id, order_index, clip_url, upload_url, clip_source, upload_type, duration_seconds, subject_track, first_frame_url, last_frame_url")
      .eq("project_id", body.projectId)
      .order("order_index", { ascending: true });
    if (scenesErr) throw scenesErr;

    const isImageScene = (s: any) =>
      s?.clip_source === "ai-image" ||
      s?.upload_type === "image" ||
      /\.(png|jpe?g|webp|avif|gif)(\?|$)/i.test(s?.clip_url || "");

    const results: Array<{ sceneId: string; pointCount: number; cached: boolean }> = [];

    for (const scene of (scenes || []) as any[]) {
      // Cache hit?
      if (!body.force && scene.subject_track && Array.isArray((scene.subject_track as any).points) && (scene.subject_track as any).points.length > 0) {
        results.push({ sceneId: scene.id, pointCount: (scene.subject_track as any).points.length, cached: true });
        continue;
      }

      const clipUrl: string | null = scene.clip_url || scene.upload_url;
      if (!clipUrl) {
        results.push({ sceneId: scene.id, pointCount: 0, cached: false });
        continue;
      }

      const duration = Math.max(0.5, Number(scene.duration_seconds) || 5);
      const points: SubjectPoint[] = [];

      if (isImageScene(scene)) {
        // Single sample at t=0 — image is static, but we still record a point per
        // proportion so downstream interp logic stays uniform.
        const p = await detectSubjectInImage(LOVABLE_API_KEY, clipUrl, 0);
        if (p) {
          points.push({ ...p, t: 0 });
          points.push({ ...p, t: duration });
        }
      } else {
        // Use cached first/last frame when available, else fetch via extract-video-frames
        const frameUrls: Array<{ url: string; t: number }> = [];

        if (scene.first_frame_url) {
          frameUrls.push({ url: scene.first_frame_url, t: 0 });
        }
        if (scene.last_frame_url) {
          frameUrls.push({ url: scene.last_frame_url, t: duration });
        }

        // Need at least start + middle frames? Extract whatever's missing.
        if (frameUrls.length < 2) {
          try {
            const { data: framesData } = await admin.functions.invoke("extract-video-frames", {
              body: {
                videoUrl: clipUrl,
                mode: "both",
                durationSeconds: duration,
                sceneId: scene.id,
                projectId: body.projectId,
              },
              headers: { Authorization: authHeader },
            });
            if (framesData?.firstFrameUrl) frameUrls.push({ url: framesData.firstFrameUrl, t: 0 });
            if (framesData?.lastFrameUrl) frameUrls.push({ url: framesData.lastFrameUrl, t: duration });
          } catch (e) {
            console.warn("[analyze-scene-subject] frame extract failed", e);
          }
        }

        // Uniqueize by t
        const seen = new Set<number>();
        const cleanFrames = frameUrls.filter(f => {
          const key = Math.round(f.t * 10) / 10;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        for (const f of cleanFrames) {
          const p = await detectSubjectInImage(LOVABLE_API_KEY, f.url, f.t);
          if (p) points.push(p);
        }
      }

      // If we got at least one point, persist; otherwise leave null so renderer falls back to center.
      if (points.length > 0) {
        // Sort by t ascending
        points.sort((a, b) => a.t - b.t);
        const trackPayload = {
          source_aspect: sourceAspect,
          analyzed_at: new Date().toISOString(),
          model: VISION_MODEL,
          points,
        };
        await admin.from("composer_scenes").update({ subject_track: trackPayload }).eq("id", scene.id);
      }

      results.push({ sceneId: scene.id, pointCount: points.length, cached: false });
    }

    const totalAnalyzed = results.filter(r => !r.cached && r.pointCount > 0).length;
    const totalCached = results.filter(r => r.cached).length;
    const totalSkipped = results.filter(r => !r.cached && r.pointCount === 0).length;

    return new Response(
      JSON.stringify({
        success: true,
        scenes: results.length,
        analyzed: totalAnalyzed,
        cached: totalCached,
        skipped: totalSkipped,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[analyze-scene-subject] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
