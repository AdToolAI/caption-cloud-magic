/**
 * AdCampaignTree — read-only Campaign tab content for the Video Composer.
 *
 * Shows the master project + auto-spawned children (cutdowns + A/B variants
 * + multi-aspect siblings) in a hierarchical card grid. Each child surfaces:
 *   - status badge (draft / storyboard / completed)
 *   - render output URL (if ready)
 *   - "Open" button that loads the child project into the composer
 *   - "VO neu synthetisieren" on cutdown children (master VO desyncs on cuts)
 *
 * Children are queried via parent_project_id = masterProjectId.
 */

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  Scissors,
  Sparkles,
  ExternalLink,
  Megaphone,
  Play,
  Mic,
  Crop,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { getTonalityVoice } from '@/config/adTonalityVoiceMap';
import type { AdCampaignMeta, AdTonalityId } from '@/types/video-composer';

interface CampaignChild {
  id: string;
  title: string;
  status: string;
  output_url: string | null;
  cutdown_type: string | null;
  ad_variant_strategy: string | null;
  briefing: any;
  assembly_config: any;
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

function isAspectStrategy(s: string | null): s is `aspect:${string}` {
  return typeof s === 'string' && s.startsWith('aspect:');
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
  const [resynthing, setResynthing] = useState<string | null>(null);

  useEffect(() => {
    if (!masterProjectId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('composer_projects')
        .select('id, title, status, output_url, cutdown_type, ad_variant_strategy, briefing, assembly_config, created_at')
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
  const variants = useMemo(
    () => children.filter(c => !c.cutdown_type && c.ad_variant_strategy && !isAspectStrategy(c.ad_variant_strategy)),
    [children],
  );
  const aspects = useMemo(
    () => children.filter(c => !c.cutdown_type && isAspectStrategy(c.ad_variant_strategy)),
    [children],
  );

  /** Re-synthesize voiceover on a cutdown child against its trimmed script.
   *  Reuses generate-voiceover with the master tonality voice. Updates the
   *  child's assembly_config in place. */
  const handleResynthVO = async (child: CampaignChild) => {
    if (!adMeta?.tonality) {
      toast({
        title: 'Voiceover nicht möglich',
        description: 'Tonalität fehlt im Kampagnen-Meta.',
        variant: 'destructive',
      });
      return;
    }
    setResynthing(child.id);
    try {
      // Source script = master script lines truncated to the child duration.
      // Cutdowns inherit master scenes (with shortened duration), so we collect
      // text overlays from the child scenes as a deterministic fallback script.
      const { data: childScenes, error: scnErr } = await supabase
        .from('composer_scenes')
        .select('text_overlay, order_index')
        .eq('project_id', child.id)
        .order('order_index', { ascending: true });
      if (scnErr) throw scnErr;

      const scriptLines = (childScenes ?? [])
        .map((s: any) => (s.text_overlay?.text ?? '').trim())
        .filter(Boolean);
      if (scriptLines.length === 0) {
        toast({
          title: 'Kein Skript gefunden',
          description: 'Diese Variante hat keine Text-Overlays — VO kann nicht generiert werden.',
          variant: 'destructive',
        });
        return;
      }
      const fullScript = scriptLines.join('. ').replace(/\.\.+/g, '.').trim();
      const voiceCfg = getTonalityVoice(adMeta.tonality as AdTonalityId);

      const { data: voData, error: voError } = await supabase.functions.invoke(
        'generate-voiceover',
        {
          body: {
            text: fullScript,
            voiceId: voiceCfg.voiceId,
            stability: voiceCfg.stability,
            similarityBoost: voiceCfg.similarityBoost,
            style: voiceCfg.style,
            useSpeakerBoost: voiceCfg.useSpeakerBoost,
            speed: voiceCfg.speed,
            projectId: child.id,
          },
        },
      );
      if (voError) throw voError;
      if (!voData?.audioUrl) throw new Error('No audio URL returned');

      const newAssembly = {
        ...(child.assembly_config ?? {}),
        voiceover: {
          enabled: true,
          voiceId: voData.voiceId || voiceCfg.voiceId,
          voiceName: voData.voiceUsed || voiceCfg.voiceLabel,
          script: fullScript,
          audioUrl: voData.audioUrl,
          speed: voiceCfg.speed,
          stability: voiceCfg.stability,
          similarityBoost: voiceCfg.similarityBoost,
          styleExaggeration: voiceCfg.style,
          useSpeakerBoost: voiceCfg.useSpeakerBoost,
          durationSeconds: voData.duration,
        },
      };

      const { error: updErr } = await supabase
        .from('composer_projects')
        .update({ assembly_config: newAssembly as any })
        .eq('id', child.id);
      if (updErr) throw updErr;

      // Optimistically refresh local state
      setChildren((prev) =>
        prev.map((c) => (c.id === child.id ? { ...c, assembly_config: newAssembly } : c)),
      );

      toast({
        title: 'Voiceover erstellt',
        description: `Neue VO (${voiceCfg.voiceLabel}) für „${CUTDOWN_LABEL[child.cutdown_type ?? ''] ?? child.cutdown_type}".`,
      });
    } catch (err: any) {
      console.error('[AdCampaignTree] re-synth VO failed:', err);
      toast({
        title: 'VO-Synthese fehlgeschlagen',
        description: err?.message ?? 'Bitte erneut versuchen.',
        variant: 'destructive',
      });
    } finally {
      setResynthing(null);
    }
  };

  if (!adMeta) {
    return (
      <Card className="border-border/40 bg-card/60 p-8 text-center">
        <Megaphone className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
        <h3 className="text-base font-semibold mb-1">Keine Kampagne aktiv</h3>
        <p className="text-sm text-muted-foreground">
          Starte den <strong>Ad Director</strong>, um eine Kampagne mit Cutdowns, A/B-Varianten und Multi-Format zu erstellen.
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
          Master-Spot + automatisch erzeugte Cutdowns, A/B-Varianten &amp; Format-Klone.
        </p>
      </div>

      {/* Master */}
      <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
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
            Keine Cutdowns konfiguriert. Aktiviere im Ad Director „15s" oder „6s Hook".
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {cutdowns.map((c) => (
            <ChildCard
              key={c.id}
              child={c}
              onOpen={onOpenChild}
              showResynthVO
              onResynthVO={() => handleResynthVO(c)}
              resynthing={resynthing === c.id}
            />
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
            Keine zusätzlichen Skript-Varianten. Aktiviere im Ad Director „Alle Varianten rendern".
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {variants.map((c) => (
            <ChildCard key={c.id} child={c} onOpen={onOpenChild} />
          ))}
        </div>
      </section>

      {/* Multi-Aspect Format Clones */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Crop className="h-4 w-4" />
          Format-Klone ({aspects.length})
        </h3>
        {!loading && aspects.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            Keine zusätzlichen Formate. Aktiviere im Ad Director „Multi-Format-Bundling" (9:16, 1:1, 4:5).
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {aspects.map((c) => (
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
  showResynthVO = false,
  onResynthVO,
  resynthing = false,
}: {
  child: CampaignChild;
  onOpen?: (id: string) => void;
  showResynthVO?: boolean;
  onResynthVO?: () => void;
  resynthing?: boolean;
}) {
  let label: string;
  if (child.cutdown_type) {
    label = CUTDOWN_LABEL[child.cutdown_type] ?? child.cutdown_type;
  } else if (isAspectStrategy(child.ad_variant_strategy)) {
    label = `Format ${child.ad_variant_strategy.slice('aspect:'.length)}`;
  } else {
    label = VARIANT_LABEL[child.ad_variant_strategy ?? ''] ?? child.ad_variant_strategy ?? 'Variant';
  }

  const hasVO = !!child.assembly_config?.voiceover?.enabled && !!child.assembly_config?.voiceover?.audioUrl;

  return (
    <Card className="border-border/40 bg-card/60 p-4 hover:border-primary/40 transition-colors">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h4 className="text-sm font-semibold truncate">{label}</h4>
        <StatusBadge status={child.status} />
      </div>
      <p className="text-xs text-muted-foreground truncate mb-3">{child.title}</p>
      <div className="flex flex-wrap gap-2">
        {onOpen && (
          <Button size="sm" variant="outline" className="flex-1 min-w-[100px]" onClick={() => onOpen(child.id)}>
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Öffnen
          </Button>
        )}
        {showResynthVO && onResynthVO && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onResynthVO}
            disabled={resynthing}
            title={hasVO ? 'Voiceover neu synthetisieren' : 'Voiceover für diese Länge erzeugen'}
          >
            {resynthing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mic className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5 text-xs">{hasVO ? 'VO neu' : 'VO erzeugen'}</span>
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
