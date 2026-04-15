import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRight, Mic, Music, Zap } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AssemblyConfig, ComposerScene } from '@/types/video-composer';

interface AudioTabProps {
  assemblyConfig: AssemblyConfig;
  onUpdateAssembly: (config: Partial<AssemblyConfig>) => void;
  scenes: ComposerScene[];
  onGoToExport: () => void;
}

const VOICES = [
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (M)', lang: 'DE' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (F)', lang: 'EN' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (M)', lang: 'EN' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily (F)', lang: 'EN' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger (M)', lang: 'EN' },
];

export default function AudioTab({ assemblyConfig, onUpdateAssembly, scenes, onGoToExport }: AudioTabProps) {
  const voiceover = assemblyConfig.voiceover;
  const music = assemblyConfig.music;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Voiceover */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Mic className="h-4 w-4 text-primary" /> Voiceover
            </CardTitle>
            <Switch
              checked={!!voiceover?.enabled}
              onCheckedChange={(checked) =>
                onUpdateAssembly({
                  voiceover: checked
                    ? { enabled: true, voiceId: VOICES[0].id, voiceName: VOICES[0].name, script: '' }
                    : null,
                })
              }
            />
          </div>
        </CardHeader>
        {voiceover?.enabled && (
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Stimme</Label>
              <Select
                value={voiceover.voiceId}
                onValueChange={(v) => {
                  const voice = VOICES.find((vo) => vo.id === v);
                  onUpdateAssembly({
                    voiceover: { ...voiceover, voiceId: v, voiceName: voice?.name || '' },
                  });
                }}
              >
                <SelectTrigger className="bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOICES.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} ({v.lang})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Script</Label>
              <Textarea
                value={voiceover.script}
                onChange={(e) =>
                  onUpdateAssembly({ voiceover: { ...voiceover, script: e.target.value } })
                }
                placeholder="Der Voiceover-Text für dein Video..."
                rows={4}
                className="bg-background/50 resize-none text-sm"
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Background Music */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Music className="h-4 w-4 text-primary" /> Hintergrundmusik
            </CardTitle>
            <Switch
              checked={!!music?.enabled}
              onCheckedChange={(checked) =>
                onUpdateAssembly({
                  music: checked
                    ? { enabled: true, trackUrl: '', trackName: '', genre: 'electronic', mood: 'energetic', volume: 30, isUpload: false }
                    : null,
                })
              }
            />
          </div>
        </CardHeader>
        {music?.enabled && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Genre</Label>
                <Select
                  value={music.genre}
                  onValueChange={(v) => onUpdateAssembly({ music: { ...music, genre: v } })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['electronic', 'cinematic', 'corporate', 'pop', 'ambient', 'hip-hop'].map((g) => (
                      <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Stimmung</Label>
                <Select
                  value={music.mood}
                  onValueChange={(v) => onUpdateAssembly({ music: { ...music, mood: v } })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['energetic', 'calm', 'dramatic', 'happy', 'dark', 'inspiring'].map((m) => (
                      <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Lautstärke</Label>
                <span className="text-xs text-muted-foreground">{music.volume}%</span>
              </div>
              <Slider
                value={[music.volume]}
                onValueChange={([v]) => onUpdateAssembly({ music: { ...music, volume: v } })}
                min={0}
                max={100}
                step={5}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Beat Sync */}
      <Card className="border-border/40 bg-card/80">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Beat-Sync</p>
                <p className="text-[10px] text-muted-foreground">Schnitte automatisch auf Beats ausrichten</p>
              </div>
            </div>
            <Switch
              checked={assemblyConfig.beatSync}
              onCheckedChange={(v) => onUpdateAssembly({ beatSync: v })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onGoToExport} className="gap-2">
          Weiter zum Export <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
