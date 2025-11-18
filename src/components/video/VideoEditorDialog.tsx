import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState, useEffect } from 'react';
import { useVideoEditor } from '@/hooks/useVideoEditor';
import { Loader2, Sparkles } from 'lucide-react';
import type { VideoCreation } from '@/types/video';

interface VideoEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: VideoCreation;
}

const VOICE_OPTIONS = [
  { value: 'aria', label: 'Aria (Freundlich, weiblich)' },
  { value: 'roger', label: 'Roger (Professionell, männlich)' },
  { value: 'sarah', label: 'Sarah (Warm, weiblich)' },
  { value: 'laura', label: 'Laura (Energisch, weiblich)' },
  { value: 'charlie', label: 'Charlie (Entspannt, männlich)' },
  { value: 'george', label: 'George (Autoritativ, männlich)' },
  { value: 'callum', label: 'Callum (Jung, männlich)' },
  { value: 'lily', label: 'Lily (Sanft, weiblich)' },
  { value: 'liam', label: 'Liam (Neutral, männlich)' },
  { value: 'charlotte', label: 'Charlotte (Elegant, weiblich)' },
  { value: 'matilda', label: 'Matilda (Jugendlich, weiblich)' },
  { value: 'will', label: 'Will (Dynamisch, männlich)' },
  { value: 'jessica', label: 'Jessica (Klar, weiblich)' },
  { value: 'eric', label: 'Eric (Reif, männlich)' },
  { value: 'chris', label: 'Chris (Casual, männlich)' },
  { value: 'brian', label: 'Brian (Erfahren, männlich)' },
  { value: 'daniel', label: 'Daniel (Vertrauenswürdig, männlich)' },
  { value: 'emily', label: 'Emily (Professionell, weiblich)' },
  { value: 'michael', label: 'Michael (Stark, männlich)' },
  { value: 'river', label: 'River (Unisex, neutral)' }
];

export const VideoEditorDialog = ({ open, onOpenChange, video }: VideoEditorDialogProps) => {
  const { editVideo, loading } = useVideoEditor();
  
  // State für bearbeitbare Felder
  const [script, setScript] = useState('');
  const [voiceStyle, setVoiceStyle] = useState('aria');
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [enableSubtitles, setEnableSubtitles] = useState(false);
  const [quality, setQuality] = useState('1080p');

  // Lade Original-Customizations wenn Dialog öffnet
  useEffect(() => {
    if (open && video.customizations) {
      setScript(String(video.customizations.script_text || ''));
      setVoiceStyle(String(video.customizations.voice_style || 'aria'));
      setVoiceSpeed(Number(video.customizations.voice_speed || 1.0));
      setEnableSubtitles(Boolean(video.customizations.enable_subtitles));
      setQuality(video.quality || '1080p');
    }
  }, [open, video]);

  const handleSave = async () => {
    const customizations: Record<string, string | number | boolean> = {
      script_text: script,
      voice_style: voiceStyle,
      voice_speed: voiceSpeed,
      enable_subtitles: enableSubtitles,
      // Übernehme andere Original-Customizations
      ...video.customizations
    };

    const result = await editVideo({
      originalVideoId: video.id,
      customizations
    });

    if (result) {
      onOpenChange(false);
    }
  };

  const currentVersion = video.version_number || 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Video bearbeiten - Version {currentVersion + 1} erstellen
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="script" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="script">Skript</TabsTrigger>
            <TabsTrigger value="voice">Voice-Over</TabsTrigger>
            <TabsTrigger value="options">Optionen</TabsTrigger>
          </TabsList>

          <TabsContent value="script" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="script">Skript-Text</Label>
              <Textarea
                id="script"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Bearbeite den Skript-Text für dein Video..."
                className="min-h-[200px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Der Text wird für die KI-Analyse und Text-to-Speech verwendet.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="voice" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="voiceStyle">Stimme (ElevenLabs)</Label>
              <Select value={voiceStyle} onValueChange={setVoiceStyle}>
                <SelectTrigger id="voiceStyle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOICE_OPTIONS.map((voice) => (
                    <SelectItem key={voice.value} value={voice.value}>
                      {voice.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="voiceSpeed">
                Sprechgeschwindigkeit: {voiceSpeed.toFixed(1)}x
              </Label>
              <Input
                id="voiceSpeed"
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={voiceSpeed}
                onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))}
                className="cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0.5x (Langsam)</span>
                <span>1.0x (Normal)</span>
                <span>1.5x (Schnell)</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="options" className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="subtitles">Untertitel aktivieren</Label>
                <p className="text-sm text-muted-foreground">
                  Automatische Untertitel generieren
                </p>
              </div>
              <Switch
                id="subtitles"
                checked={enableSubtitles}
                onCheckedChange={setEnableSubtitles}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quality">Video-Qualität</Label>
              <Select value={quality} onValueChange={setQuality}>
                <SelectTrigger id="quality">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="720p">720p (HD)</SelectItem>
                  <SelectItem value="1080p">1080p (Full HD)</SelectItem>
                  <SelectItem value="4k">4K (Ultra HD)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>

        <div className="rounded-lg bg-muted p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Kosten für neue Version:</span>
            <span className="font-semibold text-foreground">5 Credits</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Das Original-Video bleibt erhalten. Version {currentVersion + 1} wird als neue Datei erstellt.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={loading || !script}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Wird erstellt...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Neue Version generieren
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
