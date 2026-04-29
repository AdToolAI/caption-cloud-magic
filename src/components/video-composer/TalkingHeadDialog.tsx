import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Upload, Mic, Sparkles, ImageIcon, Loader2, AlertCircle } from 'lucide-react';
import { useTalkingHead } from '@/hooks/useTalkingHead';
import { useCustomVoices } from '@/hooks/useCustomVoices';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface TalkingHeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  sceneId?: string;
  onSuccess?: (result: { videoUrl: string | null; audioUrl: string; predictionId: string }) => void;
  /**
   * Optional preset from Avatar Library — pre-fills image, voice and aspect ratio
   * so the user only has to write the script.
   */
  presetAvatar?: {
    imageUrl?: string;
    voiceId?: string;
    aspectRatio?: '16:9' | '9:16' | '1:1';
    avatarName?: string;
  };
}

const PRESET_VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (warm female)' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (deep male)' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam (young male)' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda (clear female)' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica (energetic)' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (narrator)' },
];

export default function TalkingHeadDialog({
  open,
  onOpenChange,
  projectId,
  sceneId,
  onSuccess,
}: TalkingHeadDialogProps) {
  const { generate, loading, estimateCost } = useTalkingHead();
  const { voices: customVoices } = useCustomVoices();

  const [imageUrl, setImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [script, setScript] = useState('');
  const [voiceId, setVoiceId] = useState(PRESET_VOICES[0].id);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('9:16');
  const [resolution, setResolution] = useState<'480p' | '720p'>('720p');

  // Reset on close
  useEffect(() => {
    if (!open) {
      setImageUrl('');
      setScript('');
    }
  }, [open]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const path = `${user.id}/talking-head/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage
        .from('library')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('library').getPublicUrl(path);
      setImageUrl(publicUrl);
      toast({ title: 'Foto hochgeladen', description: 'Charakter-Foto bereit.' });
    } catch (err) {
      toast({
        title: 'Upload-Fehler',
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
        variant: 'destructive',
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const estimatedDurationSec = Math.max(3, Math.ceil(script.length / 18)); // rough estimate
  const cost = estimateCost(estimatedDurationSec, true);

  const handleGenerate = async () => {
    if (!imageUrl) {
      toast({ title: 'Foto fehlt', description: 'Bitte lade ein Charakter-Foto hoch.', variant: 'destructive' });
      return;
    }
    if (!script.trim()) {
      toast({ title: 'Skript fehlt', description: 'Bitte schreibe einen Text.', variant: 'destructive' });
      return;
    }

    const customVoice = customVoices.find((v) => v.id === voiceId);
    const result = await generate({
      sceneId,
      projectId,
      imageUrl,
      text: script,
      voiceId: customVoice ? undefined : voiceId,
      customVoiceId: customVoice?.elevenlabs_voice_id,
      aspectRatio,
      resolution,
    });

    if (result?.success) {
      onSuccess?.({
        videoUrl: result.videoUrl,
        audioUrl: result.audioUrl,
        predictionId: result.predictionId,
      });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            Talking-Head erstellen
          </DialogTitle>
          <DialogDescription>
            Lade ein Charakter-Foto hoch, schreibe ein Skript und wähle eine Stimme — der Charakter spricht den Text mit Lip-Sync.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="character" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="character">
              <ImageIcon className="h-4 w-4 mr-2" /> Charakter
            </TabsTrigger>
            <TabsTrigger value="script" disabled={!imageUrl}>
              <Sparkles className="h-4 w-4 mr-2" /> Skript & Stimme
            </TabsTrigger>
          </TabsList>

          <TabsContent value="character" className="space-y-4">
            <div>
              <Label>Charakter-Foto</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Frontaufnahme des Gesichts liefert die besten Ergebnisse. Mindestens 512×512 px.
              </p>
              {imageUrl ? (
                <div className="relative">
                  <img src={imageUrl} alt="Character" className="w-full max-h-64 object-contain rounded-lg border border-border/40" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => setImageUrl('')}
                  >
                    Entfernen
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 p-8 border-2 border-dashed border-muted rounded-lg cursor-pointer hover:border-primary transition-colors">
                  {uploadingImage ? (
                    <>
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="text-sm">Lädt hoch …</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm">Foto auswählen</span>
                      <span className="text-xs text-muted-foreground">PNG, JPG bis 10 MB</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                  />
                </label>
              )}
            </div>
          </TabsContent>

          <TabsContent value="script" className="space-y-4">
            <div>
              <Label htmlFor="script">Skript</Label>
              <Textarea
                id="script"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Hi, ich bin dein neuer KI-Avatar. Hier kommt mein Text..."
                rows={5}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {script.length} Zeichen • ~{estimatedDurationSec}s Dauer
              </p>
            </div>

            <div>
              <Label>Stimme</Label>
              <Select value={voiceId} onValueChange={setVoiceId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Presets</div>
                  {PRESET_VOICES.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                  {customVoices.length > 0 && (
                    <>
                      <div className="px-2 py-1 mt-1 text-xs font-semibold text-muted-foreground">Deine Voices</div>
                      {customVoices.filter((v) => v.is_active).map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          ⭐ {v.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Format</Label>
                <Select value={aspectRatio} onValueChange={(v: '16:9' | '9:16' | '1:1') => setAspectRatio(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="9:16">9:16 (TikTok / Reels)</SelectItem>
                    <SelectItem value="16:9">16:9 (YouTube)</SelectItem>
                    <SelectItem value="1:1">1:1 (Instagram)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Qualität</Label>
                <Select value={resolution} onValueChange={(v: '480p' | '720p') => setResolution(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="720p">720p HD</SelectItem>
                    <SelectItem value="480p">480p (günstiger)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Card className="p-3 bg-muted/30 border-border/40">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertCircle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  Geschätzte Kosten: <span className="text-primary font-semibold">€{cost.toFixed(2)}</span> ·
                  Generierung dauert 1–3 Minuten · Powered by Hedra Character-3
                </div>
              </div>
            </Card>

            <Button
              onClick={handleGenerate}
              disabled={loading || !imageUrl || !script.trim()}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generiere …
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4 mr-2" />
                  Talking-Head generieren (€{cost.toFixed(2)})
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
