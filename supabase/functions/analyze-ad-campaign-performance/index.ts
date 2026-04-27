// Aggregates social-post performance metrics per Ad Director campaign variant.
// For a given master project, walks all children (cutdowns + A/B variants + aspect clones),
// finds linked posts in `ad_campaign_posts`, joins to `post_metrics` and returns
// per-variant aggregated engagement + a "winner" pick.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VariantRollup {
  project_id: string;
  variant_strategy: string | null;
  cutdown_type: string | null;
  variant_label: string;
  posts_count: number;
  total_impressions: number;
  total_reach: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  total_saves: number;
  total_video_views: number;
  total_engagement: number;
  avg_engagement_rate: number;
  platforms: string[];
  is_master: boolean;
}

function variantLabel(c: { cutdown_type: string | null; ad_variant_strategy: string | null }, isMaster: boolean): string {
  if (isMaster) return 'Master';
  if (c.cutdown_type) return `Cutdown ${c.cutdown_type}`;
  const s = c.ad_variant_strategy ?? '';
  if (s.startsWith('aspect:')) return `Format ${s.slice(7)}`;
  return s || 'Variant';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { masterProjectId } = body as { masterProjectId?: string };
    if (!masterProjectId || typeof masterProjectId !== 'string') {
      return new Response(JSON.stringify({ error: 'masterProjectId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Master project (with ownership check via RLS)
    const { data: master, error: masterErr } = await supabase
      .from('composer_projects')
      .select('id, title, status, cutdown_type, ad_variant_strategy')
      .eq('id', masterProjectId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (masterErr || !master) {
      return new Response(JSON.stringify({ error: 'Master project not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. All children
    const { data: children, error: chErr } = await supabase
      .from('composer_projects')
      .select('id, title, status, cutdown_type, ad_variant_strategy')
      .eq('parent_project_id', masterProjectId)
      .eq('user_id', user.id);
    if (chErr) throw chErr;

    const allProjects = [
      { ...master, isMaster: true },
      ...(children ?? []).map((c) => ({ ...c, isMaster: false })),
    ];
    const projectIds = allProjects.map((p) => p.id);

    // 3. Linked posts
    const { data: links, error: linkErr } = await supabase
      .from('ad_campaign_posts')
      .select('project_id, platform, external_post_id')
      .in('project_id', projectIds);
    if (linkErr) throw linkErr;

    // 4. Pull metrics for those posts
    const postIds = (links ?? []).map((l) => l.external_post_id).filter(Boolean) as string[];
    let metricsByPostId: Record<string, any> = {};
    if (postIds.length > 0) {
      const { data: metrics, error: mErr } = await supabase
        .from('post_metrics')
        .select('provider, post_id, likes, comments, shares, saves, reach, impressions, video_views, engagement_rate')
        .eq('user_id', user.id)
        .in('post_id', postIds);
      if (mErr) throw mErr;
      for (const m of metrics ?? []) {
        metricsByPostId[`${m.provider}:${m.post_id}`] = m;
      }
    }

    // 5. Roll up per project
    const linksByProject = new Map<string, typeof links>();
    for (const l of links ?? []) {
      const arr = linksByProject.get(l.project_id) ?? [];
      arr.push(l);
      linksByProject.set(l.project_id, arr);
    }

    const rollups: VariantRollup[] = allProjects.map((p) => {
      const projectLinks = linksByProject.get(p.id) ?? [];
      const platforms = new Set<string>();
      let posts = 0, imp = 0, reach = 0, likes = 0, comm = 0, sh = 0, sv = 0, vv = 0;
      let erSum = 0, erCount = 0;

      for (const l of projectLinks) {
        if (!l.external_post_id) continue;
        const key = `${l.platform}:${l.external_post_id}`;
        const m = metricsByPostId[key];
        if (!m) continue;
        posts += 1;
        platforms.add(l.platform);
        imp += m.impressions ?? 0;
        reach += m.reach ?? 0;
        likes += m.likes ?? 0;
        comm += m.comments ?? 0;
        sh += m.shares ?? 0;
        sv += m.saves ?? 0;
        vv += m.video_views ?? 0;
        if (typeof m.engagement_rate === 'number') {
          erSum += m.engagement_rate;
          erCount += 1;
        }
      }

      const totalEngagement = likes + comm + sh + sv;
      return {
        project_id: p.id,
        variant_strategy: p.ad_variant_strategy ?? null,
        cutdown_type: p.cutdown_type ?? null,
        variant_label: variantLabel(p, p.isMaster),
        posts_count: posts,
        total_impressions: imp,
        total_reach: reach,
        total_likes: likes,
        total_comments: comm,
        total_shares: sh,
        total_saves: sv,
        total_video_views: vv,
        total_engagement: totalEngagement,
        avg_engagement_rate: erCount > 0 ? erSum / erCount : 0,
        platforms: Array.from(platforms),
        is_master: p.isMaster,
      };
    });

    // 6. Pick winner — best avg_engagement_rate among variants with posts > 0;
    //    tiebreaker: total_engagement.
    const eligible = rollups.filter((r) => r.posts_count > 0);
    let winner: VariantRollup | null = null;
    if (eligible.length > 0) {
      winner = eligible.reduce((best, cur) => {
        if (!best) return cur;
        if (cur.avg_engagement_rate > best.avg_engagement_rate) return cur;
        if (cur.avg_engagement_rate === best.avg_engagement_rate && cur.total_engagement > best.total_engagement) return cur;
        return best;
      }, null as VariantRollup | null);
    }

    return new Response(
      JSON.stringify({
        masterProjectId,
        rollups,
        winner_project_id: winner?.project_id ?? null,
        total_posts: (links ?? []).length,
        analyzed_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[analyze-ad-campaign-performance]', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
