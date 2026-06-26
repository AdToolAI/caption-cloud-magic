// Stage 4 — Asset Capture
// Extracts a Character OR Location identity card from any image URL, using
// the same vision pipeline as the dedicated extractors but routed through one
// endpoint so the SaveAsAssetMenu only needs a single call.

import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CHARACTER_PROMPT = `Analyze this image and extract a structured visual identity card for the MAIN PERSON/CHARACTER. Return STRICT JSON only.

Schema:
{
  "character_type": "person" | "mascot" | "avatar" | "creature",
  "gender_presentation": "male" | "female" | "neutral" | "n/a",
  "age_range": "child" | "teen" | "young_adult" | "adult" | "senior" | "n/a",
  "ethnicity_or_style": string,
  "hair": { "color": string, "length": string, "style": string },
  "eyes": { "color": string, "shape": string },
  "facial_features": string,
  "outfit": { "top": string, "bottom": string, "accessories": string },
  "color_palette": string[],
  "style_tags": string[],
  "prompt_descriptor": string (single ENGLISH sentence ready to inject into a prompt, max 220 chars)
}
Use "n/a" or [] when unknown.`;

const LOCATION_PROMPT = `Analyze this image and extract a structured visual identity card for the LOCATION/ENVIRONMENT (ignore people). Return STRICT JSON only.

Schema:
{
  "setting": string (e.g. "industrial loft", "alpine forest"),
  "interior_or_exterior": "interior" | "exterior" | "mixed",
  "time_of_day": "dawn" | "morning" | "midday" | "golden_hour" | "dusk" | "night" | "n/a",
  "lighting": string,
  "atmosphere": string,
  "color_palette": string[],
  "key_props": string[],
  "style_tags": string[],
  "prompt_descriptor": string (single ENGLISH sentence ready to inject into a prompt, max 220 chars)
}
Use "n/a" or [] when unknown.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "extract-asset-from-frame" });


  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { image_url, mode, name, description } = await req.json();
    if (!image_url || !mode || !['character', 'location'].includes(mode) || !name) {
      return new Response(JSON.stringify({ error: 'image_url, mode (character|location), name required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1) Vision extract identity
    const visionPrompt = mode === 'character' ? CHARACTER_PROMPT : LOCATION_PROMPT;
    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: visionPrompt },
            { type: 'image_url', image_url: { url: image_url } },
          ],
        }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('Vision extract failed:', aiRes.status, errText);
      return new Response(JSON.stringify({ error: 'Vision extraction failed', detail: errText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content || '{}';
    let identity: any = {};
    try { identity = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { const m = String(raw).match(/\{[\s\S]*\}/); identity = m ? JSON.parse(m[0]) : {}; }

    // 2) Re-host the source image into the proper bucket under the user's folder
    const bucket = mode === 'character' ? 'brand-characters' : 'brand-locations';
    const imgRes = await fetch(image_url);
    if (!imgRes.ok) throw new Error(`Could not fetch source image: ${imgRes.status}`);
    const ct = imgRes.headers.get('content-type') || 'image/png';
    const ext = ct.includes('jpeg') ? 'jpg' : ct.includes('webp') ? 'webp' : 'png';
    const blob = new Uint8Array(await imgRes.arrayBuffer());
    const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(bucket).upload(storagePath, blob, { contentType: ct, upsert: false });
    if (upErr) throw upErr;
    const { data: signed } = await supabase.storage
      .from(bucket).createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 5);
    const referenceImageUrl = signed?.signedUrl;
    if (!referenceImageUrl) throw new Error('Could not sign URL');

    // 3) Insert
    const table = mode === 'character' ? 'brand_characters' : 'brand_locations';
    const { data: row, error: insErr } = await supabase
      .from(table)
      .insert({
        user_id: user.id,
        name,
        description: description ?? null,
        reference_image_url: referenceImageUrl,
        storage_path: storagePath,
        visual_identity_json: identity,
      })
      .select()
      .single();
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ success: true, asset: row, mode }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('extract-asset-from-frame error:', e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
