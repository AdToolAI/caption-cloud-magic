import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Loader2, Play, RefreshCw, Sliders } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { parseSpeakerScript, type SpeakerSegment } from '@/lib/voice-studio/parseSpeakerScript';
import type { MultiSpeakerVoiceCfg } from '@/types/video-composer';

interface SegmentOverride {
  stability?: number;
  style?: number;
  speed?: number;
}

interface SegmentCardListProps {
  script: string;
  speakerMap: Record<string, MultiSpeakerVoiceCfg>;
  overrides: Record<number, SegmentOverride>;
  onOverridesChange: (next: Record<number, SegmentOverride>) => void;
}

const SPEAKER_HUES: Record<string, string> = {};
function hueFor(speakerId: string): string {
  if (!SPEAKER_HUES[speakerId]) {
    const palette = ['hsl(var(--primary))', 'hsl(280 70% 60%)', 'hsl(160 60% 50%)', 'hsl(20 80% 60%)', 'hsl(45 90% 55%)'];
    const idx = Object.keys(SPEAKER_HUES).length % palette.length;
    SPEAKER_HUES[speakerId] = palette[idx];
  }
  return SPEAKER_HUES[speakerId];
}

export function SegmentCardList({ script, speakerMap, overrides, onOverridesChange }: SegmentCardListProps) {
  const segments = useMemo<SpeakerSegment[]>(() => parseSpeakerScript(script), [script]);
  const [reRollingIdx, setReRollingIdx] = useState<number | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<number, string>>({});

  if (segments.length === 0) return null;

  const setOverride = (idx: number, patch: Partial<SegmentOverride>) => {
    onOverridesChange({ ...overrides, [idx]: { ...(overrides[idx] || {}), ...patch } });
  };

  const reRollSegment = async (idx: number, seg: SpeakerSegment) => {
    const cfg = speakerMap[seg.speakerId];
    if (!cfg) {
      toast({ title: 'Keine Stimme zugeordnet', description: seg.speakerName, variant: 'destructive' });
      return;
    }
    setReRollingIdx(idx);
    try {
      const ov = overrides[idx] || {};
      const merged: MultiSpeakerVoiceCfg = {
        ...cfg,
        stability: ov.stability ?? cfg.stability,
        style: ov.style ?? cfg.style,
        speed: ov.speed ?? cfg.speed,
      };
      const { data, error } = await supabase.functions.invoke('generate-multi-speaker-vo', {
        body: {
          segments: [{ speakerId: seg.speakerId, text: seg.text, tags: seg.tags }],
          speakerMap: { [seg.speakerId]: merged },
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Re-Roll fehlgeschlagen');
      const audioBase64 = data.segments?.[0]?.audioBase64;
      if (!audioBase64) throw new Error('Kein Audio zurück');
      const url = `data:audio/mpeg;base64,${audioBase64}`;
      setPreviewUrls((prev) => ({ ...prev, [idx]: url }));
      try {
        const audio = new Audio(url);
        await audio.play();
      } catch { /* user-gesture ignored */ }
    } catch (e: any) {
      toast({ title: 'Re-Roll fehlgeschlagen', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setReRollingIdx(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Sätze ({segments.length})</Label>
        <span className="text-[10px] text-muted-foreground">Re-Roll testet einzelne Sätze ohne den Master neu zu rendern.</span>
      </div>
      <div className="space-y-1.5">
        {segments.map((seg, idx) => {
          const cfg = speakerMap[seg.speakerId];
          const isHume = cfg?.engine === 'hume';
          const ov = overrides[idx] || {};
          const speed = ov.speed ?? cfg?.speed ?? 1.0;
          const stability = ov.stability ?? cfg?.stability ?? 0.5;
          const style = ov.style ?? cfg?.style ?? 0;
          return (
            <Card key={idx} className="border-border/40 bg-background/40">
              <Collapsible>
                <div className="flex items-start gap-2 p-2">
                  <div
                    className="w-1 self-stretch rounded-full"
                    style={{ background: hueFor(seg.speakerId) }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                        {seg.speakerName}
                      </Badge>
                      {cfg?.voiceName && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          {isHume ? '🎭 ' : ''}{cfg.voiceName}
                        </span>
                      )}
                      {seg.tags?.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[9px] h-4 px-1 capitalize">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs leading-relaxed text-foreground/90 line-clamp-2">{seg.text}</p>
                    {previewUrls[idx] && (
                      <audio
                        src={previewUrls[idx]}
                        controls
                        className="h-7 w-full mt-1.5"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => reRollSegment(idx, seg)}
                      disabled={reRollingIdx === idx}
                    >
                      {reRollingIdx === idx ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                    </Button>
                    <CollapsibleTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-7 px-2">
                        <Sliders className="h-3 w-3" />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </div>
                <CollapsibleContent className="px-2 pb-2 space-y-2 border-t border-border/30 pt-2">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <Label className="text-[10px]">Speed</Label>
                      <span className="text-[10px] text-muted-foreground">{speed.toFixed(2)}x</span>
                    </div>
                    <Slider
                      value={[speed]}
                      min={0.7}
                      max={1.3}
                      step={0.05}
                      onValueChange={([v]) => setOverride(idx, { speed: v })}
                    />
                  </div>
                  {!isHume && (
                    <>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <Label className="text-[10px]">Stability</Label>
                          <span className="text-[10px] text-muted-foreground">{stability.toFixed(2)}</span>
                        </div>
                        <Slider
                          value={[stability]}
                          min={0}
                          max={1}
                          step={0.05}
                          onValueChange={([v]) => setOverride(idx, { stability: v })}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <Label className="text-[10px]">Style</Label>
                          <span className="text-[10px] text-muted-foreground">{style.toFixed(2)}</span>
                        </div>
                        <Slider
                          value={[style]}
                          min={0}
                          max={1}
                          step={0.05}
                          onValueChange={([v]) => setOverride(idx, { style: v })}
                        />
                      </div>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-[11px]"
                    onClick={() => reRollSegment(idx, seg)}
                    disabled={reRollingIdx === idx}
                  >
                    {reRollingIdx === idx ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3 mr-1" />
                    )}
                    Mit diesen Settings testen
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
