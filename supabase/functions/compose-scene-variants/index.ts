/**
 * Phase 5.3 — Reroll Pro: Seed-Lock + Variant-Grid
 *
 * Generates 1–4 LTX-Video Fast-Preview variants in parallel, each with its own
 * seed. Persists results into `composer_scenes.seed_variations` (JSONB array)
 * so the UI can render a 2x2 grid and let the user pick the winning take.
 *
 * Cost-control:
 *   - LTX is ~$0.005 per 3s clip → 4 variants ≈ $0.02 / scene.
 *   - One in-flight batch per scene (existing 'generating' entries block reruns).
 *
 * Storage:
 *   - Each variant rehosted to `ai-videos/${userId}/variant-${sceneId}-${seed}.mp4`
 *     (RLS-safe: user id as first path segment).
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Replicate from "npm:replicate@0.25.2";

import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const LTX_MODEL = "lightricks/ltx-video";
const MAX_VARIANTS = 4;
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_MS = 90_000;

interface VariantRequest {
  sceneId: string;
  prompt: string;
  startImageUrl?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  /** Number of variants to generate (1–4). Default 4. */
  count?: number;
  /** Seed-Lock: when set, all variants are seeded around this value (±100). */
  parentSeed?: number;
}

interface VariantSlot {
  seed: number;
  status: "generating" | "ready" | "failed";
  previewUrl?: string;
  predictionId?: string;
  createdAt: string;
}

function pickSeeds(count: number, parentSeed?: number): number[] {
  const seeds: number[] = [];
  if (parentSeed != null) {
    // Variations around the parent: parent ± [10, 50, 100, 200]
    const offsets = [10, 50, 100, 200];
    for (let i = 0; i < count; i++) {
      seeds.push(Math.max(1, parentSeed + offsets[i]));
    }
  } else {
    for (let i = 0; i < count; i++) {
      seeds.push(Math.floor(Math.random() * 2_000_000) + 1);
    }
  }
  return seeds;
}

function ltxInputFor(
  prompt: string,
  seed: number,
  aspectRatio: "16:9" | "9:16" | "1:1",
  startImageUrl?: string,
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    prompt: prompt.slice(0, 500),
    length: 73, // ~3s @ 24fps
    width: aspectRatio === "9:16" ? 384 : aspectRatio === "1:1" ? 512 : 640,
    height: aspectRatio === "9:16" ? 640 : aspectRatio === "1:1" ? 512 : 384,
    target_size: 384,
    seed,
  };
  if (startImageUrl) input.image = startImageUrl;
  return input;
}

async function pollVariant(params: {
  predictionId: string;
  sceneId: string;
  userId: string;
  seed: number;
  replicate: Replicate;
}): Promise<{ success: boolean; previewUrl?: string }> {
  const { predictionId, sceneId, userId, seed, replicate } = params;
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const startedAt = Date.now();
  while (Date.now() - startedAt < MAX_POLL_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const prediction = await replicate.predictions.get(predictionId);

    if (prediction.status === "succeeded") {
      const out = Array.isArray(prediction.output)
        ? prediction.output[0]
        : prediction.output;
      if (!out) return { success: false };

      let permanentUrl = out as string;
      try {
        const dl = await fetch(out as string);
        if (!dl.ok) throw new Error(`Download ${dl.status}`);
        const buf = await dl.arrayBuffer();
        const fileName = `${userId}/variant-${sceneId}-${seed}.mp4`;
        const { error: upErr } = await supabaseAdmin.storage
          .from("ai-videos")
          .upload(fileName, buf, {
            contentType: "video/mp4",
            upsert: true,
          });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabaseAdmin.storage
          .from("ai-videos")
          .getPublicUrl(fileName);
        permanentUrl = publicUrl;
      } catch (storageErr) {
        console.error(
          "[compose-scene-variants] rehost failed, keeping Replicate URL:",
          storageErr,
        );
      }

      return { success: true, previewUrl: permanentUrl };
    }

    if (prediction.status === "failed" || prediction.status === "canceled") {
      console.error("[compose-scene-variants] LTX failed:", prediction.error);
      return { success: false };
    }
  }

  return { success: false };
}

async function persistVariantSlot(
  supabaseAdmin: ReturnType<typeof createClient>,
  sceneId: string,
  index: number,
  patch: Partial<VariantSlot>,
) {
  // Read-modify-write the JSONB array. Concurrency-safe enough for 4-wide
  // parallel writes because variants don't overlap on the same index.
  const { data: scene } = await supabaseAdmin
    .from("composer_scenes")
    .select("seed_variations")
    .eq("id", sceneId)
    .maybeSingle();

  const arr: VariantSlot[] = Array.isArray(scene?.seed_variations)
    ? (scene!.seed_variations as VariantSlot[])
    : [];

  if (!arr[index]) return;
  arr[index] = { ...arr[index], ...patch };

  await supabaseAdmin
    .from("composer_scenes")
    .update({ seed_variations: arr as any })
    .eq("id", sceneId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "video" });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );

    const { data: { user }, error: authError } = await supabaseClient.auth
      .getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as VariantRequest;
    if (!body.sceneId || !body.prompt || body.prompt.trim().length < 4) {
      return new Response(
        JSON.stringify({
          error: "sceneId and prompt (min 4 chars) are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const count = Math.min(MAX_VARIANTS, Math.max(1, body.count ?? 4));
    const aspectRatio = body.aspectRatio ?? "16:9";

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Ownership check
    const { data: scene, error: sceneErr } = await supabaseAdmin
      .from("composer_scenes")
      .select(
        "id, project_id, seed_variations, composer_projects!inner(user_id)",
      )
      .eq("id", body.sceneId)
      .maybeSingle();

    if (sceneErr || !scene) {
      return new Response(JSON.stringify({ error: "Scene not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // @ts-ignore nested join shape
    const ownerId = scene.composer_projects?.user_id;
    if (ownerId !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Block rerun if any existing slot is still generating
    const existing: VariantSlot[] = Array.isArray(scene.seed_variations)
      ? (scene.seed_variations as VariantSlot[])
      : [];
    if (existing.some((v) => v?.status === "generating")) {
      return new Response(
        JSON.stringify({
          ok: true,
          message: "Variants already in flight",
          variants: existing,
        }),
        {
          status: 202,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY") ??
      Deno.env.get("REPLICATE_API_TOKEN");
    if (!REPLICATE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "REPLICATE_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    const seeds = pickSeeds(count, body.parentSeed);

    // Submit all variants in parallel
    const submissions = await Promise.all(seeds.map(async (seed) => {
      try {
        const prediction = await replicate.predictions.create({
          model: LTX_MODEL,
          input: ltxInputFor(
            body.prompt,
            seed,
            aspectRatio,
            body.startImageUrl,
          ),
        });
        return { seed, predictionId: prediction.id, ok: true as const };
      } catch (err) {
        console.error(
          `[compose-scene-variants] LTX submit failed for seed ${seed}:`,
          err,
        );
        return { seed, ok: false as const };
      }
    }));

    // Initial slot state — overwrite the entire variations array.
    const initialSlots: VariantSlot[] = submissions.map((s) => ({
      seed: s.seed,
      status: s.ok ? "generating" : "failed",
      predictionId: s.ok ? s.predictionId : undefined,
      createdAt: new Date().toISOString(),
    }));

    await supabaseAdmin
      .from("composer_scenes")
      .update({ seed_variations: initialSlots as any })
      .eq("id", body.sceneId);

    // Background poll each successful submission
    submissions.forEach((sub, index) => {
      if (!sub.ok) return;
      // @ts-ignore EdgeRuntime is provided by Supabase
      EdgeRuntime.waitUntil((async () => {
        const result = await pollVariant({
          predictionId: sub.predictionId!,
          sceneId: body.sceneId,
          userId: user.id,
          seed: sub.seed,
          replicate,
        });
        await persistVariantSlot(supabaseAdmin, body.sceneId, index, {
          status: result.success ? "ready" : "failed",
          previewUrl: result.previewUrl,
        });
      })());
    });

    return new Response(
      JSON.stringify({
        ok: true,
        count: seeds.length,
        seeds,
        variants: initialSlots,
      }),
      {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[compose-scene-variants] error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
