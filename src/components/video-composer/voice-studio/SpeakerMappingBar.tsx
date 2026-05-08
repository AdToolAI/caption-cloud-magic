import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Mic, Play, Sparkles, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { parseSpeakerScript, uniqueSpeakers } from '@/lib/voice-studio/parseSpeakerScript';
import { isHumeVoiceId } from '@/lib/voice-studio/humeVoices';
import { useHumeVoices } from '@/hooks/useHumeVoices';
import type { VoiceMeta } from '@/lib/elevenlabs-voices';
import type { MultiSpeakerVoiceCfg } from '@/types/video-composer';

interface SpeakerMappingBarProps {
  script: string;
  elevenLabsVoices: VoiceMeta[];
  speakerMap: Record<string, MultiSpeakerVoiceCfg>;
  onChange: (next: Record<string, MultiSpeakerVoiceCfg>) => void;
}

const PREVIEW_TEXT = 'Hi, this is a quick voice preview. The quick brown fox jumps over the lazy dog.';

export function SpeakerMappingBar({
  script,
  elevenLabsVoices,
  speakerMap,
  onChange,
}: SpeakerMappingBarProps) {
  const speakers = useMemo(() => uniqueSpeakers(parseSpeakerScript(script)), [script]);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const { voices: humeVoices, isLoading: humeLoading } = useHumeVoices();

  // Auto-seed missing speakers with sensible defaults (ElevenLabs Aria + alternates).
  useEffect(() => {
    if (speakers.length === 0) return;
    const next = { ...speakerMap };
    let changed = false;
    const elDefaults = ['9BWtsMINqrJLrRacOk9x', 'JBFqnCBsd6RMkjVDRZzb', 'cgSgspJ2msm6clMCkdW9', 'XB0fDUnXU5powFXDhCwa'];
    speakers.forEach((s, idx) => {
      if (!next[s.speakerId]) {
        const fallback = elDefaults[idx % elDefaults.length];
        next[s.speakerId] = {
          engine: 'elevenlabs',
          voiceId: fallback,
          voiceName: elevenLabsVoices.find((v) => v.id === fallback)?.name ?? 'Voice',
          stability: 0.5,
          similarityBoost: 0.75,
          style: 0,
          useSpeakerBoost: true,
          speed: 1.0,
        };
        changed = true;
      }
    });
    if (changed) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakers.map((s) => s.speakerId).join('|'), elevenLabsVoices.length]);

  const setSpeakerCfg = (speakerId: string, patch: Partial<MultiSpeakerVoiceCfg>) => {
    onChange({ ...speakerMap, [speakerId]: { ...(speakerMap[speakerId] || {} as any), ...patch } });
  };

  const handleEngineChange = (speakerId: string, engine: 'elevenlabs' | 'hume') => {
    if (engine === 'hume') {
      const fallback = humeVoices[0];
      setSpeakerCfg(speakerId, {
        engine: 'hume',
        voiceId: fallback.name,
        voiceName: fallback.label,
        provider: fallback.provider,
        speed: 1.0,
      });
    } else {
      const fallback = elevenLabsVoices[0];
      setSpeakerCfg(speakerId, {
        engine: 'elevenlabs',
        voiceId: fallback?.id ?? '9BWtsMINqrJLrRacOk9x',
        voiceName: fallback?.name ?? 'Aria',
        stability: 0.5,
        similarityBoost: 0.75,
        style: 0,
        useSpeakerBoost: true,
        speed: 1.0,
      });
    }
  };

  const handlePreview = async (speakerId: string) => {
    const cfg = speakerMap[speakerId];
    if (!cfg) return;
    setPreviewing(speakerId);
    try {
      const fn = cfg.engine === 'hume' ? 'preview-voice-hume' : 'preview-voice';
      const body = cfg.engine === 'hume'
        ? { text: PREVIEW_TEXT, voiceName: cfg.voiceId, provider: cfg.provider || 'HUME_AI' }
        : { text: PREVIEW_TEXT, voiceId: cfg.voiceId };
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error) throw error;
      if (!data?.audioContent) throw new Error('No audio returned');
      const audio = new Audio(`data:audio/mpeg;base64,${data.audioContent}`);
      await audio.play();
    } catch (e: any) {
      toast({ title: 'Preview fehlgeschlagen', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setPreviewing(null);
    }
  };

  if (speakers.length === 0) {
    return null;
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          Multi-Speaker Modus
          <Badge variant="secondary" className="ml-2">{speakers.length} Stimmen</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Erkannt aus deinem Skript. Wähle pro Sprecher Engine + Stimme. Mische ElevenLabs (Library) mit Hume Octave (emotional, oft natürlicher).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {speakers.map((s) => {
          const cfg = speakerMap[s.speakerId];
          const isHume = cfg?.engine === 'hume';
          return (
            <div
              key={s.speakerId}
              className="grid grid-cols-1 md:grid-cols-[110px_120px_1fr_auto] gap-2 items-center rounded-lg border bg-background/40 p-2"
            >
              <div className="flex items-center gap-2">
                <Mic className="h-4 w-4 text-primary/70" />
                <span className="font-medium truncate">{s.speakerName}</span>
              </div>

              <Select
                value={cfg?.engine ?? 'elevenlabs'}
                onValueChange={(v) => handleEngineChange(s.speakerId, v as any)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="elevenlabs">
                    <div className="flex items-center gap-2">
                      <span>ElevenLabs</span>
                      <Badge variant="outline" className="text-[10px]">Library</Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="hume">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-3 w-3" />
                      <span>Hume Octave</span>
                      <Badge variant="outline" className="text-[10px]">Emotional</Badge>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={cfg?.voiceId ?? ''}
                onValueChange={(voiceId) => {
                  if (isHume) {
                    const v = humeVoices.find((x) => x.name === voiceId);
                    setSpeakerCfg(s.speakerId, {
                      voiceId,
                      voiceName: v?.label ?? voiceId,
                      provider: v?.provider ?? 'HUME_AI',
                    });
                  } else {
                    const v = elevenLabsVoices.find((x) => x.id === voiceId);
                    setSpeakerCfg(s.speakerId, { voiceId, voiceName: v?.name ?? voiceId });
                  }
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Stimme wählen" />
                </SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  {isHume
                    ? humeVoices.map((v) => (
                        <SelectItem key={v.id} value={v.name}>
                          <div className="flex flex-col">
                            <span className="font-medium">{v.label}</span>
                            <span className="text-[11px] text-muted-foreground">{v.description}</span>
                          </div>
                        </SelectItem>
                      ))
                    : elevenLabsVoices.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          <div className="flex items-center gap-2">
                            <span>{v.name}</span>
                            {v.gender && (
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {v.gender}
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>

              <Button
                size="sm"
                variant="outline"
                onClick={() => handlePreview(s.speakerId)}
                disabled={!cfg?.voiceId || previewing === s.speakerId}
              >
                {previewing === s.speakerId ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
