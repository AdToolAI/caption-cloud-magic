import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidationRequest {
  caption: string;
  platforms: string[];
  media?: Array<{ type: string; ratio?: string }>;
  workspace_id: string;
  scheduled_at?: string;
}

interface ValidationResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
  platform_results: Record<string, {
    caption_ok: boolean;
    media_ok: boolean;
    rate_limit_ok: boolean;
    issues: string[];
  }>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: ValidationRequest = await req.json();
    const { caption, platforms, media = [], workspace_id, scheduled_at } = body;

    // Fetch platform limits
    const { data: limits, error: limitsError } = await supabaseClient
      .from('platform_limits')
      .select('*')
      .in('platform', platforms);

    if (limitsError) {
      throw limitsError;
    }

    const warnings: string[] = [];
    const errors: string[] = [];
    const platform_results: ValidationResult['platform_results'] = {};

    // Count hashtags in caption
    const hashtags = caption.match(/#\w+/g) || [];
    const hashtagCount = hashtags.length;

    for (const platform of platforms) {
      const limit = limits?.find(l => l.platform === platform);
      if (!limit) {
        warnings.push(`No limits configured for ${platform}`);
        continue;
      }

      const issues: string[] = [];
      let caption_ok = true;
      let media_ok = true;
      let rate_limit_ok = true;

      // Validate caption length
      if (caption.length > limit.max_caption_length) {
        issues.push(`Caption exceeds ${limit.max_caption_length} characters (${caption.length})`);
        caption_ok = false;
      }

      // Validate hashtags
      if (hashtagCount > limit.max_hashtags) {
        issues.push(`Too many hashtags: ${hashtagCount}/${limit.max_hashtags}`);
        warnings.push(`${platform}: Too many hashtags (${hashtagCount}/${limit.max_hashtags})`);
      }

      // Validate media count
      if (media.length > limit.max_media_count) {
        issues.push(`Too many media items: ${media.length}/${limit.max_media_count}`);
        media_ok = false;
      }

      // Validate media ratios
      if (limit.supported_ratios && limit.supported_ratios.length > 0) {
        const unsupportedMedia = media.filter(m => 
          m.ratio && !limit.supported_ratios.includes(m.ratio)
        );
        if (unsupportedMedia.length > 0) {
          issues.push(`Unsupported media ratios: ${unsupportedMedia.map(m => m.ratio).join(', ')}`);
          warnings.push(`${platform}: Some media ratios may not display optimally`);
        }
      }

      // Check rate limits if scheduled_at provided
      if (scheduled_at && limit.rate_limit_per_hour) {
        const scheduledTime = new Date(scheduled_at);
        const hourStart = new Date(scheduledTime);
        hourStart.setMinutes(0, 0, 0);
        const hourEnd = new Date(hourStart);
        hourEnd.setHours(hourEnd.getHours() + 1);

        const { count, error: countError } = await supabaseClient
          .from('calendar_events')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', workspace_id)
          .contains('channels', [platform])
          .gte('start_at', hourStart.toISOString())
          .lt('start_at', hourEnd.toISOString())
          .in('status', ['scheduled', 'queued', 'published']);

        if (!countError && count !== null && count >= limit.rate_limit_per_hour) {
          issues.push(`Rate limit reached for ${platform}: ${count}/${limit.rate_limit_per_hour} posts/hour`);
          warnings.push(`${platform}: Rate limit reached, consider scheduling at a different time`);
          rate_limit_ok = false;
        }
      }

      platform_results[platform] = {
        caption_ok,
        media_ok,
        rate_limit_ok,
        issues,
      };

      // Collect errors
      if (!caption_ok || !media_ok) {
        errors.push(...issues);
      }
    }

    const result: ValidationResult = {
      ok: errors.length === 0,
      warnings,
      errors,
      platform_results,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Validate] Error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
