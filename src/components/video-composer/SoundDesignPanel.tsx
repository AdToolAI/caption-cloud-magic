import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Loader2, Sparkles, Trash2, Volume2, Wand2, Wind, Zap, Music } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { ComposerScene } from '@/types/video-composer';
import { emitSceneAudioClipsChanged } from '@/hooks/useSceneAudioClips';

export interface SceneAudioClip {
  id: string;
  user_id: string;
  project_id: string | null;
  scene_id: string | null;
  kind: 'ambient' | 'sfx' | 'foley' | 'music' | 'voiceover';
  source: 'ai' | 'stock' | 'upload';
  prompt: string | null;
  url: string;
  start_offset: number;
  duration: number;
  volume: number;
  ducking_enabled: boolean;
  cost_credits: number;
  created_at: string;
}

interface Props {
  projectId: string | null | undefined;
  scenes: ComposerScene[];
  detectedMood?: string;
}

const kindIcon = {
  ambient: Wind,
  sfx: Zap,
  foley: Volume2,
  music: Music,
  voiceover: Volume2,
};

export default function SoundDesignPanel({ projectId, scenes, detectedMood }: Props) {
  const [clips, setClips] = useState<SceneAudioClip[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useMemo(() => (typeof Audio !== 'undefined' ? new Audio() : null), []);

  const load = async () => {
    if (!projectId) { setClips([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('scene_audio_clips')
      .select('*')
      .eq('project_id', projectId)
      .in('kind', ['ambient', 'sfx', 'foley'])
      .order('created_at', { ascending: false });
    if (error) console.error('[SoundDesign] load', error);
    setClips((data as SceneAudioClip[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  const generateMix = async () => {
    if (!projectId) {
      toast({ title: 'Projekt zuerst speichern', variant: 'destructive' });
      return;
    }
    if (!scenes.length) {
      toast({ title: 'Keine Szenen', description: 'Erstelle zuerst Szenen im Storyboard.', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('director-cut-sound-design', {
        body: {
          project_id: projectId,
          detected_mood: detectedMood ?? 'neutral',
          max_clips: Math.min(8, scenes.length * 2),
          scenes: scenes.map((s, i) => ({
            id: s.id,
            startTime: i * 5,
            endTime: (i + 1) * 5,
            description: s.aiPrompt || '',
            mood: detectedMood,
          })),
        },
      });
      if (error) throw error;
      toast({
        title: 'AI Sound Design erstellt',
        description: `${data?.generated_count ?? 0} Clips generiert${data?.failed_count ? `, ${data.failed_count} fehlgeschlagen` : ''}.`,
      });
      await load();
    } catch (e) {
      toast({ title: 'Fehler', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const togglePlay = (clip: SceneAudioClip) => {
    if (!audioRef) return;
    if (playing === clip.id) {
      audioRef.pause();
      setPlaying(null);
      return;
    }
    audioRef.src = clip.url;
    audioRef.volume = Math.max(0, Math.min(1, clip.volume));
    audioRef.play().then(() => setPlaying(clip.id)).catch(() => {});
    audioRef.onended = () => setPlaying(null);
  };

  const updateVolume = async (id: string, vol: number) => {
    setClips((cs) => cs.map((c) => c.id === id ? { ...c, volume: vol } : c));
    await supabase.from('scene_audio_clips').update({ volume: vol }).eq('id', id);
  };

  const removeClip = async (id: string) => {
    await supabase.from('scene_audio_clips').delete().eq('id', id);
    setClips((cs) => cs.filter((c) => c.id !== id));
  };

  const grouped = useMemo(() => ({
    ambient: clips.filter(c => c.kind === 'ambient'),
    sfx: clips.filter(c => c.kind === 'sfx' || c.kind === 'foley'),
  }), [clips]);

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wand2 className="h-5 w-5 text-primary" />
          AI Sound Designer
          <Badge variant="outline" className="ml-2">Ambient + SFX</Badge>
        </CardTitle>
        <Button onClick={generateMix} disabled={generating || !projectId} size="sm">
          {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Mix erstellen
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Generiert pro Szene Hintergrund-Atmo (Wind, Stadt, Café…) und punktgenaue SFX/Foley via ElevenLabs.
          Diese werden im finalen Render automatisch unter die Voiceover-Spur gemischt (Auto-Ducking, -14 LUFS).
        </p>

        {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

        {!loading && clips.length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Noch kein AI Sound Design generiert. Klick "Mix erstellen" um Atmo + SFX vorschlagen und generieren zu lassen.
          </div>
        )}

        {(['ambient', 'sfx'] as const).map((group) => grouped[group].length > 0 && (
          <div key={group} className="space-y-2">
            <h4 className="text-sm font-semibold capitalize text-muted-foreground">
              {group === 'ambient' ? 'Ambient / Atmosphere' : 'SFX & Foley'}
            </h4>
            {grouped[group].map((c) => {
              const Icon = kindIcon[c.kind] ?? Volume2;
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border bg-card/50 p-3">
                  <Button size="icon" variant="ghost" onClick={() => togglePlay(c)}>
                    <Icon className={`h-4 w-4 ${playing === c.id ? 'text-primary animate-pulse' : ''}`} />
                  </Button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{c.prompt || c.kind}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.duration.toFixed(1)}s · @{c.start_offset.toFixed(1)}s
                      {c.ducking_enabled && <span className="ml-2 text-primary">· Auto-Duck</span>}
                    </div>
                  </div>
                  <div className="w-32 flex items-center gap-2">
                    <Volume2 className="h-3 w-3 text-muted-foreground" />
                    <Slider
                      value={[c.volume * 100]}
                      onValueChange={(v) => updateVolume(c.id, v[0] / 100)}
                      max={100}
                      step={5}
                    />
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeClip(c.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
