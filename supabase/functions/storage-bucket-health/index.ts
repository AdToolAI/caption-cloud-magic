import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

// Critical buckets that must exist for the platform to work
const REQUIRED_BUCKETS = [
  "background-projects", // Smart Background, Picture Studio
  "media-assets",        // Mediathek (Hauptspeicher)
  "ai-videos",           // AI Video Studios (Sora, Kling, etc.)
  "universal-videos",    // Universal Video Creator Renders
  "video-assets",        // Director's Cut Source-Videos
  "audio-assets",        // Voiceover & Music
  "brand-logos",         // Brand Identity
  "thumbnails",          // Video-Thumbnails
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const start = Date.now();
    const { data: buckets, error } = await supabase.storage.listBuckets();
    const latency = Date.now() - start;

    if (error) {
      return new Response(
        JSON.stringify({ healthy: false, error: error.message, latency_ms: latency }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const existing = new Set((buckets || []).map((b) => b.name));
    const missing = REQUIRED_BUCKETS.filter((b) => !existing.has(b));
    const healthy = missing.length === 0;

    return new Response(
      JSON.stringify({
        healthy,
        latency_ms: latency,
        total_buckets: existing.size,
        required_buckets: REQUIRED_BUCKETS,
        missing_buckets: missing,
        warning: missing.length > 0 ? `Missing buckets: ${missing.join(", ")}` : undefined,
      }),
      {
        status: healthy ? 200 : 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ healthy: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
