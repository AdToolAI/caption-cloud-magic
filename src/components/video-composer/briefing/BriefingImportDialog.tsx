/**
 * BriefingImportDialog — Stage 1 + 3 of the Briefing pipeline UI.
 *
 * Paste a long-form briefing (markdown/tables/prose), hit Parse → Gemini 2.5
 * Flash returns a structured manifest, the user reviews a per-field diff, then
 * clicks "Apply" to write into composer state via useApplyBriefingManifest.
 *
 * Intentionally keeps state local; the only outward effect is the apply
 * callback the host (BriefingTab) passes in.
 */

import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Loader2, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useUnifiedMentionLibrary } from '@/hooks/useUnifiedMentionLibrary';
import { useApplyBriefingManifest } from '@/hooks/useApplyBriefingManifest';
import { BriefingManifest, type TBriefingManifest } from '@/lib/video-composer/briefing/manifestSchema';
import type {
  ComposerScene,
  AssemblyConfig,
  ComposerBriefing,
} from '@/types/video-composer';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  // Composer wiring (passed through to the apply hook)
  currentScenes: ComposerScene[];
  currentAssembly?: AssemblyConfig;
  currentBriefing: ComposerBriefing;
  onUpdateBriefing: (patch: Partial<ComposerBriefing>) => void;
  onUpdateScenes: (scenes: ComposerScene[]) => void;
  onApplyAssembly: (next: AssemblyConfig) => void;
}

type Step = 'paste' | 'review';

export default function BriefingImportDialog({
  open, onOpenChange,
  currentScenes, currentAssembly, currentBriefing,
  onUpdateBriefing, onUpdateScenes, onApplyAssembly,
}: Props) {
  const [step, setStep] = useState<Step>('paste');
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [manifest, setManifest] = useState<TBriefingManifest | null>(null);
  const [accept, setAccept] = useState({
    project: true, scenes: true, voice: true, captions: true, negativePrompt: true,
  });

  const { characters, locations } = useUnifiedMentionLibrary();
  const applyManifest = useApplyBriefingManifest();

  const charSimple = useMemo(
    () => characters.map((c: any) => ({ id: c.id, name: c.name, reference_image_url: c.reference_image_url })),
    [characters],
  );
  const locSimple = useMemo(
    () => locations.map((l: any) => ({ id: l.id, name: l.name, reference_image_url: l.reference_image_url })),
    [locations],
  );

  // ── Mention resolution preview ────────────────────────────────────────────
  const mentionPreview = useMemo(() => {
    if (!manifest) return { resolved: [] as string[], missing: [] as string[] };
    const seenChars = new Set<string>();
    const seenLocs = new Set<string>();
    for (const s of manifest.scenes ?? []) {
      for (const c of s.cast ?? []) seenChars.add(c.mentionKey);
      if (s.location) seenLocs.add(s.location.mentionKey);
    }
    const resolved: string[] = [];
    const missing: string[] = [];
    const tryResolve = (mention: string, pool: Array<{ name: string }>) => {
      const needle = mention.replace(/^@/, '').toLowerCase().replace(/[-_\s]/g, '');
      return pool.some((p) => {
        const n = (p.name ?? '').toLowerCase().replace(/[-_\s]/g, '');
        return n.includes(needle) || needle.includes(n);
      });
    };
    for (const m of seenChars) (tryResolve(m, charSimple) ? resolved : missing).push(`👤 ${m}`);
    for (const m of seenLocs) (tryResolve(m, locSimple) ? resolved : missing).push(`📍 ${m}`);
    return { resolved, missing };
  }, [manifest, charSimple, locSimple]);

  const reset = () => {
    setStep('paste');
    setText('');
    setManifest(null);
    setParsing(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleParse = async () => {
    const briefing = text.trim();
    if (briefing.length < 40) {
      toast({ title: 'Briefing zu kurz', description: 'Mindestens ein paar Sätze einfügen.', variant: 'destructive' });
      return;
    }
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-briefing', {
        body: { briefing },
      });
      if (error) throw error;
      const parsed = BriefingManifest.safeParse(data?.manifest);
      if (!parsed.success) {
        console.warn('[BriefingImportDialog] schema validation failed', parsed.error);
        throw new Error('Manifest-Validierung fehlgeschlagen');
      }
      setManifest(parsed.data);
      setStep('review');
    } catch (e: any) {
      const msg = e?.message ?? 'Parsing fehlgeschlagen';
      toast({
        title: 'Briefing konnte nicht gelesen werden',
        description: msg.includes('402') ? 'Keine AI-Credits mehr.'
          : msg.includes('429') ? 'Zu viele Anfragen — bitte kurz warten.' : msg,
        variant: 'destructive',
      });
    } finally {
      setParsing(false);
    }
  };

  const handleApply = () => {
    if (!manifest) return;
    const result = applyManifest({
      manifest, accept,
      characters: charSimple,
      locations: locSimple,
      currentScenes, currentAssembly, currentBriefing,
      onUpdateBriefing, onUpdateScenes, onApplyAssembly,
    });
    toast({
      title: 'Briefing übernommen',
      description: `${result.scenesApplied} Szenen · ${result.voiceApplied ? 'Voice ✓ · ' : ''}${result.captionsApplied ? 'Captions ✓' : ''}`,
    });
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-300" />
            Briefing importieren
          </DialogTitle>
          <DialogDescription>
            Füge ein vollständiges Briefing ein (Skript-Tabelle, Voice-Settings, Caption-Style, Negative Prompt) —
            die AI extrahiert daraus deterministisch alle Felder, die du dann pro Sektion übernimmst.
          </DialogDescription>
        </DialogHeader>

        {step === 'paste' && (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Beispiel:\n\n🎬 HOOK #1 — Founder Pain 15s DE\n• 3 Szenen × 5s, 9:16, 30fps, TikTok\n• VO: George (JBFqnCBsd6RMkjVDRZzb), eleven_multilingual_v2, stability 0.45\n• Szene 1 — Pain: Medium Close-Up, Eye Level, Static, Soft Window left, "Du sitzt sechs Stunden an einem einzigen Reel."\n• @founder-avatar in @home-office\n• Captions: Inter Bold 64px, Highlight #F5C76A, bottom 18% safe-zone\n…`}
              className="flex-1 min-h-[300px] font-mono text-xs"
            />
            <div className="text-xs text-muted-foreground">
              {text.length.toLocaleString()} Zeichen · ~{Math.ceil(text.length / 4).toLocaleString()} Tokens
              {text.length > 120_000 && <span className="text-destructive ml-2">— zu lang (max ~120k)</span>}
            </div>
          </div>
        )}

        {step === 'review' && manifest && (
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {/* Project */}
              {manifest.project && (
                <SectionCard
                  checked={accept.project}
                  onToggle={(v) => setAccept((a) => ({ ...a, project: v }))}
                  title="Projekt"
                >
                  <Row label="Name" value={manifest.project.name} />
                  <Row label="Format" value={manifest.project.aspectRatio} />
                  <Row label="FPS" value={manifest.project.fps?.toString()} />
                  <Row label="Gesamtdauer" value={manifest.project.totalDurationSec ? `${manifest.project.totalDurationSec}s` : undefined} />
                  <Row label="Plattformen" value={manifest.project.platforms?.join(', ')} />
                </SectionCard>
              )}

              {/* Scenes */}
              <SectionCard
                checked={accept.scenes}
                onToggle={(v) => setAccept((a) => ({ ...a, scenes: v }))}
                title={`Szenen (${manifest.scenes.length})`}
              >
                <div className="space-y-2">
                  {manifest.scenes.map((s) => (
                    <div key={s.index} className="rounded border border-border/40 p-2 text-xs space-y-1">
                      <div className="flex items-center gap-2 font-medium">
                        <Badge variant="outline" className="text-[10px]">S{String(s.index).padStart(2, '0')}</Badge>
                        <span>{s.label ?? '—'}</span>
                        <span className="ml-auto text-muted-foreground">{s.durationSec}s · {s.engine ?? 'auto'}</span>
                      </div>
                      {s.voiceover?.text && (
                        <div className="italic text-muted-foreground">"{s.voiceover.text.slice(0, 140)}{s.voiceover.text.length > 140 ? '…' : ''}"</div>
                      )}
                      {s.shotDirector && (
                        <div className="flex flex-wrap gap-1">
                          {s.shotDirector.framing && <Badge variant="secondary" className="text-[10px]">{s.shotDirector.framing}</Badge>}
                          {s.shotDirector.angle && <Badge variant="secondary" className="text-[10px]">{s.shotDirector.angle}</Badge>}
                          {s.shotDirector.movement && <Badge variant="secondary" className="text-[10px]">{s.shotDirector.movement}</Badge>}
                          {s.shotDirector.lighting && <Badge variant="secondary" className="text-[10px]">{s.shotDirector.lighting}</Badge>}
                        </div>
                      )}
                      {(s.cast?.length || s.location) && (
                        <div className="text-muted-foreground">
                          {s.cast?.map((c) => `👤 ${c.mentionKey}`).join(' · ')}
                          {s.location && ` · 📍 ${s.location.mentionKey}`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </SectionCard>

              {/* Voice */}
              {manifest.voice && (
                <SectionCard
                  checked={accept.voice}
                  onToggle={(v) => setAccept((a) => ({ ...a, voice: v }))}
                  title="Voiceover (ElevenLabs)"
                >
                  <Row label="Voice" value={manifest.voice.voiceName ?? manifest.voice.voiceId} />
                  <Row label="Model" value={manifest.voice.model} />
                  <Row label="Stability" value={manifest.voice.stability?.toString()} />
                  <Row label="Similarity Boost" value={manifest.voice.similarityBoost?.toString()} />
                  <Row label="Style" value={manifest.voice.style?.toString()} />
                  <Row label="Speaker Boost" value={manifest.voice.speakerBoost?.toString()} />
                  <Row label="Speed" value={manifest.voice.speed?.toString()} />
                </SectionCard>
              )}

              {/* Captions */}
              {manifest.captions && (
                <SectionCard
                  checked={accept.captions}
                  onToggle={(v) => setAccept((a) => ({ ...a, captions: v }))}
                  title="Captions / Subtitles"
                >
                  <Row label="Font" value={manifest.captions.font} />
                  <Row label="Größe" value={manifest.captions.sizePx ? `${manifest.captions.sizePx}px` : undefined} />
                  <Row label="Farbe" value={manifest.captions.color} />
                  <Row label="Highlight" value={manifest.captions.highlightColor} />
                  <Row label="Max Wörter/Cue" value={manifest.captions.maxWordsPerCue?.toString()} />
                  <Row label="Position" value={manifest.captions.position} />
                  <Row label="Safe-Zone" value={manifest.captions.safeZonePct ? `${manifest.captions.safeZonePct}%` : undefined} />
                  <Row label="Burn-In" value={manifest.captions.burnIn?.toString()} />
                  {!!manifest.captions.highlightWords?.length && (
                    <Row label="Highlight-Words" value={manifest.captions.highlightWords.join(', ')} />
                  )}
                </SectionCard>
              )}

              {/* Negative Prompt */}
              {manifest.negativePrompt && (
                <SectionCard
                  checked={accept.negativePrompt}
                  onToggle={(v) => setAccept((a) => ({ ...a, negativePrompt: v }))}
                  title="Negative Prompt"
                >
                  <div className="text-xs text-muted-foreground whitespace-pre-wrap">{manifest.negativePrompt}</div>
                </SectionCard>
              )}

              {/* Mention resolution */}
              {(mentionPreview.resolved.length > 0 || mentionPreview.missing.length > 0) && (
                <div className="rounded-lg border border-border/40 p-3 space-y-2 text-xs">
                  <div className="font-medium">Mentions</div>
                  {mentionPreview.resolved.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {mentionPreview.resolved.map((m) => (
                        <Badge key={m} variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400">
                          <CheckCircle2 className="h-3 w-3 mr-1" />{m}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {mentionPreview.missing.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-amber-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Nicht in deiner Library:</div>
                      <div className="flex flex-wrap gap-1">
                        {mentionPreview.missing.map((m) => (
                          <Badge key={m} variant="outline" className="text-[10px] border-amber-400/40 text-amber-300">{m}</Badge>
                        ))}
                      </div>
                      <div className="text-muted-foreground">
                        Diese Szenen werden ohne Cast/Location angelegt — du kannst sie nach dem Import in der Library anlegen und der Szene hinzufügen.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Unresolved */}
              {manifest.unresolved.length > 0 && (
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 space-y-1 text-xs">
                  <div className="font-medium text-amber-300 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Ungeklärte Felder
                  </div>
                  {manifest.unresolved.map((u, i) => (
                    <div key={i} className="text-muted-foreground">
                      <span className="font-mono text-amber-300/80">{u.field}</span>: {u.reason}
                      {u.suggestion && <span className="text-muted-foreground/60"> → {u.suggestion}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2">
          {step === 'paste' && (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)}>Abbrechen</Button>
              <Button onClick={handleParse} disabled={parsing || text.trim().length < 40 || text.length > 120_000}>
                {parsing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Parse…</> : <><Sparkles className="h-4 w-4 mr-2" />Briefing analysieren</>}
              </Button>
            </>
          )}
          {step === 'review' && (
            <>
              <Button variant="ghost" onClick={() => setStep('paste')}>Zurück</Button>
              <Button onClick={handleApply} className="bg-amber-400 text-black hover:bg-amber-300">
                <CheckCircle2 className="h-4 w-4 mr-2" />Alles übernehmen
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionCard({
  checked, onToggle, title, children,
}: { checked: boolean; onToggle: (v: boolean) => void; title: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg border p-3 transition-colors ${checked ? 'border-amber-300/40 bg-amber-300/[0.03]' : 'border-border/40 bg-muted/30 opacity-60'}`}>
      <label className="flex items-center gap-2 cursor-pointer mb-2">
        <Checkbox checked={checked} onCheckedChange={(v) => onToggle(!!v)} />
        <span className="text-sm font-medium">{title}</span>
      </label>
      <div className="ml-6 space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
