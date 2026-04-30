// render-multi-format-batch v1.0.0
// Triggers parallel compose-video-assemble jobs for multiple platform presets
// in a single click. Each preset becomes its own composer_exports row + render.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

interface PresetInput {
  key: string;
  platform: string;
  aspect: '9:16' | '16:9' | '1:1' | '4:5';
  width: number;
  height: number;
  label?: string;
}

interface ReqBody {
  projectId: string;
  presets: PresetInput[];
}

const COST_PER_EXPORT = 0.10;
const MAX_CONCURRENT = 3; // Lambda concurrency safety

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    // Auth check
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = (await req.json()) as ReqBody;
    if (!body.projectId) throw new Error("projectId required");
    if (!body.presets?.length) throw new Error("presets required");
    if (body.presets.length > 6) throw new Error("Maximum 6 presets per batch");

    // Verify project ownership
    const { data: project } = await admin
      .from("composer_projects")
      .select("id, user_id, title")
      .eq("id", body.projectId)
      .single();
    if (!project || project.user_id !== user.id) {
      throw new Error("Project not found or access denied");
    }

    const batchId = crypto.randomUUID();

    // 1. Insert all export rows up-front so UI shows them immediately
    const exportRows = body.presets.map((p) => ({
      user_id: user.id,
      project_id: body.projectId,
      platform: p.platform,
      preset_key: p.key,
      aspect_ratio: p.aspect,
      width: p.width,
      height: p.height,
      status: 'pending',
      estimated_cost_euros: COST_PER_EXPORT,
      batch_id: batchId,
    }));

    const { data: insertedExports, error: insertErr } = await admin
      .from('composer_exports')
      .insert(exportRows)
      .select('id, preset_key, aspect_ratio');

    if (insertErr || !insertedExports) {
      throw new Error(`Failed to create export rows: ${insertErr?.message}`);
    }

    console.log(`[multi-format-batch] Created ${insertedExports.length} export rows for batch ${batchId}`);

    // 2. Trigger compose-video-assemble in parallel batches (respecting concurrency)
    const triggerExport = async (exportRow: { id: string; preset_key: string; aspect_ratio: string }) => {
      try {
        const { data, error } = await admin.functions.invoke('compose-video-assemble', {
          body: {
            projectId: body.projectId,
            aspectOverride: exportRow.aspect_ratio,
            exportId: exportRow.id,
          },
          headers: { Authorization: authHeader },
        });

        if (error || !data?.success) {
          await admin.from('composer_exports').update({
            status: 'failed',
            error_message: error?.message || data?.error || 'Render trigger failed',
          }).eq('id', exportRow.id);
          return { ok: false, exportId: exportRow.id, error: error?.message || data?.error };
        }

        return { ok: true, exportId: exportRow.id };
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        await admin.from('composer_exports').update({
          status: 'failed',
          error_message: msg,
        }).eq('id', exportRow.id);
        return { ok: false, exportId: exportRow.id, error: msg };
      }
    };

    // Process in chunks to respect Lambda concurrency
    const results: Array<{ ok: boolean; exportId: string; error?: string }> = [];
    for (let i = 0; i < insertedExports.length; i += MAX_CONCURRENT) {
      const chunk = insertedExports.slice(i, i + MAX_CONCURRENT);
      const chunkResults = await Promise.all(chunk.map(triggerExport));
      results.push(...chunkResults);
    }

    const triggered = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;

    return new Response(
      JSON.stringify({
        success: true,
        batchId,
        triggered,
        failed,
        totalCost: COST_PER_EXPORT * triggered,
        exportIds: insertedExports.map(e => e.id),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[render-multi-format-batch] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
