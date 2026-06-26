// seed-world-catalog — Stage 31 (Cast & World)
// Admin-only resumable seeder for Locations / Buildings / Props catalog previews.
// Mirrors seed-wardrobe-catalog: synchronous chunk per invocation, caller polls
// until { done: true }. Idempotent on (theme_pack, label) per kind.
//
// POST { kind: 'location'|'building'|'prop', force?: boolean, theme_pack?: string }

import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import { listAllSlots, type WorldKind } from '../_shared/world-themes.ts';
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 8;
const MAX_PER_INVOCATION = 8;

const STYLE_LOCK: Record<WorldKind, string> = {
  location: 'photorealistic cinematic establishing shot, 16:9, soft cinematic lighting, no people, no text, no logos, hero scene background',
  building: 'photorealistic architectural exterior establishing shot, 16:9, golden hour or dramatic light, no people, no text, no logos, full building visible',
  prop: 'photorealistic product / object photo, neutral light-grey studio background, soft studio lighting, centered subject, 1:1, no people, no text, no logos',
  character: 'photorealistic full-body cinematic character portrait, neutral light-grey studio backdrop, soft cinematic three-point lighting, sharp focus, 3:4, single subject centered, no text, no logos, no political insignia',
};

const TABLE: Record<WorldKind, string> = {
  location: 'location_catalog_previews',
  building: 'building_catalog_previews',
  prop: 'prop_catalog_previews',
  character: 'character_catalog_previews',
};
const BUCKET: Record<WorldKind, string> = {
  location: 'brand-locations',
  building: 'brand-buildings',
  prop: 'brand-props',
  character: 'brand-characters',
};

async function generateOne(opts: {
  supabaseAdmin: ReturnType<typeof createClient>;
  apiKey: string;
  kind: WorldKind;
  theme_pack: string;
  item_id: string;
  label: string;
  modifier: string;
}) {
  const { supabaseAdmin, apiKey, kind, theme_pack, item_id, label, modifier } = opts;

  const prompt = `${modifier}. ${STYLE_LOCK[kind]}.`;

  const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3.1-flash-image-preview',
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      modalities: ['image', 'text'],
    }),
  });
  if (!aiResp.ok) {
    const t = await aiResp.text();
    throw new Error(`Gemini ${aiResp.status}: ${t.slice(0, 160)}`);
  }
  const aiData = await aiResp.json();
  const dataUri: string | undefined = aiData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!dataUri?.startsWith('data:image/')) throw new Error('No image returned');

  const base64 = dataUri.split(',')[1];
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const path = `_catalog/${kind}/${theme_pack}/${item_id}-${crypto.randomUUID()}.png`;

  const { error: upErr } = await (supabaseAdmin as any).storage
    .from(BUCKET[kind])
    .upload(path, bytes, { contentType: 'image/png', upsert: true });
  if (upErr) throw new Error(`Upload: ${upErr.message}`);

  const { data: signed } = await (supabaseAdmin as any).storage
    .from(BUCKET[kind])
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
  const url = signed?.signedUrl;
  if (!url) throw new Error('Sign URL failed');

  const { error: dbErr } = await (supabaseAdmin as any).from(TABLE[kind]).upsert({
    theme_pack, label, image_url: url, storage_path: path, prompt,
  }, { onConflict: 'theme_pack,label' });
  if (dbErr) throw new Error(`DB upsert: ${dbErr.message}`);
  console.log(`[seed-world-catalog] saved`, { kind, theme_pack, label });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "seed-world-catalog" });


  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) throw new Error('Unauthorized');

    const { data: roles } = await supabaseAdmin
      .from('user_roles').select('role').eq('user_id', user.id);
    const isAdmin = (roles ?? []).some((r: any) => r.role === 'admin');
    if (!isAdmin) throw new Error('Admin role required');

    const body = await req.json().catch(() => ({}));
    const kind = (body?.kind ?? 'location') as WorldKind;
    if (!['location', 'building', 'prop', 'character'].includes(kind)) throw new Error('Invalid kind');
    const force: boolean = !!body?.force;
    const themeFilter: string | undefined = body?.theme_pack;

    const allSlots = listAllSlots(kind)
      .filter((s) => !themeFilter || s.theme_pack === themeFilter);

    const { data: existing } = await (supabaseAdmin as any)
      .from(TABLE[kind])
      .select('theme_pack, label')
      .range(0, 9999);
    const existingSet = new Set((existing ?? []).map((r: any) => `${r.theme_pack}|${r.label}`));
    const allTodo = force
      ? allSlots
      : allSlots.filter((s) => !existingSet.has(`${s.theme_pack}|${s.item.label}`));

    for (let i = allTodo.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allTodo[i], allTodo[j]] = [allTodo[j], allTodo[i]];
    }

    const todo = allTodo.slice(0, MAX_PER_INVOCATION);
    const remainingAfter = Math.max(0, allTodo.length - todo.length);

    console.log('[seed-world-catalog] processing', { kind, thisRun: todo.length, remainingAfter, force, themeFilter });

    if (todo.length === 0) {
      return new Response(JSON.stringify({
        success: true, done: true, processed: 0, remaining: 0, kind,
        total_existing: existingSet.size,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let completed = 0, failed = 0;
    for (let i = 0; i < todo.length; i += BATCH_SIZE) {
      const batch = todo.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map((t) =>
        generateOne({
          supabaseAdmin,
          apiKey: LOVABLE_API_KEY,
          kind,
          theme_pack: t.theme_pack,
          item_id: t.item.id,
          label: t.item.label,
          modifier: t.item.modifier,
        }),
      ));
      for (const r of results) {
        if (r.status === 'fulfilled') completed++; else { failed++; console.error('[seed-world-catalog] slot failed', (r as any).reason?.message); }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      done: remainingAfter === 0,
      processed: completed,
      failed,
      remaining: remainingAfter,
      kind,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[seed-world-catalog] error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
