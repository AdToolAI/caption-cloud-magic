// Bond QA — Live Sweep Asset Bootstrap
// Idempotent: generates a reusable test image (FLUX Schnell via Lovable AI Gateway)
// and copies a small sample video + audio into qa-test-assets bucket.
// Run once before the first live sweep; subsequent calls are cheap no-ops.

import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

// Reliable public MP4/MP3 samples — Big Buck Bunny H.264/AAC is the de-facto
// industry test sample and plays cleanly in Chromium on Lambda. The previous
// Google GTV "ForBiggerBlazes" URL triggered MEDIA_ELEMENT_ERROR Code 4 in
// Remotion Lambda Chromium (likely Range/CORS handling on storage.googleapis.com).
const SAMPLE_VIDEO_URL =
  "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4";
const SAMPLE_AUDIO_URL =
  "https://download.samplelib.com/mp3/sample-3s.mp3";

async function uploadIfMissing(
  supabase: any,
  path: string,
  fetchBody: () => Promise<{ blob: Blob; contentType: string }>,
  opts: { minBytes?: number; expectedMimePrefix?: string } = {},
): Promise<{ uploaded: boolean; repaired?: boolean; path: string; error?: string; reason?: string }> {
  // Check existing object — if it's clearly corrupt (too small, wrong mime,
  // looks like an XML S3 error response), overwrite it.
  let needsUpload = true;
  let repairing = false;
  try {
    const probe = await supabase.storage.from("qa-test-assets").createSignedUrl(path, 60);
    if (probe.data?.signedUrl) {
      const head = await fetch(probe.data.signedUrl, { method: "HEAD" });
      const len = Number(head.headers.get("content-length") || 0);
      const ct = head.headers.get("content-type") || "";
      const minBytes = opts.minBytes ?? 1024;
      const expectedMime = opts.expectedMimePrefix;
      const corrupt =
        len < minBytes ||
        ct.includes("xml") ||
        (expectedMime && !ct.startsWith(expectedMime));
      if (!corrupt) {
        needsUpload = false;
      } else {
        repairing = true;
        console.warn(`[bootstrap] repairing ${path} (size=${len}, ct=${ct})`);
      }
    }
  } catch {
    // Assume missing
  }
  if (!needsUpload) return { uploaded: false, path };

  try {
    const { blob, contentType } = await fetchBody();
    const { error } = await supabase.storage
      .from("qa-test-assets")
      .upload(path, blob, { contentType, upsert: true });
    if (error) return { uploaded: false, repaired: repairing, path, error: error.message };
    return { uploaded: true, repaired: repairing, path };
  } catch (e: any) {
    return { uploaded: false, repaired: repairing, path, error: e?.message || String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Admin guard
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: roleData } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleData) {
    return new Response(JSON.stringify({ error: "Admin only" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];

  // 1. Test image — try Lovable AI Gateway (Nano Banana Flash) first, fallback to public sample
  results.push(
    await uploadIfMissing(adminClient, "test-image.png", async () => {
      if (LOVABLE_API_KEY) {
        try {
          const aiRes = await fetch(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash-image",
                messages: [
                  {
                    role: "user",
                    content:
                      "A simple neutral product on a clean white studio background, soft even lighting, photo-realistic, 1024x1024",
                  },
                ],
                modalities: ["image", "text"],
              }),
            },
          );
          if (aiRes.ok) {
            const json = await aiRes.json();
            const dataUrl: string | undefined =
              json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
            if (dataUrl?.startsWith("data:image/")) {
              const [, base64] = dataUrl.split(",");
              const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
              return { blob: new Blob([bytes], { type: "image/png" }), contentType: "image/png" };
            }
          }
        } catch (e) {
          console.warn("[bootstrap] AI Gateway image gen failed, using fallback:", e);
        }
      }
      // Fallback: download public sample
      const r = await fetch(
        "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg",
      );
      return { blob: await r.blob(), contentType: r.headers.get("content-type") || "image/jpeg" };
    }),
  );

  // 2. Test video — copy a real, decodable MP4 (validates: size + mime)
  results.push(
    await uploadIfMissing(adminClient, "test-video-2s.mp4", async () => {
      const r = await fetch(SAMPLE_VIDEO_URL);
      if (!r.ok) throw new Error(`Sample video fetch failed: ${r.status}`);
      return { blob: await r.blob(), contentType: r.headers.get("content-type") || "video/mp4" };
    }, { minBytes: 50_000, expectedMimePrefix: "video/" }),
  );

  // 3. Test audio — copy public sample (validates: size + mime)
  results.push(
    await uploadIfMissing(adminClient, "test-audio.mp3", async () => {
      const r = await fetch(SAMPLE_AUDIO_URL);
      if (!r.ok) throw new Error(`Sample audio fetch failed: ${r.status}`);
      return { blob: await r.blob(), contentType: r.headers.get("content-type") || "audio/mpeg" };
    }, { minBytes: 5_000, expectedMimePrefix: "audio/" }),
  );

  // 4. Test portrait — REQUIRED by HeyGen Photo-Avatar (face detection enforced).
  // Primary: Lovable AI Gateway (Gemini Flash Image). Fallback: thispersondoesnotexist.com (always returns a face).
  results.push(
    await uploadIfMissing(adminClient, "test-portrait.png", async () => {
      if (LOVABLE_API_KEY) {
        try {
          const aiRes = await fetch(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash-image",
                messages: [
                  {
                    role: "user",
                    content:
                      "Professional studio portrait photograph of a friendly adult person, looking directly into the camera, neutral expression, clean white background, soft front lighting, sharp focus on face, photo-realistic, 1024x1024",
                  },
                ],
                modalities: ["image", "text"],
              }),
            },
          );
          if (aiRes.ok) {
            const json = await aiRes.json();
            const dataUrl: string | undefined =
              json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
            if (dataUrl?.startsWith("data:image/")) {
              const [, base64] = dataUrl.split(",");
              const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
              return { blob: new Blob([bytes], { type: "image/png" }), contentType: "image/png" };
            }
          }
        } catch (e) {
          console.warn("[bootstrap] AI Gateway portrait gen failed, using fallback:", e);
        }
      }
      // Fallback: thispersondoesnotexist.com — guarantees a synthetic face
      const r = await fetch("https://thispersondoesnotexist.com/", {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LovableBootstrap/1.0)" },
      });
      if (!r.ok) throw new Error(`Portrait fallback fetch failed: ${r.status}`);
      return { blob: await r.blob(), contentType: r.headers.get("content-type") || "image/jpeg" };
    }, { minBytes: 5_000, expectedMimePrefix: "image/" }),
  );

  // 5. FLUX Fill mask — programmatically built 512x512 PNG (black bg, white centered 256x256 square).
  // Used by the deep-sweep Magic Edit flow. Idempotent + no external fetch.
  // Built from raw bytes with valid CRC32 chunks (avoids base64-decode fragility that caused 400 errors).
  results.push(
    await uploadIfMissing(adminClient, "sample-mask-512.png", async () => {
      const png = buildMaskPng(512, 256);
      return { blob: new Blob([png], { type: "image/png" }), contentType: "image/png" };
    }, { minBytes: 200, expectedMimePrefix: "image/" }),
  );

  return new Response(
    JSON.stringify({
      success: true,
      bucket: "qa-test-assets",
      assets: results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
