// Public Edge Function: Instant Avatar Turnaround Demo
// Generates 5 camera angles of a user-uploaded portrait via Lovable AI Gateway
// (Nano Banana 2 / gemini-3.1-flash-image). Rate-limited per IP hash.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANGLES = [-60, -30, 0, 30, 60];

const STYLE_SUFFIX: Record<string, string> = {
  executive: "sharp tailored dark suit, executive confidence, boardroom energy",
  creator: "modern creator aesthetic, casual designer knit, expressive warmth",
  sport: "athletic build, technical performance jacket, energetic stance",
  cinematic: "film-noir styling, dramatic contrast, editorial fashion pose",
};

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parseDataUrl(dataUrl: string): { mime: string; base64: string; bytes: number } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const base64 = m[2];
  // approx byte length from base64
  const bytes = Math.floor((base64.length * 3) / 4);
  return { mime, base64, bytes };
}

async function generateAngle(
  apiKey: string,
  base64: string,
  mime: string,
  angle: number,
  style: string,
): Promise<string> {
  const suffix = STYLE_SUFFIX[style] ?? STYLE_SUFFIX.cinematic;
  const yawDirection = angle < 0 ? `${Math.abs(angle)}° to the left` : angle > 0 ? `${angle}° to the right` : "straight ahead";
  const prompt = `Create a cinematic editorial portrait of the person in the reference photo. Preserve their facial identity exactly — same face, same skin tone, same hair, same age. Camera framing: shoulders-up medium shot, subject looking ${yawDirection} (yaw ${angle} degrees). Background: solid deep black (#050816) with a warm gold rim-light from behind-right (Bond-Gold cinematic style). Wardrobe/mood: ${suffix}. Same lighting and same wardrobe across the whole turnaround set. Sharp focus on the face, subtle film grain. No text, no watermark, no borders.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
          ],
        },
      ],
      modalities: ["image", "text"],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gateway ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image in response");
  return b64;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ error: "invalid body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const image: unknown = body.image;
    const style: unknown = body.style;
    if (typeof image !== "string" || typeof style !== "string" || !(style in STYLE_SUFFIX)) {
      return new Response(JSON.stringify({ error: "image and style required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = parseDataUrl(image);
    if (!parsed) {
      return new Response(JSON.stringify({ error: "image must be a data URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ALLOWED_MIME.has(parsed.mime)) {
      return new Response(JSON.stringify({ error: "only jpeg/png/webp allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (parsed.bytes > MAX_BYTES) {
      return new Response(JSON.stringify({ error: "image too large (max 8MB)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate-limit per IP hash
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("cf-connecting-ip") ??
      "anon";
    const ipHash = await sha256Hex(ip + "|instant-avatar-demo");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [hourRes, dayRes] = await Promise.all([
      supabase.from("instant_avatar_rate").select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash).gte("created_at", oneHourAgo),
      supabase.from("instant_avatar_rate").select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash).gte("created_at", oneDayAgo),
    ]);

    const hourCount = hourRes.count ?? 0;
    const dayCount = dayRes.count ?? 0;
    if (hourCount >= 3 || dayCount >= 10) {
      return new Response(
        JSON.stringify({
          error: "rate_limited",
          message: "Du hast dein Demo-Kontingent erreicht. Probier es später erneut oder starte kostenlos für unbegrenzte Avatare.",
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Log the attempt first (avoids racing)
    await supabase.from("instant_avatar_rate").insert({ ip_hash: ipHash });

    // Generate all angles in parallel — settle so we return whatever succeeds
    const settled = await Promise.allSettled(
      ANGLES.map((angle) => generateAngle(apiKey, parsed.base64, parsed.mime, angle, style as string)),
    );

    const frames = settled.map((r, i) => ({
      angle: ANGLES[i],
      b64: r.status === "fulfilled" ? r.value : null,
      error: r.status === "rejected" ? String((r.reason as Error)?.message ?? r.reason).slice(0, 200) : null,
    }));

    const successCount = frames.filter((f) => f.b64).length;
    if (successCount === 0) {
      const firstErr = frames.find((f) => f.error)?.error ?? "generation failed";
      return new Response(JSON.stringify({ error: "generation_failed", message: firstErr }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ frames, style }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[instant-avatar-demo]", err);
    return new Response(
      JSON.stringify({ error: "internal_error", message: String((err as Error)?.message ?? err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
