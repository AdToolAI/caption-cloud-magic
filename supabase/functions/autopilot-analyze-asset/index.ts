// autopilot-analyze-asset
//
// One vision pass per uploaded customer image. It produces the English
// description the image models need, plus an honest usability verdict — a
// blurry 200px logo has to be caught here, not three minutes into a render.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const ROLE_GUIDE: Record<string, string> = {
  logo: "Ein Marken-Logo. Prüfe, ob es freigestellt oder auf klarem Hintergrund ist und ob die Auflösung für eine Einblendung reicht.",
  product: "Ein Produktfoto. Beschreibe Form, Material, Farbe, Etikett und Blickwinkel so präzise, dass ein Bildmodell dasselbe Produkt erzeugt.",
  person: "Eine Person. Beschreibe Alter, Erscheinung, Frisur, Kleidung und Lichtsituation. Keine Identitätsbewertung, keine Vermutungen über Herkunft.",
  place: "Ein Ort. Beschreibe Raum, Materialien, Tageszeit, Lichtstimmung und Atmosphäre.",
  style: "Eine Stil-Referenz. Beschreibe ausschließlich Farbwelt, Kontrast, Licht, Korn und Look — nicht den Bildinhalt.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await req.json();
    const imageUrl = String(body?.image_url ?? "");
    const role = String(body?.role ?? "product");
    const note = String(body?.user_note ?? "").slice(0, 400);
    const assetId = body?.asset_id ? String(body.asset_id) : null;

    if (!imageUrl.startsWith("http")) return json({ error: "invalid_image_url" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          {
            role: "system",
            content:
              "Du analysierst Kundenbilder für eine Videoproduktion. Antworte ausschließlich über den Tool-Call. " +
              "Die Beschreibung ist IMMER auf Englisch, weil sie an Bildmodelle geht. Die Warnung ist auf Deutsch.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  `Rolle des Bildes: ${ROLE_GUIDE[role] ?? ROLE_GUIDE.product}`,
                  note ? `Wunsch des Kunden: "${note}"` : "",
                  "Bewerte ehrlich, ob das Bild für eine hochwertige Videoproduktion brauchbar ist (Schärfe, Auflösung, Freisteller, störender Hintergrund).",
                ].filter(Boolean).join("\n"),
              },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "asset_analysis",
              description: "Analyse des Kundenbildes.",
              parameters: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  dominantColors: { type: "array", items: { type: "string" } },
                  usable: { type: "boolean" },
                  warning: { type: "string" },
                  detectedRole: { type: "string" },
                },
                required: ["description", "usable"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "asset_analysis" } },
      }),
    });

    if (resp.status === 429) return json({ error: "rate_limited" }, 429);
    if (resp.status === 402) return json({ error: "credits_exhausted" }, 402);
    if (!resp.ok) {
      const detail = (await resp.text()).slice(0, 400);
      console.error("[autopilot-analyze-asset] gateway error", resp.status, detail);
      return json({ error: "analysis_failed", detail }, 502);
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = raw ? JSON.parse(raw) : {};

    const analysis = {
      description: String(parsed.description ?? "").slice(0, 900),
      dominantColors: Array.isArray(parsed.dominantColors) ? parsed.dominantColors.map(String).slice(0, 6) : [],
      usable: parsed.usable !== false,
      warning: String(parsed.warning ?? "").trim() || null,
      detectedRole: String(parsed.detectedRole ?? role),
    };

    if (assetId) {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await admin
        .from("autopilot_assets")
        .update({ analysis, usable: analysis.usable })
        .eq("id", assetId)
        .eq("user_id", user.id);
    }

    return json({ ok: true, analysis });
  } catch (err) {
    console.error("[autopilot-analyze-asset] fatal", err);
    return json({ error: err instanceof Error ? err.message : "unknown" }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
