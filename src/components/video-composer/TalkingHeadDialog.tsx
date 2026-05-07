import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Upload, Mic, Sparkles, ImageIcon, Loader2, AlertCircle, Check, User, Library, Plus } from 'lucide-react';
import { useTalkingHead } from '@/hooks/useTalkingHead';
import { useCustomVoices } from '@/hooks/useCustomVoices';
import { useAccessibleCharacters } from '@/hooks/useAccessibleCharacters';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ComposerCharacter } from '@/types/video-composer';

interface TalkingHeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  sceneId?: string;
  /** Optional list of project scenes for the "attach to scene" picker. */
  availableScenes?: Array<{ id: string; label: string }>;
  /** Briefing cast — primary source of truth for talking-head characters. */
  briefingCharacters?: ComposerCharacter[];
  /** Called when the user adds a new character from inside the dialog. */
  onAddBriefingCharacter?: (character: ComposerCharacter) => void;
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

function makeCharId(name: string): string {
  return (
    name.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 32) || `char-${Date.now().toString(36)}`
  );
}

export default function TalkingHeadDialog({
  open,
  onOpenChange,
  projectId,
  sceneId,
  availableScenes,
  briefingCharacters,
  onAddBriefingCharacter,
  onSuccess,
  presetAvatar,
}: TalkingHeadDialogProps) {
  const { generate, loading, estimateCost } = useTalkingHead();
  const { voices: customVoices } = useCustomVoices();
  const { data: libraryAvatars = [] } = useAccessibleCharacters();

  const [imageUrl, setImageUrl] = useState('');
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [selectedCharName, setSelectedCharName] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [script, setScript] = useState('');
  const [voiceId, setVoiceId] = useState(PRESET_VOICES[0].id);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('9:16');
  const [resolution, setResolution] = useState<'480p' | '720p'>('720p');
  const [targetSceneId, setTargetSceneId] = useState<string>('__none__');

  // Inline "new character" form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [uploadingNewPhoto, setUploadingNewPhoto] = useState(false);

  // Library import picker
  const [showLibrary, setShowLibrary] = useState(false);

  const cast = briefingCharacters ?? [];
  const canAddToBriefing = typeof onAddBriefingCharacter === 'function';

  // Apply Avatar preset on open
  useEffect(() => {
    if (open && presetAvatar) {
      if (presetAvatar.imageUrl) setImageUrl(presetAvatar.imageUrl);
      if (presetAvatar.voiceId) setVoiceId(presetAvatar.voiceId);
      if (presetAvatar.aspectRatio) setAspectRatio(presetAvatar.aspectRatio);
      if (presetAvatar.avatarName) setSelectedCharName(presetAvatar.avatarName);
    }
  }, [open, presetAvatar]);

  // Pre-select sceneId
  useEffect(() => {
    if (open) setTargetSceneId(sceneId ?? '__none__');
  }, [open, sceneId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setImageUrl('');
      setScript('');
      setSelectedCharId(null);
      setSelectedCharName(null);
      setShowNewForm(false);
      setShowLibrary(false);
      setNewName('');
      setNewPhotoUrl('');
    }
  }, [open]);

  const pickCastCharacter = (c: ComposerCharacter) => {
    if (!c.referenceImageUrl) {
      toast({
        title: 'Charakter ohne Foto',
        description: `"${c.name}" hat noch kein Referenzbild. Lege eines im Briefing an oder importiere ihn aus der Avatar-Bibliothek.`,
        variant: 'destructive',
      });
      return;
    }
    setImageUrl(c.referenceImageUrl);
    setSelectedCharId(c.id);
    setSelectedCharName(c.name);
  };

  // Upload photo for the inline "neuer Charakter" form
  const uploadInlinePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingNewPhoto(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const path = `${user.id}/talking-head/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage
        .from('composer-uploads')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('composer-uploads').getPublicUrl(path);
      setNewPhotoUrl(publicUrl);
    } catch (err) {
      toast({
        title: 'Upload-Fehler',
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
        variant: 'destructive',
      });
    } finally {
      setUploadingNewPhoto(false);
    }
  };

  const commitNewCharacter = () => {
    if (!newName.trim()) {
      toast({ title: 'Name fehlt', description: 'Bitte gib dem Charakter einen Namen.', variant: 'destructive' });
      return;
    }
    if (!newPhotoUrl) {
      toast({ title: 'Foto fehlt', description: 'Bitte lade ein Foto hoch.', variant: 'destructive' });
      return;
    }
    if (!canAddToBriefing) return;

    const baseId = makeCharId(newName.trim());
    const uniqueId = cast.some((c) => c.id === baseId) ? `${baseId}-${Date.now().toString(36)}` : baseId;
    const character: ComposerCharacter = {
      id: uniqueId,
      name: newName.trim(),
      appearance: '',
      signatureItems: '',
      referenceImageUrl: newPhotoUrl,
    };
    onAddBriefingCharacter!(character);
    setImageUrl(newPhotoUrl);
    setSelectedCharId(uniqueId);
    setSelectedCharName(character.name);
    setShowNewForm(false);
    setNewName('');
    setNewPhotoUrl('');
    toast({
      title: 'Charakter hinzugefügt',
      description: `"${character.name}" ist jetzt Teil deines Briefing-Casts.`,
    });
  };

  const importFromLibrary = (av: { id: string; name: string; portrait_url: string | null; reference_image_url: string; default_voice_id: string | null }) => {
    if (!canAddToBriefing) return;
    const photo = av.portrait_url || av.reference_image_url;
    if (!photo) {
      toast({ title: 'Avatar ohne Bild', variant: 'destructive' });
      return;
    }
    // Re-use existing cast member if already linked
    const existing = cast.find((c) => c.brandCharacterId === av.id);
    if (existing) {
      pickCastCharacter(existing);
      setShowLibrary(false);
      return;
    }
    const baseId = makeCharId(av.name);
    const uniqueId = cast.some((c) => c.id === baseId) ? `${baseId}-${av.id.slice(0, 6)}` : baseId;
    const character: ComposerCharacter = {
      id: uniqueId,
      name: av.name,
      appearance: '',
      signatureItems: '',
      referenceImageUrl: photo,
      brandCharacterId: av.id,
    };
    onAddBriefingCharacter!(character);
    setImageUrl(photo);
    setSelectedCharId(uniqueId);
    setSelectedCharName(av.name);
    if (av.default_voice_id) setVoiceId(av.default_voice_id);
    setShowLibrary(false);
    toast({
      title: 'Avatar importiert',
      description: `"${av.name}" wurde in deinen Briefing-Cast übernommen.`,
    });
  };

  const estimatedDurationSec = Math.max(3, Math.ceil(script.length / 18));
  const cost = estimateCost(estimatedDurationSec, true);

  const handleGenerate = async () => {
    if (!imageUrl || !selectedCharId) {
      toast({
        title: 'Charakter fehlt',
        description: 'Bitte wähle einen Charakter aus deinem Briefing-Cast oder lege einen neuen an.',
        variant: 'destructive',
      });
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
      composerCharacterId: selectedCharId,
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

  const unlinkedLibraryAvatars = useMemo(
    () => libraryAvatars.filter((a) => !cast.some((c) => c.brandCharacterId === a.id)),
    [libraryAvatars, cast]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            Talking-Head erstellen
          </DialogTitle>
          <DialogDescription>
            Wähle einen Charakter aus deinem Briefing-Cast (oder lege einen neuen an), schreibe ein Skript und wähle eine Stimme — der Charakter spricht den Text mit Lip-Sync.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="character" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="character">
              <ImageIcon className="h-4 w-4 mr-2" /> Charakter
            </TabsTrigger>
            <TabsTrigger value="script" disabled={!imageUrl || !selectedCharId}>
              <Sparkles className="h-4 w-4 mr-2" /> Skript & Stimme
            </TabsTrigger>
            <TabsTrigger value="dialog" disabled={cast.length < 2}>
              <User className="h-4 w-4 mr-2" /> Dialog ({cast.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="character" className="space-y-4">
            {/* Briefing cast grid */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  Briefing-Cast
                </Label>
                {cast.length > 0 && (
                  <span className="text-xs text-muted-foreground">{cast.length} Charakter{cast.length === 1 ? '' : 'e'}</span>
                )}
              </div>

              {cast.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {cast.map((c) => {
                    const url = c.referenceImageUrl;
                    const selected = selectedCharId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => pickCastCharacter(c)}
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
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Dein Briefing-Cast ist noch leer. Lege unten einen neuen Charakter an oder importiere einen aus deiner Avatar-Bibliothek.
                </p>
              )}
            </div>

            {/* Action buttons */}
            {canAddToBriefing && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowNewForm((v) => !v); setShowLibrary(false); }}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Neuen Charakter ins Briefing aufnehmen
                </Button>
                {unlinkedLibraryAvatars.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setShowLibrary((v) => !v); setShowNewForm(false); }}
                  >
                    <Library className="h-4 w-4 mr-1.5" />
                    Aus Avatar-Bibliothek importieren ({unlinkedLibraryAvatars.length})
                  </Button>
                )}
              </div>
            )}

            {/* Inline new-character form */}
            {showNewForm && canAddToBriefing && (
              <Card className="p-3 space-y-3 border-primary/30 bg-primary/5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Plus className="h-4 w-4 text-primary" />
                  Neuer Charakter
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                  <div>
                    <Label htmlFor="new-char-name" className="text-xs">Name</Label>
                    <Input
                      id="new-char-name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="z. B. Sarah"
                      className="mt-1"
                    />
                  </div>
                  <label className={cn(
                    'h-16 w-16 rounded-md border-2 border-dashed flex items-center justify-center cursor-pointer overflow-hidden',
                    uploadingNewPhoto ? 'border-primary' : 'border-muted hover:border-primary/60'
                  )}>
                    {uploadingNewPhoto ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : newPhotoUrl ? (
                      <img src={newPhotoUrl} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={uploadInlinePhoto} disabled={uploadingNewPhoto} />
                  </label>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Wird auch in der Cast Consistency Map und in anderen Szenen verfügbar.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={commitNewCharacter} disabled={!newName.trim() || !newPhotoUrl}>
                    Hinzufügen & auswählen
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowNewForm(false)}>
                    Abbrechen
                  </Button>
                </div>
              </Card>
            )}

            {/* Library import picker */}
            {showLibrary && canAddToBriefing && (
              <Card className="p-3 space-y-2 border-border/40">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Library className="h-4 w-4 text-primary" />
                  Avatar-Bibliothek
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                  {unlinkedLibraryAvatars.map((av) => {
                    const url = av.portrait_url || av.reference_image_url;
                    return (
                      <button
                        key={av.id}
                        type="button"
                        onClick={() => importFromLibrary(av as any)}
                        className="aspect-square rounded-lg overflow-hidden border border-border/40 hover:border-primary/60 group relative"
                        title={`${av.name} importieren`}
                      >
                        {url ? (
                          <img src={url} alt={av.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted">
                            <User className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1.5 py-1">
                          <div className="text-[10px] font-medium text-white truncate">{av.name}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Selected preview */}
            {imageUrl && selectedCharId && (
              <div className="rounded-lg border border-border/40 p-3 bg-muted/30">
                <div className="flex items-start gap-3">
                  <img src={imageUrl} alt="Selected" className="w-20 h-20 rounded-md object-cover border border-border/40" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{selectedCharName || 'Charakter'}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Bereit für Lip-Sync — wechsle in den Tab „Skript & Stimme".
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setImageUrl('');
                      setSelectedCharId(null);
                      setSelectedCharName(null);
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
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                  {customVoices.length > 0 && (
                    <>
                      <div className="px-2 py-1 mt-1 text-xs font-semibold text-muted-foreground">Deine Voices</div>
                      {customVoices.filter((v) => v.is_active).map((v) => (
                        <SelectItem key={v.id} value={v.id}>⭐ {v.name}</SelectItem>
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
              disabled={loading || !imageUrl || !selectedCharId || !script.trim()}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generiere …</>
              ) : (
                <><Mic className="h-4 w-4 mr-2" /> Talking-Head generieren (€{cost.toFixed(2)})</>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="dialog" className="space-y-4">
            <DialogModeTab
              cast={cast}
              voices={[
                ...PRESET_VOICES.map((v) => ({ id: v.id, name: v.name, isCustom: false })),
                ...customVoices.filter((v) => v.is_active).map((v) => ({
                  id: v.id,
                  name: `⭐ ${v.name}`,
                  isCustom: true,
                  elevenlabsVoiceId: v.elevenlabs_voice_id,
                })),
              ]}
              aspectRatio={aspectRatio}
              setAspectRatio={setAspectRatio}
              resolution={resolution}
              setResolution={setResolution}
              projectId={projectId}
              availableScenes={availableScenes}
              targetSceneId={targetSceneId}
              setTargetSceneId={setTargetSceneId}
              onSuccess={(results) => {
                // Fire onSuccess for each generated block so parent can attach
                // them to scenes / refresh history.
                results.forEach((r) => onSuccess?.(r));
                onOpenChange(false);
              }}
              estimateCost={estimateCost}
              generate={generate}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Dialog Mode Tab — shot-reverse-shot multi-speaker generation.
// =====================================================================
//
// User writes a screenplay-style script:
//   SARAH: Hi! Welcome to our store.
//   MATTHEW: Thanks Sarah, what do you recommend?
//   SARAH: This new product is amazing.
//
// Each line is matched to a cast member (by speaker label = cast.name) and
// rendered as its own HeyGen Talking-Head clip. The clips can be attached
// to consecutive composer scenes (auto-spawn) or just dropped into history.

interface VoiceOption {
  id: string;
  name: string;
  isCustom: boolean;
  elevenlabsVoiceId?: string;
}

interface DialogBlock {
  speakerId: string;       // ComposerCharacter.id
  speakerName: string;
  text: string;
  voiceId: string;         // chosen voice for this speaker
}

interface DialogModeTabProps {
  cast: ComposerCharacter[];
  voices: VoiceOption[];
  aspectRatio: '16:9' | '9:16' | '1:1';
  setAspectRatio: (v: '16:9' | '9:16' | '1:1') => void;
  resolution: '480p' | '720p';
  setResolution: (v: '480p' | '720p') => void;
  projectId?: string;
  availableScenes?: Array<{ id: string; label: string }>;
  targetSceneId: string;
  setTargetSceneId: (v: string) => void;
  onSuccess: (
    results: Array<{
      videoUrl: string | null;
      audioUrl: string;
      predictionId: string;
      sceneId?: string;
    }>,
  ) => void;
  estimateCost: (durationSec: number, includesTTS: boolean) => number;
  generate: ReturnType<typeof useTalkingHead>['generate'];
}

function parseDialogScript(script: string, cast: ComposerCharacter[]): DialogBlock[] {
  const blocks: DialogBlock[] = [];
  const lines = script.split(/\r?\n/);
  // Match "NAME: text" or "NAME — text" at the start of a line.
  const re = /^\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _.-]{0,40})\s*[:—-]\s*(.+)$/;
  let current: DialogBlock | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      current = null;
      continue;
    }
    const m = re.exec(line);
    if (m) {
      const speakerName = m[1].trim();
      const text = m[2].trim();
      const c = cast.find(
        (x) => x.name.toLowerCase() === speakerName.toLowerCase() ||
               x.name.toLowerCase().split(/\s+/)[0] === speakerName.toLowerCase(),
      );
      if (c && c.referenceImageUrl) {
        current = {
          speakerId: c.id,
          speakerName: c.name,
          text,
          voiceId: '',
        };
        blocks.push(current);
        continue;
      }
    }
    // Continuation line → append to last block.
    if (current) current.text += ' ' + line;
  }
  return blocks;
}

function DialogModeTab({
  cast,
  voices,
  aspectRatio,
  setAspectRatio,
  resolution,
  setResolution,
  projectId,
  availableScenes,
  targetSceneId,
  setTargetSceneId,
  onSuccess,
  estimateCost,
  generate,
}: DialogModeTabProps) {
  const [script, setScript] = useState(
    cast.length >= 2
      ? `${cast[0].name}: Hi! Schön dich zu sehen.\n${cast[1].name}: Hi ${cast[0].name.split(' ')[0]}, was empfiehlst du?\n${cast[0].name}: Definitiv unser neues Produkt — du wirst es lieben.`
      : '',
  );
  const [voicePerSpeaker, setVoicePerSpeaker] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const blocks = useMemo(() => parseDialogScript(script, cast), [script, cast]);
  const speakers = useMemo(
    () => Array.from(new Set(blocks.map((b) => b.speakerId)))
      .map((id) => cast.find((c) => c.id === id)!)
      .filter(Boolean),
    [blocks, cast],
  );

  const totalChars = blocks.reduce((sum, b) => sum + b.text.length, 0);
  const estimatedDurationSec = Math.max(3, Math.ceil(totalChars / 18));
  const totalCost = blocks.length * estimateCost(Math.max(3, Math.ceil(totalChars / blocks.length / 18)), true);

  const handleGenerateDialog = async () => {
    if (blocks.length === 0) {
      toast({
        title: 'Kein gültiges Dialog-Skript',
        description: 'Format: "Sarah: Hallo!" — der Name muss exakt einem Cast-Charakter entsprechen.',
        variant: 'destructive',
      });
      return;
    }
    // Ensure each speaker has a voice picked.
    for (const sp of speakers) {
      if (!voicePerSpeaker[sp.id]) {
        toast({
          title: 'Stimme fehlt',
          description: `Wähle eine Stimme für "${sp.name}".`,
          variant: 'destructive',
        });
        return;
      }
    }
    setGenerating(true);
    setProgress({ current: 0, total: blocks.length });
    const results: Array<{
      videoUrl: string | null;
      audioUrl: string;
      predictionId: string;
      sceneId?: string;
    }> = [];
    try {
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const c = cast.find((x) => x.id === b.speakerId)!;
        const voiceMeta = voices.find((v) => v.id === voicePerSpeaker[b.speakerId])!;
        const r = await generate({
          projectId,
          imageUrl: c.referenceImageUrl!,
          text: b.text,
          voiceId: voiceMeta.isCustom ? undefined : voiceMeta.id,
          customVoiceId: voiceMeta.isCustom ? voiceMeta.elevenlabsVoiceId : undefined,
          aspectRatio,
          resolution,
          composerCharacterId: c.id,
          // Each block goes to a separate scene if the user picked one as anchor;
          // otherwise media-library only.
          sceneId: targetSceneId === '__none__' ? undefined : targetSceneId,
        });
        if (r?.success) {
          results.push({
            videoUrl: r.videoUrl,
            audioUrl: r.audioUrl,
            predictionId: r.predictionId,
            sceneId: targetSceneId === '__none__' ? undefined : targetSceneId,
          });
        }
        setProgress({ current: i + 1, total: blocks.length });
      }
      toast({
        title: 'Dialog gestartet',
        description: `${results.length}/${blocks.length} Talking-Heads werden generiert (1–3 Min pro Clip).`,
      });
      onSuccess(results);
    } catch (e) {
      console.error('[DialogMode] error', e);
      toast({
        title: 'Fehler',
        description: e instanceof Error ? e.message : 'Generierung fehlgeschlagen',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 bg-primary/5 border-primary/30">
        <div className="text-sm font-medium mb-1">Drehbuch-Modus für Multi-Speaker-Szenen</div>
        <p className="text-xs text-muted-foreground">
          Schreibe einen Dialog wie ein Drehbuch — pro Sprecher entsteht ein
          eigener Talking-Head-Clip. Im Director's Cut werden sie als
          Shot-Reverse-Shot zusammengeschnitten.
        </p>
      </Card>

      <div>
        <Label htmlFor="dialog-script">Skript</Label>
        <Textarea
          id="dialog-script"
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder={`${cast[0]?.name ?? 'Sarah'}: Hi!\n${cast[1]?.name ?? 'Matthew'}: Hi ${cast[0]?.name?.split(' ')[0] ?? 'Sarah'}!`}
          rows={7}
          className="mt-1 font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {blocks.length} Block{blocks.length === 1 ? '' : 'e'} erkannt · {speakers.length} Sprecher · ~{estimatedDurationSec}s gesamt
        </p>
      </div>

      {speakers.length > 0 && (
        <div className="space-y-2">
          <Label>Stimme pro Sprecher</Label>
          <div className="space-y-2">
            {speakers.map((sp) => (
              <div key={sp.id} className="flex items-center gap-3 p-2 rounded-md border border-border/40 bg-muted/20">
                <img src={sp.referenceImageUrl} alt={sp.name} className="h-10 w-10 rounded object-cover" />
                <div className="flex-1 text-sm font-medium">{sp.name}</div>
                <Select
                  value={voicePerSpeaker[sp.id] || ''}
                  onValueChange={(v) => setVoicePerSpeaker((prev) => ({ ...prev, [sp.id]: v }))}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Stimme wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {voices.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {availableScenes && availableScenes.length > 0 && (
        <div>
          <Label>Anker-Szene <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Select value={targetSceneId} onValueChange={setTargetSceneId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Nur in Media Library</SelectItem>
              {availableScenes.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Alle Dialog-Clips werden in der Reihenfolge an diese Szene angehängt.
            Wechsle danach in den Director's Cut für Shot-Reverse-Shot-Schnitt.
          </p>
        </div>
      )}

      <Card className="p-3 bg-muted/30 border-border/40">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertCircle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div>
            Geschätzte Gesamt-Kosten: <span className="text-primary font-semibold">€{totalCost.toFixed(2)}</span>{' '}
            ({blocks.length} × HeyGen Talking-Head) · Generierung läuft sequentiell
          </div>
        </div>
      </Card>

      {progress && (
        <Card className="p-3 bg-primary/5 border-primary/30">
          <div className="text-xs">
            Generiere Block {progress.current} / {progress.total} …
          </div>
          <div className="mt-2 h-1.5 bg-muted rounded overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </Card>
      )}

      <Button
        onClick={handleGenerateDialog}
        disabled={generating || blocks.length === 0 || speakers.some((s) => !voicePerSpeaker[s.id])}
        className="w-full"
        size="lg"
      >
        {generating ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generiere Dialog ({progress?.current ?? 0}/{progress?.total ?? blocks.length}) …</>
        ) : (
          <><Mic className="h-4 w-4 mr-2" /> Dialog generieren ({blocks.length} Clips · €{totalCost.toFixed(2)})</>
        )}
      </Button>
    </div>
  );
}
