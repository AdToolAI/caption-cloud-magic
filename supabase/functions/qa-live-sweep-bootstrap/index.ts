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

const SAMPLE_VIDEO_URL =
  "https://storage.googleapis.com/lovable-public/qa-mock/sample-5s.mp4";
const SAMPLE_AUDIO_URL =
  "https://storage.googleapis.com/lovable-public/qa-mock/sample-5s.mp3";

async function uploadIfMissing(
  supabase: any,
  path: string,
  fetchBody: () => Promise<{ blob: Blob; contentType: string }>,
): Promise<{ uploaded: boolean; path: string; error?: string }> {
  // Probe via signed URL — exists() needs list permissions; createSignedUrl returns 400 on missing
  const probe = await supabase.storage.from("qa-test-assets").createSignedUrl(path, 60);
  if (probe.data?.signedUrl) {
    return { uploaded: false, path };
  }

  try {
    const { blob, contentType } = await fetchBody();
    const { error } = await supabase.storage
      .from("qa-test-assets")
      .upload(path, blob, { contentType, upsert: true });
    if (error) return { uploaded: false, path, error: error.message };
    return { uploaded: true, path };
  } catch (e: any) {
    return { uploaded: false, path, error: e?.message || String(e) };
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

  // 2. Test video — copy public sample (small 5s clip)
  results.push(
    await uploadIfMissing(adminClient, "test-video-2s.mp4", async () => {
      const r = await fetch(SAMPLE_VIDEO_URL);
      return { blob: await r.blob(), contentType: r.headers.get("content-type") || "video/mp4" };
    }),
  );

  // 3. Test audio — copy public sample
  results.push(
    await uploadIfMissing(adminClient, "test-audio.mp3", async () => {
      const r = await fetch(SAMPLE_AUDIO_URL);
      return { blob: await r.blob(), contentType: r.headers.get("content-type") || "audio/mpeg" };
    }),
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
