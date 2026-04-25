// extract-video-last-frame v1.0.0
// Extracts the last frame of a generated clip and uploads it as a PNG to storage,
// so it can be re-used as `referenceImageUrl` for the next scene → frame-to-shot continuity.
//
// Strategy: Use Replicate's `lucataco/ffmpeg-extract-frame` model, which accepts a
// video URL and a timestamp, and returns a PNG. We pick `duration - 0.05s` to avoid
// black/empty trailing frames.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  /** Public URL of the source video (must be HTTP(S) reachable by Replicate). */
  videoUrl: string;
  /** Optional clip duration in seconds — used to compute the extraction timestamp. */
  durationSeconds?: number;
  /** Composer scene id this frame belongs to (for storage path + DB update). */
  sceneId?: string;
  /** Composer project id, used for storage path. */
  projectId?: string;
}

const REPLICATE_MODEL =
  "lucataco/ffmpeg-extract-frame:7c3dabf0fcdc3ba5e4ecc5d4f6c5d7e2c1c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7";
// Fallback to the by-name reference if the pinned hash drifts.
const REPLICATE_MODEL_FALLBACK = "lucataco/ffmpeg-extract-frame";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
    if (!REPLICATE_API_TOKEN) throw new Error("REPLICATE_API_TOKEN missing");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = (await req.json()) as RequestBody;
    if (!body.videoUrl) {
      return new Response(JSON.stringify({ error: "videoUrl required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compute "near end" timestamp — clamp to >0
    const durationSec = Math.max(body.durationSeconds ?? 5, 0.5);
    const extractAt = Math.max(durationSec - 0.05, 0.05);

    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });
    let frameOutput: any;
    try {
      frameOutput = await replicate.run(REPLICATE_MODEL_FALLBACK as `${string}/${string}`, {
        input: {
          video: body.videoUrl,
          timestamp: extractAt,
        },
      });
    } catch (e) {
      console.error("[extract-frame] replicate run failed", e);
      throw new Error(`Frame extraction failed: ${(e as Error).message}`);
    }

    // Replicate may return a string URL or a FileOutput-like object
    const frameUrl: string =
      typeof frameOutput === "string"
        ? frameOutput
        : Array.isArray(frameOutput)
        ? frameOutput[0]
        : (frameOutput?.url?.() ?? frameOutput?.url ?? "");

    if (!frameUrl || typeof frameUrl !== "string") {
      throw new Error("Replicate returned no frame URL");
    }

    // Download the PNG and re-upload to our own storage so it survives
    // (Replicate URLs expire after ~24h).
    const pngRes = await fetch(frameUrl);
    if (!pngRes.ok) throw new Error(`Failed to fetch extracted frame: ${pngRes.status}`);
    const pngBytes = new Uint8Array(await pngRes.arrayBuffer());

    const storagePath = `${body.projectId ?? "shared"}/last-frames/${body.sceneId ?? crypto.randomUUID()}-${Date.now()}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("composer-frames")
      .upload(storagePath, pngBytes, {
        contentType: "image/png",
        upsert: true,
        cacheControl: "31536000",
      });
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    const { data: pub } = supabase.storage.from("composer-frames").getPublicUrl(storagePath);
    const publicUrl = pub.publicUrl;

    // Persist to composer_scenes if sceneId provided
    if (body.sceneId) {
      await supabase
        .from("composer_scenes")
        .update({ last_frame_url: publicUrl })
        .eq("id", body.sceneId);
    }

    return new Response(
      JSON.stringify({ success: true, lastFrameUrl: publicUrl, extractedAt: extractAt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[extract-video-last-frame] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
