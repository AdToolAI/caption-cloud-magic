/**
 * AdCampaignTree — read-only Campaign tab content for the Video Composer.
 *
 * Shows the master project + auto-spawned children (cutdowns + A/B variants)
 * in a hierarchical card grid. Each child surfaces:
 *   - status badge (draft / storyboard / completed)
 *   - render output URL (if ready)
 *   - a "Open" button that loads the child project into the composer
 *
 * Children are queried via parent_project_id = masterProjectId.
 */

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Scissors, Sparkles, ExternalLink, Megaphone, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { AdCampaignMeta } from '@/types/video-composer';

interface CampaignChild {
  id: string;
  title: string;
  status: string;
  output_url: string | null;
  cutdown_type: string | null;
  ad_variant_strategy: string | null;
  created_at: string;
}

interface AdCampaignTreeProps {
  masterProjectId?: string;
  masterTitle: string;
  masterStatus: string;
  masterOutputUrl?: string | null;
  adMeta?: AdCampaignMeta | null;
  /** Called when the user clicks "Open" on a child — parent should load that
   *  project into the composer (e.g. via ?project=childId). */
  onOpenChild?: (childId: string) => void;
}

const VARIANT_LABEL: Record<string, string> = {
  emotional: 'Emotional Hook',
  rational: 'Rational Proof',
  curiosity: 'Curiosity Gap',
};

const CUTDOWN_LABEL: Record<string, string> = {
  '15s': '15s Cutdown',
  '6s-hook': '6s Hook',
};

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'completed'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : status === 'failed'
      ? 'bg-destructive/15 text-destructive border-destructive/30'
      : 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return <Badge variant="outline" className={cn('text-[10px] uppercase tracking-wider', tone)}>{status}</Badge>;
}

export default function AdCampaignTree({
  masterProjectId,
  masterTitle,
  masterStatus,
  masterOutputUrl,
  adMeta,
  onOpenChild,
}: AdCampaignTreeProps) {
  const [children, setChildren] = useState<CampaignChild[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!masterProjectId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('composer_projects')
        .select('id, title, status, output_url, cutdown_type, ad_variant_strategy, created_at')
        .eq('parent_project_id', masterProjectId)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.warn('[AdCampaignTree] load children failed:', error);
      } else {
        setChildren((data ?? []) as CampaignChild[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [masterProjectId, masterStatus]); // refetch when master status changes (e.g. completed → spawn)

  const cutdowns = useMemo(() => children.filter(c => c.cutdown_type), [children]);
  const variants = useMemo(() => children.filter(c => !c.cutdown_type && c.ad_variant_strategy), [children]);

  if (!adMeta) {
    return (
      <Card className="border-border/40 bg-card/60 p-8 text-center">
        <Megaphone className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
        <h3 className="text-base font-semibold mb-1">Keine Kampagne aktiv</h3>
        <p className="text-sm text-muted-foreground">
          Starte den <strong>Ad Director</strong>, um eine Kampagne mit Cutdowns und A/B-Varianten zu erstellen.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-amber-400" />
          Kampagnen-Übersicht
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Master-Spot + automatisch erzeugte Cutdowns &amp; A/B-Varianten.
        </p>
      </div>

      {/* Master */}
      <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40">MASTER</Badge>
              <StatusBadge status={masterStatus} />
              <Badge variant="outline" className="text-[10px]">
                {adMeta.format?.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {adMeta.framework}
              </Badge>
              {adMeta.brandKitApplied && (
                <Badge variant="outline" className="text-[10px] text-primary border-primary/40">
                  Brand-Kit ✓
                </Badge>
              )}
            </div>
            <h3 className="font-semibold truncate">{masterTitle || 'Untitled Campaign'}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Tonalität: {adMeta.tonality} · Ziel: {adMeta.goal}
              {adMeta.variantStrategy && <> · Skript: {VARIANT_LABEL[adMeta.variantStrategy] ?? adMeta.variantStrategy}</>}
            </p>
          </div>
          {masterOutputUrl && (
            <Button asChild size="sm" variant="outline">
              <a href={masterOutputUrl} target="_blank" rel="noreferrer">
                <Play className="h-3.5 w-3.5 mr-1.5" /> Ansehen
              </a>
            </Button>
          )}
        </div>
      </Card>

      {/* Cutdowns */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Scissors className="h-4 w-4" />
          Cutdowns ({cutdowns.length})
        </h3>
        {loading && <p className="text-xs text-muted-foreground">Lade …</p>}
        {!loading && cutdowns.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            Keine Cutdowns konfiguriert. Aktiviere im Ad Director „15s“ oder „6s Hook“.
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {cutdowns.map((c) => (
            <ChildCard key={c.id} child={c} onOpen={onOpenChild} />
          ))}
        </div>
      </section>

      {/* A/B Variants */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          A/B-Varianten ({variants.length})
        </h3>
        {!loading && variants.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            Keine zusätzlichen Skript-Varianten. Aktiviere im Ad Director „Alle Varianten rendern“.
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {variants.map((c) => (
            <ChildCard key={c.id} child={c} onOpen={onOpenChild} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ChildCard({
  child,
  onOpen,
}: {
  child: CampaignChild;
  onOpen?: (id: string) => void;
}) {
  const label = child.cutdown_type
    ? CUTDOWN_LABEL[child.cutdown_type] ?? child.cutdown_type
    : VARIANT_LABEL[child.ad_variant_strategy ?? ''] ?? child.ad_variant_strategy ?? 'Variant';

  return (
    <Card className="border-border/40 bg-card/60 p-4 hover:border-primary/40 transition-colors">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h4 className="text-sm font-semibold truncate">{label}</h4>
        <StatusBadge status={child.status} />
      </div>
      <p className="text-xs text-muted-foreground truncate mb-3">{child.title}</p>
      <div className="flex gap-2">
        {onOpen && (
          <Button size="sm" variant="outline" className="flex-1" onClick={() => onOpen(child.id)}>
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Öffnen
          </Button>
        )}
        {child.output_url && (
          <Button asChild size="sm" variant="ghost">
            <a href={child.output_url} target="_blank" rel="noreferrer">
              <Play className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>
    </Card>
  );
}
