import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** €-Preis pro 1.000 Zeichen (ElevenLabs-Kosten × 3,00 Marge). */
const PRICE_PER_1K_CHARS = 0.30;
const MAX_BLOCK_CHARS = 3800;
const CONCURRENCY = 4;

interface Segment { voiceId: string; voiceName?: string; text: string }

function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?…])\s+/);
  const out: string[] = [];
  for (const p of parts) {
    if (p.length <= MAX_BLOCK_CHARS) { out.push(p); continue; }
    // Hard-split overly long "sentences" at word boundaries
    let rest = p;
    while (rest.length > MAX_BLOCK_CHARS) {
      let cut = rest.lastIndexOf(' ', MAX_BLOCK_CHARS);
      if (cut < MAX_BLOCK_CHARS * 0.5) cut = MAX_BLOCK_CHARS;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
  }
  return out.filter(Boolean);
}

function buildBlocks(segments: Segment[], paragraphGapMs: number) {
  const blocks: { voiceId: string; text: string }[] = [];
  for (const seg of segments) {
    const gap = paragraphGapMs > 0 ? ` <break time="${(paragraphGapMs / 1000).toFixed(2)}s" />` : '';
    const sentences = splitSentences(seg.text.trim());
    let current = '';
    for (const s of sentences) {
      if ((current + ' ' + s).trim().length > MAX_BLOCK_CHARS && current) {
        blocks.push({ voiceId: seg.voiceId, text: current.trim() });
        current = s;
      } else {
        current = (current ? current + ' ' : '') + s;
      }
    }
    if (current.trim()) blocks.push({ voiceId: seg.voiceId, text: current.trim() + gap });
  }
  return blocks;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  let chapterId: string | null = null;

  try {
    const elevenKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!elevenKey) throw new Error('ELEVENLABS_API_KEY not configured');

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) throw new Error('Unauthorized');
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    const body = await req.json().catch(() => ({}));
    chapterId = typeof body?.chapterId === 'string' ? body.chapterId : null;
    if (!chapterId) throw new Error('chapterId is required');

    const { data: chapter, error: chErr } = await admin
      .from('audiobook_chapters').select('*').eq('id', chapterId).maybeSingle();
    if (chErr) throw chErr;
    if (!chapter || chapter.user_id !== user.id) throw new Error('Chapter not found');

    const { data: project, error: prErr } = await admin
      .from('audiobook_projects').select('*').eq('id', chapter.project_id).maybeSingle();
    if (prErr) throw prErr;
    if (!project || project.user_id !== user.id) throw new Error('Project not found');

    const segments: Segment[] = Array.isArray(body?.segments) ? body.segments : [];
    const usable = segments.filter((s) => s?.voiceId && String(s?.text || '').trim().length > 0);
    if (usable.length === 0) throw new Error('Kein Text zum Vertonen');

    const totalChars = usable.reduce((sum, s) => sum + s.text.trim().length, 0);
    const cost = Math.round((totalChars / 1000) * PRICE_PER_1K_CHARS * 100) / 100;

    // --- Wallet check -------------------------------------------------------
    const { data: wallet } = await admin
      .from('ai_video_wallets').select('balance_euros').eq('user_id', user.id).maybeSingle();
    const balance = Number(wallet?.balance_euros ?? 0);
    if (balance < cost) {
      return new Response(JSON.stringify({
        error: 'insufficient_credits',
        message: `Nicht genug Guthaben: ${cost.toFixed(2)} € benötigt, ${balance.toFixed(2)} € verfügbar.`,
        cost, balance,
      }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await admin.from('audiobook_chapters')
      .update({ render_status: 'rendering', render_progress: 0, error_message: null })
      .eq('id', chapterId);

    const blocks = buildBlocks(usable, Number(project.paragraph_gap_ms ?? 400));

    const renderBlock = async (block: { voiceId: string; text: string }, i: number) => {
      const previous = i > 0 ? blocks[i - 1].text.slice(-400) : undefined;
      const next = i < blocks.length - 1 ? blocks[i + 1].text.slice(0, 400) : undefined;

      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${block.voiceId}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify({
            text: block.text,
            model_id: 'eleven_multilingual_v2',
            language_code: project.language || undefined,
            previous_text: previous,
            next_text: next,
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.35,
              use_speaker_boost: true,
              speed: Number(body?.speed) || 0.95,
            },
          }),
        },
      );

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.error(`[render-audiobook] block ${i} failed [${res.status}]: ${errBody}`);
        throw new Error(`ElevenLabs ${res.status}: ${errBody.slice(0, 300)}`);
      }
      return new Uint8Array(await res.arrayBuffer());
    };

    const parts = await mapLimit(blocks, CONCURRENCY, renderBlock);

    const total = parts.reduce((n, p) => n + p.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) { merged.set(p, offset); offset += p.length; }

    const safeTitle = String(chapter.title || 'kapitel').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'kapitel';
    const index = String((chapter.chapter_index ?? 0) + 1).padStart(2, '0');
    const path = `${user.id}/audiobooks/${project.id}/${index}-${safeTitle}-${Date.now()}.mp3`;

    const { error: upErr } = await admin.storage
      .from('audio-studio')
      .upload(path, merged, { contentType: 'audio/mpeg', upsert: false });
    if (upErr) throw upErr;

    const { data: urlData } = admin.storage.from('audio-studio').getPublicUrl(path);
    // ~1000 Zeichen ≈ 60 s bei ruhigem Vorlesetempo
    const estimatedDuration = Math.round((totalChars / 1000) * 60);

    await admin.from('audiobook_chapters').update({
      audio_url: urlData.publicUrl,
      duration_seconds: estimatedDuration,
      char_count: totalChars,
      render_status: 'done',
      render_progress: 100,
      error_message: null,
    }).eq('id', chapterId);

    const { error: deductError } = await admin.rpc('deduct_ai_video_credits', {
      p_user_id: user.id, p_amount: cost, p_generation_id: null,
    });
    if (deductError) console.error('[render-audiobook] deduct error:', deductError);

    return new Response(JSON.stringify({
      success: true, audioUrl: urlData.publicUrl, cost, chars: totalChars,
      blocks: blocks.length, durationSeconds: estimatedDuration,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[render-audiobook] failed:', message);
    if (chapterId) {
      await admin.from('audiobook_chapters')
        .update({ render_status: 'failed', error_message: message.slice(0, 500) })
        .eq('id', chapterId);
    }
    return new Response(JSON.stringify({ error: 'render_failed', message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
