// compose-stitch-and-handoff v1.0.0
// Multi-Scene Render Pipeline: Wartet, bis alle Composer-Scenes ready sind,
// triggert anschließend das Stitching (compose-video-assemble) und gibt
// die finale Video-URL zur Übergabe an Director's Cut / Library / Download zurück.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userRes } = await userClient.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const {
      projectId,
      destination = "directors_cut",
      allowPartial = false,
      runId: existingRunId,
    } = body as {
      projectId: string;
      destination?: "directors_cut" | "library" | "download";
      allowPartial?: boolean;
      runId?: string;
    };

    if (!projectId) {
      return new Response(JSON.stringify({ error: "projectId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load scenes
    const { data: scenes, error: scenesErr } = await supabase
      .from("composer_scenes")
      .select("id, clip_status")
      .eq("project_id", projectId);
    if (scenesErr) throw scenesErr;

    const total = scenes?.length || 0;
    const ready = (scenes || []).filter((s) => s.clip_status === "ready").length;
    const failed = (scenes || []).filter((s) => s.clip_status === "failed").length;
    const pending = total - ready - failed;

    if (total === 0) {
      return new Response(JSON.stringify({ error: "No scenes in project" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (pending > 0) {
      return new Response(
        JSON.stringify({
          error: `Pipeline not ready: ${pending} scene(s) still generating`,
          pending,
          ready,
          failed,
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (failed > 0 && !allowPartial) {
      return new Response(
        JSON.stringify({
          error: `${failed} scene(s) failed. Retry them or pass allowPartial=true`,
          failed,
          ready,
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Upsert pipeline run record
    let runId = existingRunId;
    if (!runId) {
      const { data: insRun, error: insErr } = await supabase
        .from("composer_pipeline_runs")
        .insert({
          project_id: projectId,
          user_id: userId,
          status: "stitching",
          total_scenes: total,
          completed_scenes: ready,
          failed_scenes: failed,
          destination,
          allow_partial: allowPartial,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      runId = insRun.id;
    } else {
      await supabase
        .from("composer_pipeline_runs")
        .update({
          status: "stitching",
          completed_scenes: ready,
          failed_scenes: failed,
        })
        .eq("id", runId)
        .eq("user_id", userId);
    }

    // Trigger stitch via existing assemble function
    const assembleResp = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/compose-video-assemble`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ projectId }),
      }
    );

    const assembleData = await assembleResp.json().catch(() => ({}));
    if (!assembleResp.ok || !assembleData?.success) {
      const errMsg = assembleData?.error || `Assemble failed (${assembleResp.status})`;
      await supabase
        .from("composer_pipeline_runs")
        .update({
          status: "failed",
          error_message: errMsg,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return new Response(
        JSON.stringify({ error: errMsg, runId }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        runId,
        renderId: assembleData.renderId,
        scenesCount: assembleData.scenesCount,
        totalDuration: assembleData.totalDuration,
        destination,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[compose-stitch-and-handoff] error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
