import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Upload, Mic, Sparkles, ImageIcon, Loader2, AlertCircle, Check, User } from 'lucide-react';
import { useTalkingHead } from '@/hooks/useTalkingHead';
import { useCustomVoices } from '@/hooks/useCustomVoices';
import { useAccessibleCharacters } from '@/hooks/useAccessibleCharacters';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface TalkingHeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  sceneId?: string;
  /** Optional list of project scenes for the "attach to scene" picker. */
  availableScenes?: Array<{ id: string; label: string }>;
  onSuccess?: (result: { videoUrl: string | null; audioUrl: string; predictionId: string; sceneId?: string }) => void;
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
  availableScenes,
  onSuccess,
  presetAvatar,
}: TalkingHeadDialogProps) {
  const { generate, loading, estimateCost } = useTalkingHead();
  const { voices: customVoices } = useCustomVoices();
  const { data: accessibleCharacters = [] } = useAccessibleCharacters();

  const [imageUrl, setImageUrl] = useState('');
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [selectedAvatarName, setSelectedAvatarName] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [script, setScript] = useState('');
  const [voiceId, setVoiceId] = useState(PRESET_VOICES[0].id);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('9:16');
  const [resolution, setResolution] = useState<'480p' | '720p'>('720p');
  const [targetSceneId, setTargetSceneId] = useState<string>('__none__');

  // Apply Avatar preset on open
  useEffect(() => {
    if (open && presetAvatar) {
      if (presetAvatar.imageUrl) setImageUrl(presetAvatar.imageUrl);
      if (presetAvatar.voiceId) setVoiceId(presetAvatar.voiceId);
      if (presetAvatar.aspectRatio) setAspectRatio(presetAvatar.aspectRatio);
      if (presetAvatar.avatarName) setSelectedAvatarName(presetAvatar.avatarName);
    }
  }, [open, presetAvatar]);

  // Pre-select sceneId if passed
  useEffect(() => {
    if (open) {
      setTargetSceneId(sceneId ?? '__none__');
    }
  }, [open, sceneId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setImageUrl('');
      setScript('');
      setSelectedAvatarId(null);
      setSelectedAvatarName(null);
    }
  }, [open]);

  const pickAvatar = (c: { id: string; name: string; portrait_url: string | null; reference_image_url: string; default_voice_id: string | null }) => {
    const url = c.portrait_url || c.reference_image_url;
    if (!url) {
      toast({ title: 'Avatar ohne Bild', description: 'Dieser Avatar hat noch kein Portrait.', variant: 'destructive' });
      return;
    }
    setImageUrl(url);
    setSelectedAvatarId(c.id);
    setSelectedAvatarName(c.name);
    if (c.default_voice_id) setVoiceId(c.default_voice_id);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const path = `${user.id}/talking-head/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage
        .from('composer-uploads')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('composer-uploads').getPublicUrl(path);
      setImageUrl(publicUrl);
      setSelectedAvatarId(null);
      setSelectedAvatarName(null);
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

  const estimatedDurationSec = Math.max(3, Math.ceil(script.length / 18));
  const cost = estimateCost(estimatedDurationSec, true);

  const handleGenerate = async () => {
    if (!imageUrl) {
      toast({ title: 'Foto fehlt', description: 'Bitte wähle einen Avatar oder lade ein Foto hoch.', variant: 'destructive' });
      return;
    }
    if (!script.trim()) {
      toast({ title: 'Skript fehlt', description: 'Bitte schreibe einen Text.', variant: 'destructive' });
      return;
    }

    const customVoice = customVoices.find((v) => v.id === voiceId);
    const resolvedSceneId = targetSceneId === '__none__' ? undefined : targetSceneId;

    const result = await generate({
      sceneId: resolvedSceneId,
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
        sceneId: resolvedSceneId,
      });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            Talking-Head erstellen
          </DialogTitle>
          <DialogDescription>
            Wähle einen Avatar oder lade ein Foto hoch, schreibe ein Skript und wähle eine Stimme — der Charakter spricht den Text mit Lip-Sync.
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
            {/* Avatar grid */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  Deine Avatare
                </Label>
                {accessibleCharacters.length > 0 && (
                  <span className="text-xs text-muted-foreground">{accessibleCharacters.length} verfügbar</span>
                )}
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {accessibleCharacters.map((c) => {
                  const url = c.portrait_url || c.reference_image_url;
                  const selected = selectedAvatarId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pickAvatar(c)}
                      className={cn(
                        'group relative aspect-square rounded-lg overflow-hidden border-2 transition-all',
                        selected
                          ? 'border-primary ring-2 ring-primary/40 shadow-[0_0_18px_-4px_hsl(var(--primary)/0.6)]'
                          : 'border-border/40 hover:border-primary/60'
                      )}
                      title={c.name}
                    >
                      {url ? (
                        <img src={url} alt={c.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                          <User className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1.5 py-1">
                        <div className="text-[10px] font-medium text-white truncate">{c.name}</div>
                      </div>
                      {selected && (
                        <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  );
                })}

                {/* Upload card — always last, equal-weight */}
                <label
                  className={cn(
                    'aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors',
                    uploadingImage ? 'border-primary' : 'border-muted hover:border-primary/60'
                  )}
                >
                  {uploadingImage ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span className="text-[10px] text-muted-foreground">Lädt …</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-[10px] text-center px-1 text-muted-foreground leading-tight">
                        Eigenes Foto
                      </span>
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
              </div>

              {accessibleCharacters.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Noch keine Avatare gespeichert. Erstelle einen unter <span className="text-primary">/avatars</span> oder lade direkt ein Foto hoch.
                </p>
              )}
            </div>

            {/* Selected preview */}
            {imageUrl && (
              <div className="rounded-lg border border-border/40 p-3 bg-muted/30">
                <div className="flex items-start gap-3">
                  <img src={imageUrl} alt="Selected" className="w-20 h-20 rounded-md object-cover border border-border/40" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {selectedAvatarName || 'Eigenes Foto'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Bereit für Lip-Sync — wechsle in den Tab „Skript & Stimme".
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setImageUrl('');
                      setSelectedAvatarId(null);
                      setSelectedAvatarName(null);
                    }}
                  >
                    Wechseln
                  </Button>
                </div>
              </div>
            )}
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

            {/* Optional scene assignment */}
            {availableScenes && availableScenes.length > 0 && (
              <div>
                <Label>Ziel <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Select value={targetSceneId} onValueChange={setTargetSceneId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nur in Media Library</SelectItem>
                    <div className="px-2 py-1 mt-1 text-xs font-semibold text-muted-foreground">An Szene anhängen</div>
                    {availableScenes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {targetSceneId === '__none__'
                    ? 'Video erscheint nur in deiner Video-History.'
                    : 'Video wird automatisch der gewählten Szene als Clip zugewiesen.'}
                </p>
              </div>
            )}

            <Card className="p-3 bg-muted/30 border-border/40">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertCircle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  Geschätzte Kosten: <span className="text-primary font-semibold">€{cost.toFixed(2)}</span> ·
                  Generierung dauert 1–3 Minuten · Powered by HeyGen Photo-Avatar
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
