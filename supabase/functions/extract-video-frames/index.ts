// extract-video-frames v1.0.0 — Block M (Hybrid Production)
//
// Generic frame extractor supporting first / last / both.
// Used by `hybrid-extend-scene` to anchor backward / forward extends.
//
// Strategy: re-uses the same Replicate model as `extract-video-last-frame`
// (lucataco/ffmpeg-extract-frame). The first frame is extracted at t=0.05s
// (a hair after start to avoid black 0-frames), the last at t=duration-0.05s.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

type FrameMode = "first" | "last" | "both";

interface RequestBody {
  videoUrl: string;
  mode: FrameMode;
  durationSeconds?: number;
  sceneId?: string;
  projectId?: string;
}

const REPLICATE_MODEL = "lucataco/ffmpeg-extract-frame";

async function extractAndUpload(params: {
  replicate: Replicate;
  supabase: ReturnType<typeof createClient>;
  videoUrl: string;
  timestamp: number;
  projectId: string;
  sceneId: string;
  label: "first" | "last";
}): Promise<string> {
  const { replicate, supabase, videoUrl, timestamp, projectId, sceneId, label } = params;

  let frameOutput: any;
  try {
    frameOutput = await replicate.run(REPLICATE_MODEL as `${string}/${string}`, {
      input: { video: videoUrl, timestamp },
    });
  } catch (e) {
    throw new Error(`Replicate frame extract failed (${label}): ${(e as Error).message}`);
  }

  const frameUrl: string =
    typeof frameOutput === "string"
      ? frameOutput
      : Array.isArray(frameOutput)
      ? frameOutput[0]
      : frameOutput?.url?.() ?? frameOutput?.url ?? "";

  if (!frameUrl || typeof frameUrl !== "string") {
    throw new Error(`Replicate returned no ${label}-frame URL`);
  }

  const pngRes = await fetch(frameUrl);
  if (!pngRes.ok) throw new Error(`Failed to fetch ${label}-frame: ${pngRes.status}`);
  const pngBytes = new Uint8Array(await pngRes.arrayBuffer());

  const storagePath = `${projectId}/hybrid-frames/${sceneId}-${label}-${Date.now()}.png`;

  const { error: uploadErr } = await supabase.storage
    .from("composer-frames")
    .upload(storagePath, pngBytes, {
      contentType: "image/png",
      upsert: true,
      cacheControl: "31536000",
    });
  if (uploadErr) throw new Error(`Upload (${label}) failed: ${uploadErr.message}`);

  const { data: pub } = supabase.storage.from("composer-frames").getPublicUrl(storagePath);
  return pub.publicUrl;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
    if (!REPLICATE_API_TOKEN) throw new Error("REPLICATE_API_TOKEN missing");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = (await req.json()) as RequestBody;
    if (!body.videoUrl) {
      return new Response(JSON.stringify({ error: "videoUrl required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["first", "last", "both"].includes(body.mode)) {
      return new Response(JSON.stringify({ error: "mode must be first|last|both" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const projectId = body.projectId ?? "shared";
    const sceneId = body.sceneId ?? crypto.randomUUID();
    const durationSec = Math.max(body.durationSeconds ?? 5, 0.5);

    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });

    const result: { firstFrameUrl?: string; lastFrameUrl?: string } = {};

    if (body.mode === "first" || body.mode === "both") {
      result.firstFrameUrl = await extractAndUpload({
        replicate, supabase,
        videoUrl: body.videoUrl,
        timestamp: 0.05,
        projectId, sceneId,
        label: "first",
      });
    }

    if (body.mode === "last" || body.mode === "both") {
      result.lastFrameUrl = await extractAndUpload({
        replicate, supabase,
        videoUrl: body.videoUrl,
        timestamp: Math.max(durationSec - 0.05, 0.05),
        projectId, sceneId,
        label: "last",
      });
    }

    // Persist on the source scene if known (caching)
    if (body.sceneId) {
      const update: Record<string, string> = {};
      if (result.firstFrameUrl) update.first_frame_url = result.firstFrameUrl;
      if (result.lastFrameUrl) update.last_frame_url = result.lastFrameUrl;
      if (Object.keys(update).length > 0) {
        await supabase.from("composer_scenes").update(update).eq("id", body.sceneId);
      }
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[extract-video-frames] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
