import { useEffect, useRef, useState } from 'react';
import { Loader2, Scissors, Wand2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import type { ComposerScene } from '@/types/video-composer';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { detectLeadInTrim } from '@/lib/video-composer/detectLeadInTrim';

interface LeadInTrimSheetProps {
  scene: ComposerScene;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Phase 5.5 — Smart-Trim sheet.
 * Lets the user fine-tune the lead-in trim seconds (0–1.5s) on a rendered
 * AI clip with live before/after preview, plus an "Auto-Detect" button that
 * runs the client-side pixel-diff scan.
 */
export default function LeadInTrimSheet({ scene, open, onOpenChange }: LeadInTrimSheetProps) {
  const initial = Math.max(0, Number(scene.clipLeadInTrimSeconds ?? 0));
  const [trim, setTrim] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const previewRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (open) setTrim(Math.max(0, Number(scene.clipLeadInTrimSeconds ?? 0)));
  }, [open, scene.clipLeadInTrimSeconds]);

  // Live-preview: hop to trim point whenever slider changes
  useEffect(() => {
    const el = previewRef.current;
    if (!el || !open) return;
    try {
      if (isFinite(el.duration) && trim < el.duration - 0.1) {
        el.currentTime = trim;
        el.play().catch(() => { /* noop */ });
      }
    } catch { /* noop */ }
  }, [trim, open]);

  const runAutoDetect = async () => {
    if (!scene.clipUrl) return;
    setDetecting(true);
    try {
      const { trimSeconds } = await detectLeadInTrim(scene.clipUrl);
      setTrim(trimSeconds);
      toast({
        title: trimSeconds > 0 ? `✂️ Lead-In erkannt: ${trimSeconds}s` : 'Kein Freeze erkannt',
        description: trimSeconds > 0
          ? 'Slider angepasst. „Speichern" zum Übernehmen.'
          : 'Der Clip startet sauber mit Bewegung.',
      });
    } catch (err) {
      toast({
        title: 'Auto-Detect fehlgeschlagen',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setDetecting(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from('composer_scenes')
        .update({ clip_lead_in_trim_seconds: trim })
        .eq('id', scene.id);
      if (error) throw error;
      toast({ title: '✓ Trim gespeichert', description: `${trim.toFixed(2)}s am Anfang werden übersprungen.` });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Speichern fehlgeschlagen',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => setTrim(0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-amber-400" />
            Smart-Trim · Lead-In
          </SheetTitle>
          <SheetDescription>
            Schneidet eingefrorene Anfangsframes ab, die i2v-Modelle (Hailuo, Kling, Wan, …) zwischen Referenzbild und erster Bewegung produzieren.
          </SheetDescription>
        </SheetHeader>

        {scene.clipUrl ? (
          <div className="rounded-lg overflow-hidden bg-black aspect-video">
            <video
              ref={previewRef}
              src={scene.clipUrl}
              className="w-full h-full object-cover"
              muted
              loop
              playsInline
              autoPlay
            />
          </div>
        ) : (
          <div className="rounded-lg bg-muted/30 aspect-video flex items-center justify-center text-xs text-muted-foreground">
            Kein gerenderter Clip vorhanden.
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Trim am Anfang</span>
            <span className="text-sm font-mono text-amber-300 tabular-nums">{trim.toFixed(2)}s</span>
          </div>
          <Slider
            value={[trim]}
            min={0}
            max={1.5}
            step={0.05}
            onValueChange={(v) => setTrim(Number(v[0].toFixed(2)))}
          />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground/60">
            <span>0s</span>
            <span>0.75s</span>
            <span>1.5s</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={runAutoDetect}
            disabled={detecting || !scene.clipUrl}
            className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
          >
            {detecting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1" />}
            Auto-Detect
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={detecting}>
            Reset (0s)
          </Button>
        </div>

        <div className="mt-auto flex items-center justify-end gap-2 pt-3 border-t border-border/40">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            Abbrechen
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Speichern
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
