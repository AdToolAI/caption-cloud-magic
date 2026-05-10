/**
 * Phase 5.3 — Reroll Variant Grid (Artlist-style "pick your take")
 *
 * Renders up to 4 LTX Fast-Preview takes side-by-side. Each take has its own
 * seed; user clicks "Übernehmen" to promote a variant → its previewUrl becomes
 * `preview_clip_url` and its seed lands on `composer_scenes.seed` for the next
 * HQ render. "Reroll" fires a fresh batch from the locked seed (±offsets).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, Check, RefreshCw, Lock, Unlock, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ComposerScene, SceneSeedVariant } from '@/types/video-composer';

interface RerollVariantGridProps {
  scene: ComposerScene;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Briefing aspect (16:9 / 9:16 / 1:1 / 4:5) — falls back to 16:9. */
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
}

const SLOT_COUNT = 4;

export default function RerollVariantGrid({
  scene,
  open,
  onOpenChange,
  aspectRatio,
}: RerollVariantGridProps) {
  const variants: SceneSeedVariant[] = scene.seedVariations ?? [];
  const ltxAspect = aspectRatio === '4:5' ? '9:16' : (aspectRatio ?? '16:9');
  const hasPrompt = !!(scene.aiPrompt && scene.aiPrompt.trim().length >= 4);
  const anyGenerating = variants.some((v) => v?.status === 'generating');
  const [busy, setBusy] = useState(false);
  const [promoting, setPromoting] = useState<number | null>(null);

  // Auto-trigger first batch on open if there are no variants yet
  useEffect(() => {
    if (!open) return;
    if (!hasPrompt) return;
    if (variants.length > 0) return;
    void triggerBatch(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function triggerBatch(parentSeed?: number) {
    if (busy || anyGenerating) return;
    if (!hasPrompt) {
      toast({
        title: 'Prompt fehlt',
        description: 'Bitte zuerst einen Prompt schreiben.',
        variant: 'destructive',
      });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke('compose-scene-variants', {
        body: {
          sceneId: scene.id,
          prompt: scene.aiPrompt,
          startImageUrl: scene.referenceImageUrl || scene.firstFrameUrl || undefined,
          aspectRatio: ltxAspect,
          count: SLOT_COUNT,
          parentSeed,
        },
      });
      if (error) throw error;
      toast({
        title: parentSeed != null ? '🔁 Variationen gestartet' : '⚡ 4 Takes gestartet',
        description: 'Fast-Previews ~10 Sek. — werden hier live aktualisiert.',
      });
    } catch (err) {
      toast({
        title: 'Reroll fehlgeschlagen',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  }

  async function promote(index: number) {
    const v = variants[index];
    if (!v || v.status !== 'ready' || !v.previewUrl) return;
    setPromoting(index);
    try {
      const { error } = await supabase
        .from('composer_scenes')
        .update({
          seed: v.seed,
          preview_clip_url: v.previewUrl,
          preview_status: 'ready',
        } as any)
        .eq('id', scene.id);
      if (error) throw error;
      toast({
        title: '✓ Take übernommen',
        description: `Seed ${v.seed} ist jetzt der Master für die HQ-Generierung.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Übernehmen fehlgeschlagen',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setPromoting(null);
    }
  }

  async function unlockSeed() {
    try {
      await supabase
        .from('composer_scenes')
        .update({ seed: null } as any)
        .eq('id', scene.id);
      toast({ title: 'Seed entsperrt', description: 'Nächster Reroll nutzt zufällige Seeds.' });
    } catch (err) {
      console.warn(err);
    }
  }

  const slots = useMemo(() => {
    const arr: (SceneSeedVariant | null)[] = [];
    for (let i = 0; i < SLOT_COUNT; i++) arr.push(variants[i] ?? null);
    return arr;
  }, [variants]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-400" />
            4er Reroll-Grid
            {scene.seed != null && (
              <Badge variant="outline" className="ml-2 gap-1 border-amber-500/40 text-amber-300">
                <Lock className="h-3 w-3" /> Seed {scene.seed}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            4 schnelle LTX-Vorschauen (~3 Sek., 384px) parallel. Wähle deinen Lieblings-Take —
            der gewählte Seed wird für die High-Quality-Generierung gelockt.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {slots.map((v, i) => (
            <VariantSlot
              key={i}
              index={i}
              variant={v}
              aspect={ltxAspect}
              onPromote={() => promote(i)}
              promoting={promoting === i}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40">
          <div className="text-[11px] text-muted-foreground">
            ~0.02 € pro 4er-Batch · LTX-Video · läuft im Hintergrund weiter, wenn du schließt
          </div>
          <div className="flex gap-2">
            {scene.seed != null && (
              <Button size="sm" variant="ghost" onClick={unlockSeed}>
                <Unlock className="h-3 w-3 mr-1" /> Seed entsperren
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => triggerBatch(scene.seed ?? undefined)}
              disabled={busy || anyGenerating || !hasPrompt}
            >
              {busy || anyGenerating
                ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                : <RefreshCw className="h-3 w-3 mr-1" />}
              {scene.seed != null ? 'Variationen' : 'Neue 4 Takes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface VariantSlotProps {
  index: number;
  variant: SceneSeedVariant | null;
  aspect: '16:9' | '9:16' | '1:1';
  onPromote: () => void;
  promoting: boolean;
}

function VariantSlot({ index, variant, aspect, onPromote, promoting }: VariantSlotProps) {
  const aspectClass = aspect === '9:16' ? 'aspect-[9/16]' : aspect === '1:1' ? 'aspect-square' : 'aspect-video';

  if (!variant) {
    return (
      <div className={cn('relative rounded border border-dashed border-border/40 bg-muted/20 flex items-center justify-center', aspectClass)}>
        <span className="text-xs text-muted-foreground/60">Take {index + 1}</span>
      </div>
    );
  }

  if (variant.status === 'generating') {
    return (
      <div className={cn('relative rounded border border-amber-500/40 bg-amber-500/10 overflow-hidden flex items-center justify-center', aspectClass)}>
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/30 to-amber-500/0 animate-pulse" />
        <div className="relative flex flex-col items-center gap-1">
          <Loader2 className="h-5 w-5 animate-spin text-amber-300" />
          <span className="text-[10px] text-amber-300 font-medium">Take {index + 1}</span>
          <span className="text-[9px] text-amber-300/70">Seed {variant.seed}</span>
        </div>
      </div>
    );
  }

  if (variant.status === 'failed' || !variant.previewUrl) {
    return (
      <div className={cn('relative rounded border border-destructive/40 bg-destructive/10 flex flex-col items-center justify-center gap-1', aspectClass)}>
        <XCircle className="h-4 w-4 text-destructive" />
        <span className="text-[10px] text-destructive font-medium">Take {index + 1}</span>
        <span className="text-[9px] text-destructive/70">Seed {variant.seed} fehlgeschlagen</span>
      </div>
    );
  }

  return (
    <div className={cn('relative group rounded border border-border/40 overflow-hidden bg-black', aspectClass)}>
      <video
        src={variant.previewUrl}
        className="w-full h-full object-cover"
        autoPlay
        muted
        loop
        playsInline
      />
      <div className="absolute top-1 left-1 bg-black/70 text-white rounded px-1.5 py-0.5 text-[9px] font-mono">
        Take {index + 1} · Seed {variant.seed}
      </div>
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-end justify-center p-2">
        <Button
          size="sm"
          onClick={onPromote}
          disabled={promoting}
          className="opacity-0 group-hover:opacity-100 transition bg-amber-500 hover:bg-amber-400 text-black font-semibold"
        >
          {promoting
            ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            : <Check className="h-3 w-3 mr-1" />}
          Übernehmen
        </Button>
      </div>
    </div>
  );
}
