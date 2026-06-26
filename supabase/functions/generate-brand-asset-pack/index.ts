// Brand Asset Factory: generates a starter pack of brand assets in parallel
// using Lovable AI Gateway (google/gemini-2.5-flash-image / "Nano Banana").
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AssetSpec {
  kind: string;
  prompt: string;
  width: number;
  height: number;
}

const buildSpecs = (kit: {
  brand_name: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  mood: string | null;
}): AssetSpec[] => {
  const name = kit.brand_name ?? "Brand";
  const palette = [kit.primary_color, kit.secondary_color, kit.accent_color]
    .filter(Boolean)
    .join(", ") || "modern palette";
  const mood = kit.mood ?? "premium minimal cinematic";
  const base = `Brand "${name}". Palette: ${palette}. Mood: ${mood}.`;

  return [
    { kind: "logo-light", prompt: `${base} Minimal wordmark logo on white background, vector, centered, generous padding.`, width: 1024, height: 1024 },
    { kind: "logo-dark",  prompt: `${base} Minimal wordmark logo on deep black background, vector, centered.`,           width: 1024, height: 1024 },
    { kind: "logo-mono",  prompt: `${base} Monochrome single-color wordmark logo, flat, centered on white.`,              width: 1024, height: 1024 },
    { kind: "app-icon",   prompt: `${base} Square app icon, rounded corners, bold abstract symbol, no text.`,             width: 1024, height: 1024 },
    { kind: "social-cover-instagram",  prompt: `${base} Instagram cover, editorial layout, large brand statement, on-brand palette.`, width: 1024, height: 1024 },
    { kind: "social-cover-linkedin",   prompt: `${base} LinkedIn cover banner, professional editorial layout, brand palette.`,        width: 1920, height: 480 },
    { kind: "pattern-subtle",          prompt: `${base} Subtle repeating brand pattern, seamless tile, low contrast.`,                width: 1024, height: 1024 },
    { kind: "email-header",            prompt: `${base} Email header banner, brand wordmark left, abstract on-brand graphic right.`,  width: 1600, height: 400 },
  ];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("missing_lovable_api_key");

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { brandKitId } = await req.json();
    if (!brandKitId) throw new Error("missing_brand_kit_id");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: kit, error: kitErr } = await admin
      .from("brand_kits")
      .select("id, user_id, brand_name, primary_color, secondary_color, accent_color, mood")
      .eq("id", brandKitId)
      .single();
    if (kitErr || !kit) throw new Error("brand_kit_not_found");
    if (kit.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const specs = buildSpecs(kit);

    const results = await Promise.allSettled(specs.map(async (spec) => {
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: spec.prompt }],
          modalities: ["image", "text"],
        }),
      });
      if (!aiRes.ok) throw new Error(`ai_${aiRes.status}`);
      const json = await aiRes.json();
      const imageB64: string | undefined =
        json?.choices?.[0]?.message?.images?.[0]?.image_url?.url ??
        json?.choices?.[0]?.message?.images?.[0]?.url;
      if (!imageB64) throw new Error("no_image_returned");

      // imageB64 is a data URL "data:image/png;base64,...."
      const m = imageB64.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (!m) throw new Error("invalid_image_payload");
      const mime = m[1];
      const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
      const ext = mime.includes("png") ? "png" : "jpg";
      const path = `${user.id}/${brandKitId}/${spec.kind}-${Date.now()}.${ext}`;

      const up = await admin.storage.from("brand-assets").upload(path, bin, {
        contentType: mime, upsert: true,
      });
      if (up.error) throw up.error;

      const { data: pub } = admin.storage.from("brand-assets").getPublicUrl(path);

      const ins = await admin.from("brand_assets").insert({
        brand_kit_id: brandKitId,
        user_id: user.id,
        kind: spec.kind,
        url: pub.publicUrl,
        meta: { width: spec.width, height: spec.height, prompt: spec.prompt },
      }).select("id").single();
      if (ins.error) throw ins.error;

      return { kind: spec.kind, url: pub.publicUrl };
    }));

    const ok = results.filter((r) => r.status === "fulfilled").map((r: any) => r.value);
    const failed = results
      .map((r, i) => ({ r, kind: specs[i].kind }))
      .filter((x) => x.r.status === "rejected")
      .map((x) => ({ kind: x.kind, error: String((x.r as any).reason?.message ?? x.r) }));

    return new Response(JSON.stringify({ ok, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[generate-brand-asset-pack]", err);
    return new Response(JSON.stringify({ error: String((err as Error).message ?? err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
