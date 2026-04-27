/**
 * AdCampaignPerformance — performance roll-up panel for the Campaign tab.
 *
 * Calls `analyze-ad-campaign-performance` to get per-variant metrics
 * aggregated from `post_metrics` (joined via `ad_campaign_posts`).
 *
 * Shows:
 *   - Totals row (posts, impressions, engagement)
 *   - Per-variant table with engagement-rate bars
 *   - Winner badge on best-performing variant
 *   - "Clone Winner → New Master" CTA (clones winner project as new draft master)
 *   - Empty state with link to publish flow when no posts are linked yet
 */

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  TrendingUp,
  Trophy,
  RefreshCw,
  Link2,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Copy,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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

interface PerformanceResponse {
  masterProjectId: string;
  rollups: VariantRollup[];
  winner_project_id: string | null;
  total_posts: number;
  analyzed_at: string;
}

interface Props {
  masterProjectId?: string;
  onCloneWinner?: (newProjectId: string) => void;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

export default function AdCampaignPerformance({ masterProjectId, onCloneWinner }: Props) {
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [cloning, setCloning] = useState(false);

  const load = async () => {
    if (!masterProjectId) return;
    setLoading(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke('analyze-ad-campaign-performance', {
        body: { masterProjectId },
      });
      if (error) throw error;
      setData(resp as PerformanceResponse);
    } catch (err: any) {
      console.error('[AdCampaignPerformance] load failed:', err);
      toast({
        title: 'Performance konnte nicht geladen werden',
        description: err?.message ?? 'Bitte erneut versuchen.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (masterProjectId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterProjectId]);

  /** Clone winner project as a new master (fresh draft, parent_project_id cleared). */
  const handleCloneWinner = async () => {
    if (!data?.winner_project_id) return;
    setCloning(true);
    try {
      const { data: src, error: srcErr } = await supabase
        .from('composer_projects')
        .select('*')
        .eq('id', data.winner_project_id)
        .maybeSingle();
      if (srcErr || !src) throw srcErr ?? new Error('Winner project not found');

      const { id: _id, created_at: _c, updated_at: _u, parent_project_id: _p, cutdown_type: _ct, output_url: _ou, ...rest } = src as any;

      const { data: cloned, error: cloneErr } = await supabase
        .from('composer_projects')
        .insert({
          ...rest,
          title: `${src.title} — Winner Clone`,
          status: 'draft',
          parent_project_id: null,
          cutdown_type: null,
          output_url: null,
          ad_variant_strategy: null,
        })
        .select('id')
        .single();
      if (cloneErr) throw cloneErr;

      // Clone scenes
      const { data: scenes } = await supabase
        .from('composer_scenes')
        .select('*')
        .eq('project_id', data.winner_project_id);
      if (scenes && scenes.length > 0) {
        const newScenes = scenes.map(({ id, created_at, updated_at, ...s }: any) => ({
          ...s,
          project_id: cloned.id,
        }));
        await supabase.from('composer_scenes').insert(newScenes);
      }

      toast({
        title: 'Winner geklont',
        description: 'Neuer Master wurde erstellt — bereit für die nächste Iteration.',
      });
      onCloneWinner?.(cloned.id);
    } catch (err: any) {
      console.error('[AdCampaignPerformance] clone failed:', err);
      toast({
        title: 'Klonen fehlgeschlagen',
        description: err?.message ?? 'Bitte erneut versuchen.',
        variant: 'destructive',
      });
    } finally {
      setCloning(false);
    }
  };

  if (!masterProjectId) return null;

  if (loading && !data) {
    return (
      <Card className="border-border/40 bg-card/60 p-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        <p className="text-xs text-muted-foreground mt-2">Lade Performance-Daten …</p>
      </Card>
    );
  }

  if (!data || data.total_posts === 0) {
    return (
      <Card className="border-border/40 bg-card/60 p-6">
        <div className="flex items-start gap-3">
          <TrendingUp className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold mb-1">Noch keine Performance-Daten</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Verknüpfe veröffentlichte Posts mit deinen Varianten, um Engagement zu vergleichen und einen Winner zu küren.
              Sobald du eine Variante über die Plattform-Integration postest, erscheint sie hier automatisch.
            </p>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} />
              Aktualisieren
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const totals = data.rollups.reduce(
    (acc, r) => ({
      impressions: acc.impressions + r.total_impressions,
      engagement: acc.engagement + r.total_engagement,
      posts: acc.posts + r.posts_count,
    }),
    { impressions: 0, engagement: 0, posts: 0 },
  );

  const maxER = Math.max(...data.rollups.map((r) => r.avg_engagement_rate), 0.01);

  return (
    <div className="space-y-4">
      {/* Header + refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            Performance-Insights
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data.total_posts} verknüpfte Posts · zuletzt aktualisiert{' '}
            {new Date(data.analyzed_at).toLocaleTimeString()}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 border-border/40 bg-card/60">
          <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Posts</div>
          <div className="text-xl font-semibold">{totals.posts}</div>
        </Card>
        <Card className="p-3 border-border/40 bg-card/60">
          <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Impressions</div>
          <div className="text-xl font-semibold">{formatNum(totals.impressions)}</div>
        </Card>
        <Card className="p-3 border-border/40 bg-card/60">
          <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Engagement</div>
          <div className="text-xl font-semibold">{formatNum(totals.engagement)}</div>
        </Card>
      </div>

      {/* Per-variant rollup */}
      <Card className="border-border/40 bg-card/60 overflow-hidden">
        <div className="divide-y divide-border/40">
          {data.rollups.map((r) => {
            const isWinner = r.project_id === data.winner_project_id;
            const erPct = (r.avg_engagement_rate / maxER) * 100;
            return (
              <div key={r.project_id} className="p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {r.is_master && (
                      <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[9px]">MASTER</Badge>
                    )}
                    <span className="text-sm font-medium truncate">{r.variant_label}</span>
                    {isWinner && (
                      <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[9px] flex items-center gap-1">
                        <Trophy className="h-3 w-3" />
                        WINNER
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Link2 className="h-3 w-3" />
                    {r.posts_count} {r.posts_count === 1 ? 'Post' : 'Posts'}
                  </div>
                </div>

                {r.posts_count > 0 ? (
                  <>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2 flex-wrap">
                      <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {formatNum(r.total_impressions)}</span>
                      <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {formatNum(r.total_likes)}</span>
                      <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {formatNum(r.total_comments)}</span>
                      <span className="flex items-center gap-1"><Share2 className="h-3 w-3" /> {formatNum(r.total_shares)}</span>
                      <span className="flex items-center gap-1"><Bookmark className="h-3 w-3" /> {formatNum(r.total_saves)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', isWinner ? 'bg-emerald-400' : 'bg-primary/60')}
                          style={{ width: `${Math.max(erPct, 2)}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-mono w-14 text-right">
                        {(r.avg_engagement_rate * 100).toFixed(2)}%
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic">Noch keine Posts verknüpft</p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Winner action */}
      {data.winner_project_id && (
        <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Trophy className="h-4 w-4 text-emerald-400" />
                Winner identifiziert
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Klone die Top-Variante als neuen Master und iteriere weiter.
              </p>
            </div>
            <Button size="sm" onClick={handleCloneWinner} disabled={cloning}>
              {cloning ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Copy className="h-3.5 w-3.5 mr-1.5" />
              )}
              Winner → Neuer Master
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
