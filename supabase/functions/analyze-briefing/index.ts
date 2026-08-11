// supabase/functions/analyze-briefing/index.ts
//
// ONE briefing-analysis endpoint for the whole platform.
//
// Replaces three drifting functions:
//   compose-video-storyboard  → mode=storyboard
//   parse-briefing            → mode=freeform
//   briefing-deep-parse       → mode=deep
//
// All three now share the same manifest schema, model chain and localised
// error surface (see supabase/functions/_shared/briefing/).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { handleStoryboard } from "../_shared/briefing/storyboard.ts";
import { handleDeepParse } from "../_shared/briefing/deep/index.ts";
import { handleManifest } from "../_shared/briefing/manifest.ts";
import { briefingErrorResponse } from "../_shared/briefing/errors.ts";

type Mode = "storyboard" | "freeform" | "deep";

function resolveMode(req: Request, body: Record<string, unknown>): Mode | null {
  const raw = String(
    new URL(req.url).searchParams.get("mode") ?? (body?.mode as string) ?? "",
  ).toLowerCase();
  if (raw === "storyboard" || raw === "structured") return "storyboard";
  if (raw === "freeform" || raw === "manifest") return "freeform";
  if (raw === "deep") return "deep";
  // Back-compat: infer from the payload shape when no mode is given.
  if (body && typeof body === "object") {
    if ("briefingText" in body || "rawText" in body) return "deep";
    if ("briefing" in body && typeof body.briefing === "object") return "storyboard";
    if ("briefing" in body) return "freeform";
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return briefingErrorResponse(400, corsHeaders, "invalid JSON body");
  }

  const mode = resolveMode(req, body);
  if (!mode) return briefingErrorResponse(400, corsHeaders, "unknown analysis mode");

  console.log(`[analyze-briefing] mode=${mode}`);
  switch (mode) {
    case "storyboard":
      return handleStoryboard(req, body);
    case "deep":
      return handleDeepParse(req, body);
    case "freeform":
      return handleManifest(req, corsHeaders, body);
  }
});
