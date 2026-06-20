// Lipsync Diagnostic (v145)
// Two modes:
//  1. Default (Sync.so variant matrix) — 5 ASD variants in parallel.
//  2. mode="plate-face-forensic" — extracts 3 frames from a plate,
//     asks Gemini Vision to count clearly-visible faces with mouth area.
//     Proves whether the plate IMAGE CONTENT (not Sync.so delivery) is
//     the reason face_gate fails.
// Live pipeline (compose-dialog-segments, sync-so-webhook) is NOT touched.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Replicate from "npm:replicate@0.25.2";
import { rehostPlate } from "../_shared/rehostPlate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYNC_API_BASE = "https://api.sync.so/v2";
const VERSION = "v145.0";

console.log(`[lipsync-diagnostic] BOOT ${VERSION} deploy=${Date.now()}`);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type VariantId = "A_auto" | "B_coords" | "C_bbox_url" | "D_bbox_inline" | "E_lipsync2pro";

interface VariantSpec {
  id: VariantId;
  label: string;
  model: "sync-3" | "lipsync-2-pro";
  options: Record<string, unknown>;
}

function buildVariants(input: {
  coords?: [number, number] | null;
  boundingBoxesUrl?: string | null;
}): VariantSpec[] {
  const variants: VariantSpec[] = [];

  variants.push({
    id: "A_auto",
    label: "A · sync-3 auto_detect",
    model: "sync-3",
    options: {
      sync_mode: "cut_off",
      active_speaker_detection: { auto_detect: true },
    },
  });

  if (input.coords && input.coords.length === 2) {
    variants.push({
      id: "B_coords",
      label: "B · sync-3 flat coords",
      model: "sync-3",
      options: {
        sync_mode: "cut_off",
        active_speaker_detection: {
          auto_detect: false,
          frame_number: 0,
          coordinates: input.coords,
        },
      },
    });
  }

  if (input.boundingBoxesUrl) {
    variants.push({
      id: "C_bbox_url",
      label: "C · sync-3 bounding_boxes_url",
      model: "sync-3",
      options: {
        sync_mode: "cut_off",
        active_speaker_detection: {
          auto_detect: false,
          bounding_boxes_url: input.boundingBoxesUrl,
        },
      },
    });
  }

  if (input.coords && input.coords.length === 2) {
    // simple full-fill: same box every frame, derived from coords (small box around point)
    const [x, y] = input.coords;
    const half = 80;
    const box: [number, number, number, number] = [
      Math.max(0, x - half),
      Math.max(0, y - half),
      Math.max(0, x - half) + half * 2,
      Math.max(0, y - half) + half * 2,
    ];
    // Sync.so accepts inline as one array per frame; we send a static list of 60 frames
    const inline = Array.from({ length: 60 }, () => box);
    variants.push({
      id: "D_bbox_inline",
      label: "D · sync-3 bounding_boxes inline",
      model: "sync-3",
      options: {
        sync_mode: "cut_off",
        active_speaker_detection: {
          auto_detect: false,
          bounding_boxes: inline,
        },
      },
    });
  }

  variants.push({
    id: "E_lipsync2pro",
    label: "E · lipsync-2-pro (different model)",
    model: "lipsync-2-pro",
    options: {
      sync_mode: "cut_off",
    },
  });

  return variants;
}

async function dispatchVariant(params: {
  apiKey: string;
  plateUrl: string;
  audioUrl: string;
  variant: VariantSpec;
}): Promise<{ jobId?: string; error?: string; raw?: unknown }> {
  try {
    const body = {
      model: params.variant.model,
      input: [
        { type: "video", url: params.plateUrl },
        { type: "audio", url: params.audioUrl },
      ],
      options: params.variant.options,
    };
    const res = await fetch(`${SYNC_API_BASE}/generate`, {
      method: "POST",
      headers: {
        "x-api-key": params.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const txt = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(txt); } catch { /* noop */ }
    if (!res.ok) {
      return { error: `HTTP ${res.status} ${txt.slice(0, 400)}`, raw: parsed };
    }
    const jobId = parsed?.id || parsed?.job_id;
    if (!jobId) return { error: `no job id in response: ${txt.slice(0, 200)}`, raw: parsed };
    return { jobId, raw: parsed };
  } catch (e) {
    return { error: `dispatch_exception: ${(e as Error).message}` };
  }
}

async function pollJob(params: {
  apiKey: string;
  jobId: string;
  timeoutMs: number;
}): Promise<{ status: string; outputUrl?: string; error?: string; raw?: unknown }> {
  const started = Date.now();
  while (Date.now() - started < params.timeoutMs) {
    try {
      const res = await fetch(`${SYNC_API_BASE}/generate/${params.jobId}`, {
        headers: { "x-api-key": params.apiKey },
      });
      const txt = await res.text();
      let parsed: any = null;
      try { parsed = JSON.parse(txt); } catch { /* noop */ }
      const status = String(parsed?.status || "unknown").toUpperCase();
      if (status === "COMPLETED") {
        return { status, outputUrl: parsed?.outputUrl || parsed?.output_url, raw: parsed };
      }
      if (status === "FAILED" || status === "REJECTED" || status === "CANCELED") {
        return { status, error: parsed?.error || parsed?.errorMessage || txt.slice(0, 300), raw: parsed };
      }
    } catch (e) {
      // transient — keep polling
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return { status: "TIMEOUT", error: `poll timed out after ${params.timeoutMs}ms` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SYNC_API_KEY =
    Deno.env.get("SYNC_API_KEY") ||
    Deno.env.get("SYNC_SO_API_KEY") ||
    Deno.env.get("SYNCSO_API_KEY");
  if (!SYNC_API_KEY) return json({ error: "Sync.so API key not configured" }, 500);

  // Auth: must be admin
  const authHeader = req.headers.get("Authorization") || "";
  const accessToken = authHeader.replace(/^Bearer /i, "");
  if (!accessToken) return json({ error: "missing auth" }, 401);

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "auth failed" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roleData } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleData) return json({ error: "admin role required" }, 403);

  // Daily cap: 5 runs per admin per 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("lipsync_diagnostic_runs")
    .select("id", { count: "exact", head: true })
    .eq("created_by", userData.user.id)
    .gte("created_at", since);
  if ((count ?? 0) >= 5) {
    return json({ error: "daily limit reached (5 runs / 24h)" }, 429);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  // ─── v145: Plate-Face-Forensic mode ───────────────────────────────────
  if (body.mode === "plate-face-forensic") {
    return await runForensic({ admin, body, userId: userData.user.id });
  }

  const plateUrl: string = body.plate_url;
  const audioUrl: string = body.audio_url;
  if (!plateUrl || !audioUrl) return json({ error: "plate_url and audio_url required" }, 400);

  const coords: [number, number] | null =
    Array.isArray(body.coords) && body.coords.length === 2
      ? [Number(body.coords[0]), Number(body.coords[1])]
      : null;
  const boundingBoxesUrl: string | null = body.bounding_boxes_url || null;

  // Create run row
  const { data: runRow, error: insErr } = await admin
    .from("lipsync_diagnostic_runs")
    .insert({
      created_by: userData.user.id,
      status: "running",
      plate_url: plateUrl,
      audio_url: audioUrl,
      speaker_label: body.speaker_label ?? null,
      coords,
      bounding_boxes_url: boundingBoxesUrl,
      source_scene_id: body.source_scene_id ?? null,
      source_pass_idx: body.source_pass_idx ?? null,
      variants: [],
    })
    .select()
    .single();
  if (insErr || !runRow) return json({ error: insErr?.message || "insert failed" }, 500);

  const variants = buildVariants({ coords, boundingBoxesUrl });

  // Dispatch ALL variants in parallel, then poll all in parallel
  const work = async () => {
    // v143 — Rehost plate + audio into our own buckets before dispatch so
    // expired Replicate/S3 URLs don't poison the diagnostic.
    let stablePlateUrl = plateUrl;
    let rehostNote: string | null = null;
    try {
      const rh = await rehostPlate(admin, plateUrl, {
        sceneId: body.source_scene_id ?? runRow.id,
        passIdx: body.source_pass_idx ?? 0,
        kind: "diagnostic",
        ownerId: userData.user.id,
      });
      stablePlateUrl = rh.url;
      rehostNote = `${rh.uploaded ? "uploaded" : "cached"} ${rh.bytes}B in ${rh.durationMs}ms`;
      console.log(`[lipsync-diagnostic] v143_rehost ${rehostNote} → ${rh.path}`);
    } catch (e) {
      console.warn(`[lipsync-diagnostic] v143_rehost FAILED: ${(e as Error).message}`);
      rehostNote = `failed: ${(e as Error).message}`;
    }

    const dispatched = await Promise.all(
      variants.map(async (v) => {
        const d = await dispatchVariant({ apiKey: SYNC_API_KEY, plateUrl: stablePlateUrl, audioUrl, variant: v });
        return { variant: v, dispatch: d };
      }),
    );

    // Initial write: jobs dispatched
    await admin
      .from("lipsync_diagnostic_runs")
      .update({
        variants: dispatched.map((d) => ({
          id: d.variant.id,
          label: d.variant.label,
          model: d.variant.model,
          job_id: d.dispatch.jobId ?? null,
          dispatch_error: d.dispatch.error ?? null,
          status: d.dispatch.jobId ? "PENDING" : "DISPATCH_FAILED",
        })),
      })
      .eq("id", runRow.id);

    // Poll all that dispatched ok
    const polled = await Promise.all(
      dispatched.map(async (d) => {
        if (!d.dispatch.jobId) {
          return {
            id: d.variant.id,
            label: d.variant.label,
            model: d.variant.model,
            job_id: null,
            status: "DISPATCH_FAILED",
            dispatch_error: d.dispatch.error ?? null,
          };
        }
        const r = await pollJob({ apiKey: SYNC_API_KEY, jobId: d.dispatch.jobId, timeoutMs: 8 * 60 * 1000 });
        return {
          id: d.variant.id,
          label: d.variant.label,
          model: d.variant.model,
          job_id: d.dispatch.jobId,
          status: r.status,
          output_url: r.outputUrl ?? null,
          error: r.error ?? null,
        };
      }),
    );

    await admin
      .from("lipsync_diagnostic_runs")
      .update({ variants: polled, status: "completed" })
      .eq("id", runRow.id);
  };

  // @ts-ignore — EdgeRuntime.waitUntil is available on Supabase edge runtime
  EdgeRuntime.waitUntil(work().catch(async (e) => {
    await admin
      .from("lipsync_diagnostic_runs")
      .update({ status: "failed", error_message: (e as Error).message })
      .eq("id", runRow.id);
  }));

  return json({ run_id: runRow.id, variants_count: variants.length, version: VERSION }, 202);
});
