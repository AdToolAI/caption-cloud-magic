// seed-wardrobe-catalog — Stage 24
// Admin-only. Generates catalog preview images for every outfit in THEME_PACKS,
// for both male and female generic models. Idempotent: skips already-rendered
// (theme_pack, outfit_id, gender). Runs as background task via EdgeRuntime.waitUntil.

import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import { THEME_PACKS, listAllOutfitSlots } from '../_shared/wardrobe-themes.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GENDERS: Array<'male' | 'female'> = ['male', 'female'];
const BATCH_SIZE = 6;

const STYLE_LOCK =
  'photorealistic full-body editorial fashion photo, neutral light-grey studio background, soft cinematic lighting, head-to-toe framing, 3:4 portrait, attractive generic model with neutral pleasant face (NOT a celebrity), centered subject';

function modelDescriptor(gender: 'male' | 'female') {
  return gender === 'male'
    ? 'a generic adult MALE fashion model, mid-20s to mid-30s, neutral pleasant face, athletic build'
    : 'a generic adult FEMALE fashion model, mid-20s to mid-30s, neutral pleasant face, slim athletic build';
}

async function generateOne(opts: {
  supabaseAdmin: ReturnType<typeof createClient>;
  apiKey: string;
  theme_pack: string;
  outfit_id: string;
  outfit_label: string;
  modifier: string;
  gender: 'male' | 'female';
}) {
  const { supabaseAdmin, apiKey, theme_pack, outfit_id, outfit_label, modifier, gender } = opts;

  const prompt = `Studio fashion catalog photo of ${modelDescriptor(gender)} wearing ${modifier}. ${STYLE_LOCK}.`;

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
  const path = `_catalog/wardrobe/${theme_pack}/${outfit_id}/${gender}-${crypto.randomUUID()}.png`;

  const { error: upErr } = await (supabaseAdmin as any).storage
    .from('brand-characters')
    .upload(path, bytes, { contentType: 'image/png', upsert: true });
  if (upErr) throw new Error(`Upload: ${upErr.message}`);

  const { data: signed } = await (supabaseAdmin as any).storage
    .from('brand-characters')
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
  const url = signed?.signedUrl;
  if (!url) throw new Error('Sign URL failed');

  await (supabaseAdmin as any).from('wardrobe_catalog_previews').upsert({
    theme_pack, outfit_id, outfit_label, gender,
    image_url: url, storage_path: path,
  }, { onConflict: 'theme_pack,outfit_id,gender' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

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
    const force: boolean = !!body?.force;
    const themeFilter: string | undefined = body?.theme_pack; // optional, e.g. "historical:medieval"

    // Build full slot list × genders
    const allSlots = listAllOutfitSlots()
      .filter((s) => !themeFilter || s.theme_pack === themeFilter);
    const targets = allSlots.flatMap((s) =>
      GENDERS.map((g) => ({ ...s, gender: g })),
    );

    // Skip already-rendered unless forced
    const { data: existing } = await (supabaseAdmin as any)
      .from('wardrobe_catalog_previews')
      .select('theme_pack, outfit_id, gender');
    const existingSet = new Set(
      (existing ?? []).map((r: any) => `${r.theme_pack}|${r.outfit_id}|${r.gender}`),
    );
    const todo = force
      ? targets
      : targets.filter((t) => !existingSet.has(`${t.theme_pack}|${t.outfit_id}|${t.gender}`));

    const { data: job, error: jobErr } = await (supabaseAdmin as any)
      .from('wardrobe_catalog_seed_jobs')
      .insert({
        triggered_by: user.id,
        status: 'running',
        total_slots: todo.length,
      })
      .select('id').single();
    if (jobErr) throw new Error(`Job create: ${jobErr.message}`);
    const jobId = job.id as string;

    console.log('[seed-wardrobe-catalog] queued', { todo: todo.length, force, themeFilter });

    // Background: process in throttled batches
    const work = (async () => {
      let completed = 0, failed = 0;
      const errors: any[] = [];
      for (let i = 0; i < todo.length; i += BATCH_SIZE) {
        const batch = todo.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(batch.map((t) =>
          generateOne({
            supabaseAdmin,
            apiKey: LOVABLE_API_KEY,
            theme_pack: t.theme_pack,
            outfit_id: t.outfit.id,
            outfit_label: t.outfit.label,
            modifier: t.outfit.modifier,
            gender: t.gender,
          }),
        ));
        for (let k = 0; k < results.length; k++) {
          const r = results[k];
          if (r.status === 'fulfilled') {
            completed++;
          } else {
            failed++;
            errors.push({
              theme_pack: batch[k].theme_pack,
              outfit_id: batch[k].outfit.id,
              gender: batch[k].gender,
              error: String((r as any).reason).slice(0, 220),
            });
          }
        }
        await (supabaseAdmin as any).from('wardrobe_catalog_seed_jobs').update({
          completed_slots: completed,
          failed_slots: failed,
          error_log: errors.slice(-50),
        }).eq('id', jobId);
      }
      await (supabaseAdmin as any).from('wardrobe_catalog_seed_jobs').update({
        status: 'done',
      }).eq('id', jobId);
      console.log('[seed-wardrobe-catalog] done', { completed, failed });
    })().catch(async (err) => {
      console.error('[seed-wardrobe-catalog] background failed', err);
      await (supabaseAdmin as any).from('wardrobe_catalog_seed_jobs').update({
        status: 'failed',
      }).eq('id', jobId);
    });

    // @ts-ignore — Deno deploy runtime
    EdgeRuntime.waitUntil(work);

    return new Response(JSON.stringify({
      success: true, job_id: jobId, queued: todo.length, skipped: targets.length - todo.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[seed-wardrobe-catalog] error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
