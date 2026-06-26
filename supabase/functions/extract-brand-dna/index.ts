// Brand DNA Extractor v1
// Analysiert eine Website-URL oder einen hochgeladenen Screenshot/Logo
// und liefert einen "Draft Brand Kit" zurück (Farben, Fonts, Tone, Keywords).
// Wird NICHT in die DB geschrieben - reine Vorschlagsschicht für das Erstellen-Formular.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

interface BrandDnaInput {
  websiteUrl?: string;
  screenshotUrl?: string;
  logoUrl?: string;
  language?: "de" | "en" | "es";
}

interface BrandDnaResult {
  brand_name?: string;
  brand_description?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  palette?: string[];
  fonts?: { headline?: string; body?: string };
  tone?: string;
  mood?: string;
  keywords?: string[];
  values?: string[];
  emoji_suggestions?: string[];
  ai_comment?: string;
  source: "website" | "screenshot" | "logo";
  confidence: number;
}

async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AdToolBrandDNA/1.0; +https://useadtool.ai)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    // strip scripts/styles, collapse whitespace, take first ~6000 chars
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return stripped.slice(0, 6000);
  } catch (e) {
    console.warn("fetchPageText failed", e);
    return "";
  }
}

function extractMetaName(html: string): string | undefined {
  const m =
    html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i) ||
    html.match(/<title>([^<]+)<\/title>/i);
  return m?.[1]?.trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockResponse({ corsHeaders, kind: "json" });

  try {
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const auth = req.headers.get("authorization");
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: BrandDnaInput = await req.json();
    const language = body.language ?? "de";

    if (!body.websiteUrl && !body.screenshotUrl && !body.logoUrl) {
      return new Response(
        JSON.stringify({ error: "missing_input", details: "websiteUrl, screenshotUrl or logoUrl required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let source: BrandDnaResult["source"] = "website";
    let pageText = "";
    let rawHtmlSnippet = "";
    const visionImages: string[] = [];

    if (body.websiteUrl) {
      source = "website";
      try {
        const res = await fetch(body.websiteUrl, { signal: AbortSignal.timeout(8000) });
        rawHtmlSnippet = (await res.text()).slice(0, 12000);
      } catch (_) { /* ignore */ }
      pageText = await fetchPageText(body.websiteUrl);
    }
    if (body.screenshotUrl) { source = "screenshot"; visionImages.push(body.screenshotUrl); }
    if (body.logoUrl) { if (!body.websiteUrl && !body.screenshotUrl) source = "logo"; visionImages.push(body.logoUrl); }

    const inferredName = rawHtmlSnippet ? extractMetaName(rawHtmlSnippet) : undefined;

    const langLabel = language === "de" ? "German" : language === "es" ? "Spanish" : "English";

    const systemPrompt = `You are a senior brand strategist + visual designer. \
Extract the "Brand DNA" from the provided source (website text and/or images of a logo / screenshot). \
Return ONLY valid JSON. All copy fields MUST be in ${langLabel}. \
Color codes must be valid #HEX (uppercase). Fonts must be real Google Fonts.`;

    const userText = `Source type: ${source}
${inferredName ? `Detected name: ${inferredName}\n` : ""}${pageText ? `--- Page text (truncated) ---\n${pageText}\n` : ""}
Return JSON with this exact shape:
{
  "brand_name": "...",
  "brand_description": "1-2 sentences",
  "primary_color": "#RRGGBB",
  "secondary_color": "#RRGGBB",
  "accent_color": "#RRGGBB",
  "palette": ["#RRGGBB","#RRGGBB","#RRGGBB","#RRGGBB"],
  "fonts": { "headline": "Google Font name", "body": "Google Font name" },
  "tone": "one of: seriös, frech, inspirierend, professionell, freundlich, mutig, authentisch",
  "mood": "one of: vibrant, elegant, playful, minimalist, corporate, luxurious, urban, friendly",
  "keywords": ["5","short","keywords"],
  "values": ["3","brand","values"],
  "emoji_suggestions": ["✨","🚀","🎯","💎"],
  "ai_comment": "Short paragraph explaining the brand DNA insights and why this works."
}`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          ...visionImages.map((url) => ({ type: "image_url", image_url: { url } })),
          { type: "text", text: userText },
        ],
      },
    ];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        temperature: 0.4,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return new Response(
        JSON.stringify({ error: "ai_failed", details: errText.slice(0, 500) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiJson = await aiRes.json();
    const content: string = aiJson.choices?.[0]?.message?.content ?? "";

    let parsed: any = null;
    try { parsed = JSON.parse(content); }
    catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }

    if (!parsed) {
      return new Response(
        JSON.stringify({ error: "parse_failed", preview: content.slice(0, 300) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result: BrandDnaResult = {
      brand_name: parsed.brand_name || inferredName,
      brand_description: parsed.brand_description,
      primary_color: parsed.primary_color,
      secondary_color: parsed.secondary_color,
      accent_color: parsed.accent_color,
      palette: Array.isArray(parsed.palette) ? parsed.palette.slice(0, 6) : undefined,
      fonts: parsed.fonts,
      tone: parsed.tone,
      mood: parsed.mood,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 8) : [],
      values: Array.isArray(parsed.values) ? parsed.values.slice(0, 5) : [],
      emoji_suggestions: Array.isArray(parsed.emoji_suggestions)
        ? parsed.emoji_suggestions.slice(0, 6)
        : [],
      ai_comment: parsed.ai_comment,
      source,
      confidence: pageText.length > 500 || visionImages.length > 0 ? 0.85 : 0.55,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("extract-brand-dna error", e);
    return new Response(
      JSON.stringify({ error: "internal_error", details: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
