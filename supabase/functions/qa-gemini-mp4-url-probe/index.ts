// QA-only probe: which MP4 URL / payload shape does Gemini accept with 200?
//
// POST /qa-gemini-mp4-url-probe
// Body: { plateUrl: string, expectedCount?: number, timestampSec?: number }
//
// Returns a per-variant table: { name, status, latencyMs, faces, preview }.
// No DB writes, no cache, no credit refunds. One-shot diagnostic.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_GW = "https://ai.gateway.lovable.dev/v1/chat/completions";
const TIMEOUT_MS = 35_000;
const MODEL = "google/gemini-2.5-flash";

interface VariantResult {
  name: string;
  description: string;
  url?: string;
  payloadShape: string;
  status: number | string;
  latencyMs: number;
  faces: number;
  preview: string;
  error?: string;
}

const PROMPT_TEXT = (want: number, ts: number) =>
  `Look at the frame at timestamp ${ts.toFixed(2)}s of this video. ` +
  `That frame should contain ${want} human face(s). ` +
  "Detect EVERY clearly visible human face and return a TIGHT bounding box around each face. " +
  "Return STRICT JSON only — no prose, no markdown fences. " +
  'Schema: {"faces":[{"slot":<int>,"center":[nx,ny],"bbox":[nx1,ny1,nx2,ny2],"confidence":<0..1>}]}. ' +
  "Coordinates MUST be NORMALIZED 0..1. If no faces, return empty faces array.";

function countFaces(content: unknown): number {
  try {
    const txt = String(content ?? "");
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return 0;
    const parsed = JSON.parse(m[0]);
    return Array.isArray(parsed?.faces) ? parsed.faces.length : 0;
  } catch {
    return 0;
  }
}

async function callGateway(
  lovableKey: string,
  content: unknown[],
): Promise<{ status: number | string; latencyMs: number; faces: number; preview: string; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const resp = await fetch(LOVABLE_GW, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content }],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const latencyMs = Date.now() - started;
    const text = await resp.text();
    let parsedContent: unknown = "";
    try {
      const j = JSON.parse(text);
      parsedContent = j?.choices?.[0]?.message?.content ?? "";
    } catch {
      // not JSON — keep raw text as preview
    }
    const preview = (typeof parsedContent === "string" && parsedContent.length > 0
      ? parsedContent
      : text).slice(0, 500);
    return {
      status: resp.status,
      latencyMs,
      faces: resp.ok ? countFaces(parsedContent) : 0,
      preview,
    };
  } catch (e) {
    clearTimeout(t);
    return {
      status: "EXCEPTION",
      latencyMs: Date.now() - started,
      faces: 0,
      preview: "",
      error: (e as Error)?.message ?? String(e),
    };
  }
}

async function fetchAsBase64(url: string, maxBytes = 18 * 1024 * 1024): Promise<{ b64: string; bytes: number; contentType: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url.slice(0, 80)} -> ${r.status}`);
  const ab = await r.arrayBuffer();
  if (ab.byteLength > maxBytes) throw new Error(`too large: ${ab.byteLength} bytes (cap ${maxBytes})`);
  const bytes = new Uint8Array(ab);
  // Chunked base64 to avoid stack overflow
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const b64 = btoa(bin);
  const contentType = r.headers.get("content-type") ?? "video/mp4";
  return { b64, bytes: ab.byteLength, contentType };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "qa-gemini-mp4-url-probe" });


  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { plateUrl?: string; expectedCount?: number; timestampSec?: number };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const plateUrl = String(body.plateUrl ?? "").trim();
  const expectedCount = Math.max(1, Math.min(8, Number(body.expectedCount ?? 2)));
  const timestampSec = Math.max(0.1, Number(body.timestampSec ?? 1.0));
  if (!plateUrl) {
    return new Response(JSON.stringify({ error: "plateUrl required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const prompt = PROMPT_TEXT(expectedCount, timestampSec);
  const variants: VariantResult[] = [];

  // ── V1: image_url with MP4 URL as-is ────────────────────────────────────
  variants.push({
    name: "V1_image_url_raw",
    description: "type=image_url, image_url.url = plate MP4 as-is",
    url: plateUrl,
    payloadShape: "image_url",
    ...(await callGateway(lovableKey, [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: plateUrl } },
    ])),
  });

  // ── V2: type=video_url ──────────────────────────────────────────────────
  variants.push({
    name: "V2_video_url",
    description: "type=video_url, video_url.url = plate MP4",
    url: plateUrl,
    payloadShape: "video_url",
    ...(await callGateway(lovableKey, [
      { type: "text", text: prompt },
      // @ts-ignore — non-OpenAI shape, testing Gateway tolerance
      { type: "video_url", video_url: { url: plateUrl } },
    ])),
  });

  // ── V3: type=input_video ───────────────────────────────────────────────
  variants.push({
    name: "V3_input_video",
    description: "type=input_video, input_video.url = plate MP4",
    url: plateUrl,
    payloadShape: "input_video",
    ...(await callGateway(lovableKey, [
      { type: "text", text: prompt },
      // @ts-ignore
      { type: "input_video", input_video: { url: plateUrl } },
    ])),
  });

  // ── V4: file_data (native Gemini shape via OpenRouter) ──────────────────
  variants.push({
    name: "V4_file_data",
    description: "type=file, file.file_data = plate MP4 URL + mime_type",
    url: plateUrl,
    payloadShape: "file/file_data",
    ...(await callGateway(lovableKey, [
      { type: "text", text: prompt },
      // @ts-ignore
      { type: "file", file: { file_data: plateUrl, mime_type: "video/mp4" } },
    ])),
  });

  // ── V5: re-host via signed Supabase URL (if input is supabase public) ──
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && supabaseKey && plateUrl.includes("/storage/v1/object/public/")) {
      const m = plateUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
      if (m) {
        const bucket = m[1];
        const path = decodeURIComponent(m[2]);
        const sb = createClient(supabaseUrl, supabaseKey);
        const { data: signed, error } = await sb.storage
          .from(bucket)
          .createSignedUrl(path, 3600);
        if (!error && signed?.signedUrl) {
          variants.push({
            name: "V5_signed_storage_url",
            description: "type=image_url with Supabase signed URL (1h TTL)",
            url: signed.signedUrl,
            payloadShape: "image_url",
            ...(await callGateway(lovableKey, [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: signed.signedUrl } },
            ])),
          });
        } else {
          variants.push({
            name: "V5_signed_storage_url",
            description: "skipped — signing failed",
            payloadShape: "image_url",
            status: "SKIPPED",
            latencyMs: 0,
            faces: 0,
            preview: error?.message ?? "no signed url",
          });
        }
      }
    } else {
      variants.push({
        name: "V5_signed_storage_url",
        description: "skipped — not a Supabase public URL",
        payloadShape: "image_url",
        status: "SKIPPED",
        latencyMs: 0,
        faces: 0,
        preview: "",
      });
    }
  } catch (e) {
    variants.push({
      name: "V5_signed_storage_url",
      description: "exception",
      payloadShape: "image_url",
      status: "EXCEPTION",
      latencyMs: 0,
      faces: 0,
      preview: "",
      error: (e as Error)?.message,
    });
  }

  // ── V6: inline data URL (base64) ────────────────────────────────────────
  try {
    const { b64, bytes, contentType } = await fetchAsBase64(plateUrl);
    const dataUrl = `data:${contentType};base64,${b64}`;
    variants.push({
      name: "V6_image_url_base64",
      description: `type=image_url with data:${contentType};base64 (${bytes} bytes)`,
      payloadShape: "image_url",
      ...(await callGateway(lovableKey, [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: dataUrl } },
      ])),
    });
  } catch (e) {
    variants.push({
      name: "V6_image_url_base64",
      description: "fetch/base64 failed",
      payloadShape: "image_url",
      status: "EXCEPTION",
      latencyMs: 0,
      faces: 0,
      preview: "",
      error: (e as Error)?.message,
    });
  }

  const winner = variants.find((v) => typeof v.status === "number" && v.status === 200 && v.faces > 0);

  const summary = {
    plateUrl,
    expectedCount,
    timestampSec,
    winner: winner?.name ?? null,
    variants: variants.map((v) => ({
      name: v.name,
      status: v.status,
      latencyMs: v.latencyMs,
      faces: v.faces,
      description: v.description,
      preview: v.preview.slice(0, 240),
      error: v.error,
    })),
  };

  console.log("[qa-gemini-mp4-url-probe]", JSON.stringify(summary, null, 2));

  return new Response(JSON.stringify(summary, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
