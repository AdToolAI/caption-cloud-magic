import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LEGAL_VERSION = 'v1-2026-04-29';

const REQUIRED_CONSENT_KEYS = [
  'ownership_rights',
  'model_release_or_ai',
  'no_public_figures',
  'not_minor',
  'accept_creator_terms',
  'accept_liability',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const {
      characterId,
      pricingType,
      priceCredits,
      originType,
      originMetadata,
      licenseReleasePath,
      sampleVideoUrls,
      voiceSampleUrl,
      tags,
      nsfwFlag,
      consents,
    } = body as {
      characterId?: string;
      pricingType?: 'free' | 'premium';
      priceCredits?: number;
      originType?: 'ai_generated' | 'licensed_real_person' | 'self_portrait';
      originMetadata?: Record<string, unknown>;
      licenseReleasePath?: string;
      sampleVideoUrls?: string[];
      voiceSampleUrl?: string;
      tags?: string[];
      nsfwFlag?: boolean;
      consents?: Record<string, boolean>;
    };

    if (!characterId || !pricingType || !originType) {
      return new Response(JSON.stringify({ ok: false, error: 'INVALID_INPUT' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['ai_generated', 'licensed_real_person', 'self_portrait'].includes(originType)) {
      return new Response(JSON.stringify({ ok: false, error: 'INVALID_ORIGIN' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (originType === 'licensed_real_person' && !licenseReleasePath) {
      return new Response(JSON.stringify({ ok: false, error: 'MODEL_RELEASE_REQUIRED' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify ALL consent keys
    if (!consents || typeof consents !== 'object') {
      return new Response(JSON.stringify({ ok: false, error: 'CONSENTS_REQUIRED' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    for (const key of REQUIRED_CONSENT_KEYS) {
      if (consents[key] !== true) {
        return new Response(JSON.stringify({ ok: false, error: 'MISSING_CONSENT', detail: key }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const safePrice = pricingType === 'free' ? 0 : Math.max(25, Math.min(1000, Math.floor(priceCredits ?? 0)));
    if (pricingType === 'premium' && safePrice < 25) {
      return new Response(JSON.stringify({ ok: false, error: 'PRICE_TOO_LOW' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: char, error: charErr } = await admin
      .from('brand_characters')
      .select('id, user_id, name, reference_image_url, marketplace_status')
      .eq('id', characterId)
      .maybeSingle();

    if (charErr || !char) {
      return new Response(JSON.stringify({ ok: false, error: 'CHARACTER_NOT_FOUND' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (char.user_id !== userId) {
      return new Response(JSON.stringify({ ok: false, error: 'NOT_OWNER' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!char.name || !char.reference_image_url) {
      return new Response(JSON.stringify({ ok: false, error: 'MISSING_METADATA' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auto-publish only Free + AI-generated. Anything else -> review.
    const autoPublish = pricingType === 'free' && originType === 'ai_generated';
    const newStatus = autoPublish ? 'published' : 'pending_review';

    const updates: Record<string, unknown> = {
      marketplace_status: newStatus,
      pricing_type: pricingType,
      price_credits: safePrice,
      origin_type: originType,
      origin_metadata: originMetadata ?? {},
      license_release_path: licenseReleasePath ?? null,
      sample_video_urls: Array.isArray(sampleVideoUrls) ? sampleVideoUrls.slice(0, 3) : [],
      voice_sample_url: voiceSampleUrl ?? null,
      tags: Array.isArray(tags) ? tags.slice(0, 12) : [],
      nsfw_flag: !!nsfwFlag,
      updated_at: new Date().toISOString(),
    };
    if (autoPublish) {
      updates.published_at = new Date().toISOString();
    }

    const { error: updErr } = await admin
      .from('brand_characters')
      .update(updates)
      .eq('id', characterId);

    if (updErr) throw updErr;

    // Hash IP for audit
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
    const ua = req.headers.get('user-agent') ?? '';
    const ipHash = ip
      ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + LEGAL_VERSION))))
          .map((b) => b.toString(16).padStart(2, '0')).join('')
      : null;

    await admin.from('character_marketplace_consents').insert({
      character_id: characterId,
      user_id: userId,
      consents,
      legal_version: LEGAL_VERSION,
      ip_hash: ipHash,
      user_agent: ua.slice(0, 500),
    });

    return new Response(JSON.stringify({ ok: true, status: newStatus, priceCredits: safePrice, legalVersion: LEGAL_VERSION }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('submit-character-to-marketplace', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
