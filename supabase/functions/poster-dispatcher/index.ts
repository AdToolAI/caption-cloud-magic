import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("[Poster Dispatcher] Running...");

    // Find pending jobs that are due
    const { data: jobs, error: fetchError } = await supabase
      .from("post_jobs")
      .select("*, schedule_blocks(*), calendar_events(*)")
      .eq("status", "pending")
      .lte("run_at", new Date().toISOString())
      .limit(20);

    if (fetchError) throw fetchError;

    if (!jobs || jobs.length === 0) {
      console.log("[Poster Dispatcher] No pending jobs");
      return new Response(
        JSON.stringify({ processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let succeeded = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        // Mark as running
        await supabase
          .from("post_jobs")
          .update({ status: "running" })
          .eq("id", job.id);

        // Call existing publish function via calendar_event
        if (job.calendar_event_id) {
          const { error: publishError } = await supabase.functions.invoke("publish", {
            body: {
              text_content: job.content_snapshot.caption,
              media: job.content_snapshot.media,
              channels: [job.platform],
              calendar_event_id: job.calendar_event_id,
            },
          });

          if (publishError) throw publishError;

          // Update job status
          await supabase
            .from("post_jobs")
            .update({
              status: "success",
              posted_at: new Date().toISOString(),
            })
            .eq("id", job.id);

          // Update schedule_block status
          if (job.schedule_id) {
            await supabase
              .from("schedule_blocks")
              .update({ status: "posted" })
              .eq("id", job.schedule_id);
          }

          succeeded++;
        }
      } catch (error) {
        console.error(`[Poster Dispatcher] Job ${job.id} failed:`, error);

        await supabase
          .from("post_jobs")
          .update({
            status: "error",
            error: String(error),
          })
          .eq("id", job.id);

        if (job.schedule_id) {
          await supabase
            .from("schedule_blocks")
            .update({ status: "failed" })
            .eq("id", job.schedule_id);
        }

        failed++;
      }
    }

    console.log(`[Poster Dispatcher] ${succeeded} succeeded, ${failed} failed`);

    return new Response(
      JSON.stringify({ processed: jobs.length, succeeded, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[Poster Dispatcher] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
