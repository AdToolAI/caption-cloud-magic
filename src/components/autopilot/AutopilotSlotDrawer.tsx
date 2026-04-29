import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, SkipForward, Clock, AlertTriangle, ShieldCheck, Sparkles, Image as ImageIcon, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useApproveSlot, useSkipSlot, type AutopilotSlot } from '@/hooks/useAutopilot';

interface Props {
  slot: AutopilotSlot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AutopilotSlotDrawer({ slot, open, onOpenChange }: Props) {
  const approve = useApproveSlot();
  const skip = useSkipSlot();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [caption, setCaption] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [savingEdits, setSavingEdits] = useState(false);

  useEffect(() => {
    if (slot) {
      setCaption(slot.caption ?? '');
      setScheduledAt(slot.scheduled_at.slice(0, 16)); // datetime-local format
    }
  }, [slot]);

  if (!slot) return null;

  const findings = (slot.qa_findings ?? {}) as Record<string, unknown>;
  const findingsArr = Array.isArray(findings.findings) ? (findings.findings as string[]) : [];
  const isEditable = slot.status === 'draft' || slot.status === 'qa_review' || slot.status === 'scheduled';

  async function saveEdits() {
    if (!slot) return;
    setSavingEdits(true);
    try {
      const newAt = new Date(scheduledAt).toISOString();
      const { error } = await supabase
        .from('autopilot_queue')
        .update({ caption, scheduled_at: newAt })
        .eq('id', slot.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['autopilot-queue'] });
      toast({ title: 'Slot aktualisiert', description: 'Änderungen gespeichert.' });
    } catch (e: unknown) {
      toast({
        title: 'Speichern fehlgeschlagen',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSavingEdits(false);
    }
  }

  async function regenerate() {
    if (!slot) return;
    try {
      await supabase.functions.invoke('autopilot-generate-slot', { body: { slot_id: slot.id, force: true } });
      toast({ title: 'Neugenerierung gestartet', description: 'Die KI erstellt diesen Slot frisch.' });
      qc.invalidateQueries({ queryKey: ['autopilot-queue'] });
    } catch {
      toast({
        title: 'Edge Function nicht erreichbar',
        description: 'Bitte später erneut versuchen.',
        variant: 'destructive',
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-[10px] uppercase">{slot.platform}</Badge>
            <Badge variant="outline" className="text-[10px] uppercase">{slot.language}</Badge>
            <StatusChip status={slot.status} />
          </div>
          <SheetTitle className="font-serif text-2xl">
            {slot.topic_hint || 'Slot-Vorschau'}
          </SheetTitle>
          <SheetDescription>
            Geplant für {new Date(slot.scheduled_at).toLocaleString()}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 mt-6">
          {/* Asset preview */}
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Visual</Label>
            <Card className="mt-2 aspect-square overflow-hidden bg-muted/40 flex items-center justify-center">
              {slot.asset_url ? (
                /\.(mp4|mov|webm)$/i.test(slot.asset_url) ? (
                  <video src={slot.asset_url} controls className="w-full h-full object-cover" />
                ) : (
                  <img src={slot.asset_url} alt={slot.topic_hint ?? 'slot asset'} className="w-full h-full object-cover" />
                )
              ) : (
                <div className="text-center text-muted-foreground p-6">
                  <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <div className="text-sm">{slot.status === 'generating' ? 'Wird generiert…' : 'Noch kein Asset erstellt'}</div>
                </div>
              )}
            </Card>
          </div>

          {/* Caption */}
          <div>
            <Label htmlFor="caption" className="text-xs uppercase tracking-widest text-muted-foreground">Caption</Label>
            <Textarea
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              disabled={!isEditable}
              rows={5}
              className="mt-2 font-mono text-sm"
              placeholder={slot.status === 'generating' ? 'Wird generiert…' : 'Noch keine Caption'}
            />
            {slot.hashtags && slot.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {slot.hashtags.map((h) => (
                  <Badge key={h} variant="outline" className="text-[10px]">#{h}</Badge>
                ))}
              </div>
            )}
          </div>

          {/* Scheduled at */}
          <div>
            <Label htmlFor="scheduled_at" className="text-xs uppercase tracking-widest text-muted-foreground">
              Veröffentlichungszeit
            </Label>
            <Input
              id="scheduled_at"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              disabled={!isEditable}
              className="mt-2"
            />
          </div>

          {/* QA findings */}
          {(slot.qa_score !== null || findingsArr.length > 0) && (
            <Card className={cn(
              'p-4',
              slot.status === 'blocked' && 'border-destructive/40 bg-destructive/5',
              slot.status === 'qa_review' && 'border-amber-500/40 bg-amber-500/5'
            )}>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">QA-Gate Befund</span>
                {slot.qa_score !== null && (
                  <Badge variant="outline" className="ml-auto">Score {slot.qa_score}/100</Badge>
                )}
              </div>
              {slot.block_reason && (
                <div className="text-sm text-destructive mb-2">{slot.block_reason}</div>
              )}
              {findingsArr.length > 0 ? (
                <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                  {findingsArr.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              ) : (
                <div className="text-xs text-muted-foreground">Keine Auffälligkeiten erkannt.</div>
              )}
            </Card>
          )}

          {/* Meta */}
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div>Erstellt: {new Date(slot.created_at).toLocaleString()}</div>
            <div>Kosten: {slot.generation_cost_credits} cr</div>
            {slot.posted_at && <div>Gepostet: {new Date(slot.posted_at).toLocaleString()}</div>}
            {slot.social_post_id && <div>Post-ID: {slot.social_post_id}</div>}
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {isEditable && (
              <Button onClick={saveEdits} disabled={savingEdits} variant="outline" size="sm" className="gap-1.5">
                <Save className="h-3.5 w-3.5" /> Speichern
              </Button>
            )}
            {(slot.status === 'qa_review' || slot.status === 'draft') && (
              <Button
                onClick={() => approve.mutate(slot.id, { onSuccess: () => onOpenChange(false) })}
                disabled={approve.isPending}
                size="sm"
                className="gap-1.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Freigeben & einplanen
              </Button>
            )}
            {(slot.status === 'qa_review' || slot.status === 'draft' || slot.status === 'scheduled') && (
              <Button
                onClick={() => skip.mutate(slot.id, { onSuccess: () => onOpenChange(false) })}
                disabled={skip.isPending}
                variant="outline"
                size="sm"
                className="gap-1.5"
              >
                <SkipForward className="h-3.5 w-3.5" /> Überspringen
              </Button>
            )}
            {(slot.status === 'failed' || slot.status === 'blocked') && (
              <Button onClick={regenerate} variant="outline" size="sm" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Neu generieren
              </Button>
            )}
            {slot.status === 'posted' && slot.social_post_id && (
              <Badge variant="outline" className="text-xs gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Veröffentlicht
              </Badge>
            )}
          </div>

          {/* Legal hint */}
          <Card className="p-3 bg-muted/30 text-[11px] text-muted-foreground flex gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <span>
              Manuelle Edits werden im Audit-Log geführt und unterliegen denselben AUP-Regeln (kein Deepfake, kein Copyright,
              keine Identitätstäuschung).
            </span>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StatusChip({ status }: { status: AutopilotSlot['status'] }) {
  const map: Record<AutopilotSlot['status'], { label: string; cls: string; icon: typeof Clock }> = {
    draft:      { label: 'Entwurf',      cls: 'bg-muted text-foreground',                          icon: Clock },
    generating: { label: 'Generiere…',   cls: 'bg-primary/15 text-primary animate-pulse',          icon: Sparkles },
    qa_review:  { label: 'QA-Review',    cls: 'bg-amber-500/15 text-amber-600',                    icon: AlertTriangle },
    scheduled:  { label: 'Geplant',      cls: 'bg-primary/20 text-primary',                        icon: Clock },
    posted:     { label: 'Live',         cls: 'bg-emerald-500/15 text-emerald-600',                icon: CheckCircle2 },
    blocked:    { label: 'Blockiert',    cls: 'bg-destructive/15 text-destructive',                icon: AlertTriangle },
    failed:     { label: 'Fehler',       cls: 'bg-destructive/10 text-destructive',                icon: AlertTriangle },
    skipped:    { label: 'Übersprungen', cls: 'bg-muted/60 text-muted-foreground',                 icon: SkipForward },
  };
  const m = map[status];
  const Icon = m.icon;
  return (
    <Badge className={cn('text-[10px] gap-1', m.cls)}>
      <Icon className="h-3 w-3" /> {m.label}
    </Badge>
  );
}
