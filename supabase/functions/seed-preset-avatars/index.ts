// seed-preset-avatars
// Admin-only one-shot helper that generates 12 curated preset avatars.
// For each spec: generates a Gemini portrait → uploads to system-preset-avatars bucket
// → inserts a row in system_preset_avatars. Skips presets whose `name` already exists.

import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PresetSpec {
  name: string;
  role_label: string;
  gender: 'female' | 'male' | 'neutral';
  description: string;
  prompt: string;
  sort_order: number;
}

const PRESETS: PresetSpec[] = [
  {
    name: 'Sarah',
    role_label: 'Business Woman',
    gender: 'female',
    description: 'Confident professional in her early 30s, warm and approachable.',
    sort_order: 10,
    prompt:
      'Photorealistic studio portrait of a woman in her early 30s, light brown shoulder-length hair, soft natural makeup, warm friendly smile, wearing a neutral plain heather-grey crew-neck t-shirt, plain off-white seamless studio backdrop, eye-level frontal camera, shoulders visible, soft three-point lighting, no logos. Square 1:1.',
  },
  {
    name: 'Marcus',
    role_label: 'Tech Founder',
    gender: 'male',
    description: 'Sharp, focused founder in his mid 30s with a calm presence.',
    sort_order: 20,
    prompt:
      'Photorealistic studio portrait of a man in his mid 30s, short dark hair, neat short beard, neutral confident expression, wearing a plain dark grey crew-neck t-shirt, plain off-white seamless studio backdrop, eye-level frontal camera, shoulders visible, soft three-point lighting, no logos. Square 1:1.',
  },
  {
    name: 'Aisha',
    role_label: 'Creative Director',
    gender: 'female',
    description: 'Stylish creative in her late 20s with expressive eyes.',
    sort_order: 30,
    prompt:
      'Photorealistic studio portrait of a Black woman in her late 20s, dark curly hair pulled back, gentle smile, wearing a neutral plain heather-grey crew-neck t-shirt, plain off-white seamless studio backdrop, eye-level frontal camera, shoulders visible, soft three-point lighting, no logos. Square 1:1.',
  },
  {
    name: 'David',
    role_label: 'Senior Mentor',
    gender: 'male',
    description: 'Experienced mentor in his late 50s with kind eyes.',
    sort_order: 40,
    prompt:
      'Photorealistic studio portrait of a man in his late 50s, salt-and-pepper short hair, light stubble, warm calm smile, wearing a plain dark grey crew-neck t-shirt, plain off-white seamless studio backdrop, eye-level frontal camera, shoulders visible, soft three-point lighting, no logos. Square 1:1.',
  },
  {
    name: 'Emma',
    role_label: 'Influencer',
    gender: 'female',
    description: 'Energetic influencer in her early 20s with a bright smile.',
    sort_order: 50,
    prompt:
      'Photorealistic studio portrait of a woman in her early 20s, long blonde hair, bright friendly smile, light freckles, wearing a neutral plain heather-grey crew-neck t-shirt, plain off-white seamless studio backdrop, eye-level frontal camera, shoulders visible, soft three-point lighting, no logos. Square 1:1.',
  },
  {
    name: 'Kenji',
    role_label: 'Designer',
    gender: 'male',
    description: 'Quiet, detail-oriented designer in his late 20s.',
    sort_order: 60,
    prompt:
      'Photorealistic studio portrait of a Japanese man in his late 20s, short black hair, clean-shaven, calm focused expression, wearing a plain dark grey crew-neck t-shirt, plain off-white seamless studio backdrop, eye-level frontal camera, shoulders visible, soft three-point lighting, no logos. Square 1:1.',
  },
  {
    name: 'Sofia',
    role_label: 'Doctor',
    gender: 'female',
    description: 'Trustworthy doctor in her late 30s, calm and reassuring.',
    sort_order: 70,
    prompt:
      'Photorealistic studio portrait of a Latina woman in her late 30s, dark hair tied back, soft reassuring smile, wearing a neutral plain heather-grey crew-neck t-shirt, plain off-white seamless studio backdrop, eye-level frontal camera, shoulders visible, soft three-point lighting, no logos. Square 1:1.',
  },
  {
    name: 'James',
    role_label: 'Athletic Trainer',
    gender: 'male',
    description: 'Athletic trainer in his early 30s, fit and motivating.',
    sort_order: 80,
    prompt:
      'Photorealistic studio portrait of an athletic man in his early 30s, short brown hair, clean-shaven, friendly determined expression, wearing a plain dark grey crew-neck t-shirt, plain off-white seamless studio backdrop, eye-level frontal camera, shoulders visible, soft three-point lighting, no logos. Square 1:1.',
  },
  {
    name: 'Priya',
    role_label: 'Teacher',
    gender: 'female',
    description: 'Warm teacher in her early 40s with a patient smile.',
    sort_order: 90,
    prompt:
      'Photorealistic studio portrait of a South Asian woman in her early 40s, dark long hair, warm patient smile, subtle natural makeup, wearing a neutral plain heather-grey crew-neck t-shirt, plain off-white seamless studio backdrop, eye-level frontal camera, shoulders visible, soft three-point lighting, no logos. Square 1:1.',
  },
  {
    name: 'Luca',
    role_label: 'Chef',
    gender: 'male',
    description: 'Passionate chef in his late 30s with a warm Mediterranean look.',
    sort_order: 100,
    prompt:
      'Photorealistic studio portrait of a Mediterranean man in his late 30s, dark wavy hair, neat short beard, warm welcoming smile, wearing a plain dark grey crew-neck t-shirt, plain off-white seamless studio backdrop, eye-level frontal camera, shoulders visible, soft three-point lighting, no logos. Square 1:1.',
  },
  {
    name: 'Olivia',
    role_label: 'Public Speaker',
    gender: 'female',
    description: 'Charismatic speaker in her mid 40s with sharp presence.',
    sort_order: 110,
    prompt:
      'Photorealistic studio portrait of a woman in her mid 40s, chin-length brown hair, confident charismatic expression, subtle makeup, wearing a neutral plain heather-grey crew-neck t-shirt, plain off-white seamless studio backdrop, eye-level frontal camera, shoulders visible, soft three-point lighting, no logos. Square 1:1.',
  },
  {
    name: 'Noah',
    role_label: 'Casual Guy',
    gender: 'male',
    description: 'Approachable everyday guy in his mid 20s.',
    sort_order: 120,
    prompt:
      'Photorealistic studio portrait of a man in his mid 20s, medium-length light brown hair, light stubble, easy-going smile, wearing a plain dark grey crew-neck t-shirt, plain off-white seamless studio backdrop, eye-level frontal camera, shoulders visible, soft three-point lighting, no logos. Square 1:1.',
  },
];

async function generatePortrait(apiKey: string, prompt: string): Promise<Uint8Array> {
  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3.1-flash-image-preview',
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      modalities: ['image', 'text'],
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Gemini error ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const data = await resp.json();
  const dataUri: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!dataUri || !dataUri.startsWith('data:image/')) throw new Error('No image returned');
  const base64 = dataUri.split(',')[1];
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { fn: "seed-preset-avatars" });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error('Unauthorized');

    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleRow) throw new Error('Admin role required');

    const { only } = (await req.json().catch(() => ({}))) as { only?: string[] };

    const { data: existing } = await admin.from('system_preset_avatars').select('name');
    const existingNames = new Set((existing ?? []).map((r) => r.name));

    const results: Array<{ name: string; status: 'created' | 'skipped' | 'failed'; error?: string }> = [];
    for (const spec of PRESETS) {
      if (only && !only.includes(spec.name)) continue;
      if (existingNames.has(spec.name)) {
        results.push({ name: spec.name, status: 'skipped' });
        continue;
      }
      try {
        const bytes = await generatePortrait(LOVABLE_API_KEY, spec.prompt);
        const path = `presets/${spec.name.toLowerCase()}-${crypto.randomUUID()}.png`;
        const { error: upErr } = await admin.storage
          .from('system-preset-avatars')
          .upload(path, bytes, { contentType: 'image/png', upsert: false });
        if (upErr) throw new Error(`Upload: ${upErr.message}`);
        const { data: pub } = admin.storage.from('system-preset-avatars').getPublicUrl(path);
        const portraitUrl = pub.publicUrl;

        const { error: insErr } = await admin.from('system_preset_avatars').insert({
          name: spec.name,
          role_label: spec.role_label,
          gender: spec.gender,
          description: spec.description,
          portrait_url: portraitUrl,
          reference_image_url: portraitUrl,
          visual_identity_json: { source: 'seed', prompt: spec.prompt },
          sort_order: spec.sort_order,
          is_active: true,
        });
        if (insErr) throw new Error(`Insert: ${insErr.message}`);
        results.push({ name: spec.name, status: 'created' });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown';
        console.error('[seed-preset-avatars]', spec.name, msg);
        results.push({ name: spec.name, status: 'failed', error: msg });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[seed-preset-avatars] error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
