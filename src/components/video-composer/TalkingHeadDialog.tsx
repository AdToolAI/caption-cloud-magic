import { tx } from "@/lib/i18nText";
import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VoiceSlot } from '@/components/voices/VoiceSlot';
import { Card } from '@/components/ui/card';
import { Upload, Mic, Sparkles, ImageIcon, Loader2, AlertCircle, Check, User, Library, Plus } from 'lucide-react';
import { useTalkingHead } from '@/hooks/useTalkingHead';
import { useCustomVoices } from '@/hooks/useCustomVoices';
import { useAccessibleCharacters } from '@/hooks/useAccessibleCharacters';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ComposerCharacter } from '@/types/video-composer';
import { parseDialogScript as sharedParseDialogScript } from '@/lib/talking-head/parseDialogScript';

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
  const safe = typeof name === 'string' ? name : '';
  return (
    safe.toLowerCase()
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
  const [voiceName, setVoiceName] = useState<string>(PRESET_VOICES[0].name);
  const [voiceLanguage, setVoiceLanguage] = useState<string>('de');
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
        title: tx({ de: 'Charakter ohne Foto', en: 'Character without photo', es: 'Personaje sin foto' }),
        description: tx({ de: `"${c.name}" hat noch kein Referenzbild. Lege eines im Briefing an oder importiere ihn aus der Avatar-Bibliothek.`, en: `"${c.name}" does not have a reference image yet. Create one in the briefing or import them from the avatar library.`, es: `"${c.name}" aún no tiene una imagen de referencia. Crea una en el briefing o impórtala de la biblioteca de avatares.` }),
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
        title: tx({ de: 'Upload-Fehler', en: 'Upload error', es: 'Error de carga' }),
        description: err instanceof Error ? err.message : tx({ de: 'Unbekannter Fehler', en: 'Unknown error', es: 'Error desconocido' }),
        variant: 'destructive',
      });
    } finally {
      setUploadingNewPhoto(false);
    }
  };

  const commitNewCharacter = () => {
    if (!newName.trim()) {
      toast({ title: tx({ de: 'Name fehlt', en: 'Name missing', es: 'Falta el nombre' }), description: tx({ de: 'Bitte gib dem Charakter einen Namen.', en: 'Please give the character a name.', es: 'Por favor, dale un nombre al personaje.' }), variant: 'destructive' });
      return;
    }
    if (!newPhotoUrl) {
      toast({ title: tx({ de: 'Foto fehlt', en: 'Photo missing', es: 'Falta la foto' }), description: tx({ de: 'Bitte lade ein Foto hoch.', en: 'Please upload a photo.', es: 'Por favor sube una foto.' }), variant: 'destructive' });
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
      title: tx({ de: "Charakter hinzugefügt", en: "Character added", es: "Personaje añadido" }),
      description: tx({ de: `"${character.name}" ist jetzt Teil deines Briefing-Casts.`, en: `"${character.name}" is now part of your briefing cast.`, es: `"${character.name}" ahora forma parte de tu elenco del briefing.` }),
    });
  };

  const importFromLibrary = (av: { id: string; name: string; portrait_url: string | null; reference_image_url: string; default_voice_id: string | null }) => {
    if (!canAddToBriefing) return;
    const photo = av.portrait_url || av.reference_image_url;
    if (!photo) {
      toast({ title: tx({ de: 'Avatar ohne Bild', en: 'Avatar without image', es: 'Avatar sin imagen' }), variant: 'destructive' });
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
      title: tx({ de: "Avatar importiert", en: "Avatar imported", es: "Avatar importado" }),
      description: tx({ de: `"${av.name}" wurde in deinen Briefing-Cast übernommen.`, en: `"${av.name}" has been added to your briefing cast.`, es: `"${av.name}" se ha añadido a tu elenco del briefing.` }),
    });
  };

  const estimatedDurationSec = Math.max(3, Math.ceil(script.length / 18));
  const cost = estimateCost(estimatedDurationSec, true);

  const handleGenerate = async () => {
    if (!imageUrl || !selectedCharId) {
      toast({
        title: tx({ de: 'Charakter fehlt', en: 'Character missing', es: 'Falta el personaje' }),
        description: tx({ de: 'Bitte wähle einen Charakter aus deinem Briefing-Cast oder lege einen neuen an.', en: 'Please select a character from your briefing cast or create a new one.', es: 'Por favor, selecciona un personaje de tu elenco de briefing o crea uno nuevo.' }),
        variant: 'destructive',
      });
      return;
    }
    if (!script.trim()) {
      toast({ title: tx({ de: 'Skript fehlt', en: 'Script missing', es: 'Falta el guion' }), description: tx({ de: 'Bitte schreibe einen Text.', en: 'Please write some text.', es: 'Por favor, escribe un texto.' }), variant: 'destructive' });
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
            {tx({ de: "Talking-Head erstellen", en: "Create talking head", es: "Crear cabeza parlante" })}
          </DialogTitle>
          <DialogDescription>
            {tx({ de: "Wähle einen Charakter aus deinem Briefing-Cast (oder lege einen neuen an), schreibe ein Skript und wähle eine Stimme — der Charakter spricht den Text mit Lip-Sync.", en: "Choose a character from your briefing cast (or create a new one), write a script and pick a voice — the character speaks the text with lip-sync.", es: "Elige un personaje de tu elenco de briefing (o crea uno nuevo), escribe un guion y elige una voz — el personaje dirá el texto con sincronización labial." })}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="character" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="character">
              <ImageIcon className="h-4 w-4 mr-2" /> {tx({ de: "Charakter", en: "Character", es: "Personaje" })}
            </TabsTrigger>
            <TabsTrigger value="script" disabled={!imageUrl || !selectedCharId}>
              <Sparkles className="h-4 w-4 mr-2" /> {tx({ de: "Skript & Stimme", en: "Script & voice", es: "Guion y voz" })}
            </TabsTrigger>
            <TabsTrigger value="dialog" disabled={cast.length < 2}>
              <User className="h-4 w-4 mr-2" /> {tx({ de: "Dialog", en: "Dialogue", es: "Diálogo" })} ({cast.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="character" className="space-y-4">
            {/* Briefing cast grid */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  {tx({ de: "Briefing-Cast", en: "Briefing cast", es: "Elenco del briefing" })}
                </Label>
                {cast.length > 0 && (
                  <span className="text-xs text-muted-foreground">{cast.length} {tx({ de: 'Charakter' + (cast.length === 1 ? '' : 'e'), en: cast.length === 1 ? 'character' : 'characters', es: cast.length === 1 ? 'personaje' : 'personajes' })}</span>
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
                  {tx({ de: "Dein Briefing-Cast ist noch leer. Lege unten einen neuen Charakter an oder importiere einen aus deiner Avatar-Bibliothek.", en: "Your briefing cast is still empty. Create a new character below or import one from your avatar library.", es: "Tu elenco del briefing aún está vacío. Crea un nuevo personaje abajo o impórtalo de tu biblioteca de avatares." })}
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
                  {tx({ de: "Neuen Charakter ins Briefing aufnehmen", en: "Add new character to briefing", es: "Añadir nuevo personaje al briefing" })}
                </Button>
                {unlinkedLibraryAvatars.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setShowLibrary((v) => !v); setShowNewForm(false); }}
                  >
                    <Library className="h-4 w-4 mr-1.5" />
                    {tx({ de: "Aus Avatar-Bibliothek importieren", en: "Import from avatar library", es: "Importar de la biblioteca de avatares" })} ({unlinkedLibraryAvatars.length})
                  </Button>
                )}
              </div>
            )}

            {/* Inline new-character form */}
            {showNewForm && canAddToBriefing && (
              <Card className="p-3 space-y-3 border-primary/30 bg-primary/5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Plus className="h-4 w-4 text-primary" />
                  {tx({ de: "Neuer Charakter", en: "New character", es: "Nuevo personaje" })}
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                  <div>
                    <Label htmlFor="new-char-name" className="text-xs">{tx({ de: "Name", en: "Name", es: "Nombre" })}</Label>
                    <Input
                      id="new-char-name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={tx({ de: "z. B. Sarah", en: "e.g. Sarah", es: "p. ej. Sarah" })}
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
                  {tx({ de: "Wird auch in der Cast Consistency Map und in anderen Szenen verfügbar.", en: "Also available in the cast consistency map and other scenes.", es: "También disponible en el mapa de consistencia del elenco y otras escenas." })}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={commitNewCharacter} disabled={!newName.trim() || !newPhotoUrl}>
                    {tx({ de: "Hinzufügen & auswählen", en: "Add & select", es: "Añadir y seleccionar" })}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowNewForm(false)}>
                    {tx({ de: "Abbrechen", en: "Cancel", es: "Cancelar" })}
                  </Button>
                </div>
              </Card>
            )}

            {/* Library import picker */}
            {showLibrary && canAddToBriefing && (
              <Card className="p-3 space-y-2 border-border/40">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Library className="h-4 w-4 text-primary" />
                  {tx({ de: "Avatar-Bibliothek", en: "Avatar library", es: "Biblioteca de avatares" })}
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
                        title={`${av.name} — ${tx({ de: "importieren", en: "import", es: "importar" })}`}
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
                    <div className="text-sm font-medium">{selectedCharName || tx({ de: "Charakter", en: "Character", es: "Personaje" })}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {tx({ de: 'Bereit für Lip-Sync — wechsle in den Tab „Skript & Stimme".', en: 'Ready for lip-sync — switch to the "Script & voice" tab.', es: 'Listo para sincronización labial — cambia a la pestaña "Guion y voz".' })}
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
                    {tx({ de: "Wechseln", en: "Change", es: "Cambiar" })}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="script" className="space-y-4">
            <div>
              <Label htmlFor="script">{tx({ de: "Skript", en: "Script", es: "Guion" })}</Label>
              <Textarea
                id="script"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder={tx({ de: "Hi, ich bin dein neuer KI-Avatar. Hier kommt mein Text...", en: "Hi, I am your new AI avatar. Here comes my text...", es: "Hola, soy tu nuevo avatar de IA. Aquí viene mi texto..." })}
                rows={5}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {script.length} {tx({ de: "Zeichen", en: "characters", es: "caracteres" })} • ~{estimatedDurationSec}s {tx({ de: "Dauer", en: "duration", es: "duración" })}
              </p>
            </div>

            <div>
              <Label>{tx({ de: "Stimme", en: "Voice", es: "Voz" })}</Label>
              <VoiceSlot
                voiceId={voiceId}
                voiceName={voiceName}
                language={voiceLanguage}
                category="characters"
                onChange={({ voiceId: id, voiceName: name, language: lang }) => {
                  setVoiceId(id);
                  setVoiceName(name);
                  setVoiceLanguage(lang);
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{tx({ de: "Format", en: "Format", es: "Formato" })}</Label>
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
                <Label>{tx({ de: "Qualität", en: "Quality", es: "Calidad" })}</Label>
                <Select value={resolution} onValueChange={(v: '480p' | '720p') => setResolution(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="720p">720p HD</SelectItem>
                    <SelectItem value="480p">480p ({tx({ de: "günstiger", en: "cheaper", es: "más económico" })})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {availableScenes && availableScenes.length > 0 && (
              <div>
                <Label>{tx({ de: "Ziel", en: "Target", es: "Objetivo" })} <span className="text-muted-foreground font-normal">({tx({ de: "optional", en: "optional", es: "opcional" })})</span></Label>
                <Select value={targetSceneId} onValueChange={setTargetSceneId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{tx({ de: "Nur in Media Library", en: "Media library only", es: "Solo en la biblioteca de medios" })}</SelectItem>
                    <div className="px-2 py-1 mt-1 text-xs font-semibold text-muted-foreground">{tx({ de: "An Szene anhängen", en: "Attach to scene", es: "Adjuntar a la escena" })}</div>
                    {availableScenes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {targetSceneId === '__none__'
                    ? tx({ de: tx({ de: "Video erscheint nur in deiner Video-History.", en: "The video only appears in your video history.", es: "El vídeo solo aparece en tu historial de vídeos." }), en: 'Video will only appear in your video history.', es: 'El video solo aparecerá en tu historial de videos.' })
                    : tx({ de: 'Video wird automatisch der gewählten Szene als Clip zugewiesen.', en: 'Video is automatically assigned to the selected scene as a clip.', es: 'El video se asigna automáticamente a la escena seleccionada como un clip.' })}
                </p>
              </div>
            )}

            <Card className="p-3 bg-muted/30 border-border/40">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertCircle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  {tx({ de: "Geschätzte Kosten: ", en: "Estimated cost:", es: "Costo estimado:" })} <span className="text-primary font-semibold">€{cost.toFixed(2)}</span> ·
                  {tx({ de: "Generierung dauert 1–3 Minuten · Powered by HeyGen Photo-Avatar", en: "Generation takes 1-3 minutes · Powered by HeyGen Photo-Avatar", es: "La generación tarda de 1 a 3 minutos · Con tecnología de HeyGen Photo-Avatar" })}
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
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {tx({ de: 'Generiere …', en: 'Generating …', es: 'Generando …' })}</>
              ) : (
                <><Mic className="h-4 w-4 mr-2" /> {tx({ de: 'Talking-Head generieren', en: 'Generate talking head', es: 'Generar cabeza parlante' })} (€{cost.toFixed(2)})</>
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
  return sharedParseDialogScript(script, cast).map((b) => ({
    speakerId: b.speakerId,
    speakerName: b.speakerName,
    text: b.text,
    voiceId: '',
  }));
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
      ? tx({ de: `${cast[0].name}: Hi! Schön dich zu sehen.\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\n${cast[1].name}: Hi ${cast[0].name.split(' ')[0]}, was empfiehlst du?\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\n${cast[0].name}: Definitiv unser neues Produkt — du wirst es lieben.`, en: `${cast[0].name}: Hi! Nice to see you.\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\n${cast[1].name}: Hi ${cast[0].name.split(' ')[0]}, what do you recommend you?\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\n${cast[0].name}: Definitely our new product — you'll love it.`, es: `${cast[0].name}: ¡Hola! Encantado de verte.\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\n${cast[1].name}: Hola ${cast[0].name.split(' ')[0]}, ¿qué me recomiendas?\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\n${cast[0].name}: Definitivamente nuestro Nuevo producto: te encantará.` })
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
        title: tx({ de: 'Kein gültiges Dialog-Skript', en: 'Not a valid dialog script', es: 'No es un script de diálogo válido' }),
        description: tx({ de: 'Format: "Sarah: Hallo!" — der Name muss exakt einem Cast-Charakter entsprechen.', en: 'Format: "Sarah: Hello!" — the name must exactly match a cast character.', es: 'Formato: "Sarah: ¡Hola!" — el nombre debe coincidir exactamente con un personaje del elenco.' }),
        variant: 'destructive',
      });
      return;
    }
    // Ensure each speaker has a voice picked.
    for (const sp of speakers) {
      if (!voicePerSpeaker[sp.id]) {
        toast({
          title: tx({ de: 'Stimme fehlt', en: 'Voice missing', es: 'Falta la voz' }),
          description: tx({ de: `Wähle eine Stimme für "${sp.name}".`, en: `Choose a voice for "${sp.name}".`, es: `Elige una voz para "${sp.name}".` }),
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
        title: tx({ de: 'Dialog gestartet', en: 'Dialogue started', es: 'Se inició el diálogo' }),
        description: tx({ de: `${results.length}/${blocks.length} Talking-Heads werden generiert (1–3 Min pro Clip).`, en: `${results.length}/${blocks.length} Talking heads are generated (1-3 min per clip).`, es: `${results.length}/${blocks.length} Se generan cabezas parlantes (1-3 minutos por clip).` }),
      });
      onSuccess(results);
    } catch (e) {
      console.error('[DialogMode] error', e);
      toast({
        title: tx({ de: 'Fehler', en: 'Mistake', es: 'Error' }),
        description: e instanceof Error ? e.message : tx({ de: 'Generierung fehlgeschlagen', en: 'Generation failed', es: 'Error de generación' }),
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
        <div className="text-sm font-medium mb-1">{tx({ de: "Drehbuch-Modus für Multi-Speaker-Szenen", en: "Script mode for multi-speaker scenes", es: "Modo guion para escenas con varios oradores" })}</div>
        <p className="text-xs text-muted-foreground">
          {tx({ de: "Schreibe einen Dialog wie ein Drehbuch — pro Sprecher entsteht ein\n          eigener Talking-Head-Clip. Im Director's Cut werden sie als\n          Shot-Reverse-Shot zusammengeschnitten.", en: "Write a dialog like a script — a separate talking-head clip is created for each speaker.\n          In Director's Cut, they are edited together as shot-reverse-shot.", es: "Escribe un diálogo como un guion — se crea un clip de talking-head separado para cada orador.\n          En Director's Cut, se editan juntos como shot-reverse-shot." })}
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
          {tx({ de: `${blocks.length} Block${blocks.length === 1 ? '' : 'e'} erkannt · ${speakers.length} Sprecher · ~${estimatedDurationSec}s gesamt`, en: `${blocks.length} block${blocks.length === 1 ? '' : 's'} detected · ${speakers.length} speaker${speakers.length === 1 ? '' : 's'} · ~${estimatedDurationSec}s total`, es: `${blocks.length} bloque${blocks.length === 1 ? '' : 's'} detectado${blocks.length === 1 ? '' : 's'} · ${speakers.length} hablante${speakers.length === 1 ? '' : 's'} · ~${estimatedDurationSec}s en total` })}
        </p>
      </div>

      {speakers.length > 0 && (
        <div className="space-y-2">
          <Label>{tx({ de: "Stimme pro Sprecher", en: "Voice per speaker", es: "Voz por orador" })}</Label>
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
                    <SelectValue placeholder={tx({ de: "Stimme wählen", en: "Select voice", es: "Seleccionar voz" })} />
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
          <Label>{tx({ de: "Qualität", en: "Quality", es: "Calidad" })}</Label>
          <Select value={resolution} onValueChange={(v: '480p' | '720p') => setResolution(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="720p">720p HD</SelectItem>
              <SelectItem value="480p">480p ({tx({ de: "günstiger", en: "cheaper", es: "más económico" })})</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {availableScenes && availableScenes.length > 0 && (
        <div>
          <Label>{tx({ de: "Anker-Szene", en: "Anchor scene", es: "Escena ancla" })} <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Select value={targetSceneId} onValueChange={setTargetSceneId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{tx({ de: "Nur in Media Library", en: "Media library only", es: "Solo en la biblioteca de medios" })}</SelectItem>
              {availableScenes.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            {tx({ de: "Alle Dialog-Clips werden in der Reihenfolge an diese Szene angehängt.", en: "All dialog clips are appended to this scene in order.", es: "Todos los clips de diálogo se añaden a esta escena en orden." })}{' '}
            {tx({ de: "Wechsle danach in den Director's Cut für Shot-Reverse-Shot-Schnitt.", en: "Then switch to Director's Cut for shot-reverse-shot editing.", es: "Luego cambia a Director's Cut para la edición de plano contraplano." })}
          </p>
        </div>
      )}

      <Card className="p-3 bg-muted/30 border-border/40">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertCircle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div>
            {tx({ de: 'Geschätzte Gesamt-Kosten: ', en: 'Estimated total cost:', es: 'Coste total estimado:' })} <span className="text-primary font-semibold">€{totalCost.toFixed(2)}</span>{' '}
            ({blocks.length} {tx({ de: "× HeyGen Talking-Head) · Generierung läuft sequentiell", en: "× HeyGen talking head) · generation runs sequentially", es: "× HeyGen talking head) · la generación es secuencial" })}
          </div>
        </div>
      </Card>

      {progress && (
        <Card className="p-3 bg-primary/5 border-primary/30">
          <div className="text-xs">
            {tx({ de: `Generiere Block ${progress.current} / ${progress.total} …`, en: `Generating block ${progress.current} / ${progress.total} …`, es: `Generando bloque ${progress.current} / ${progress.total} …` })}
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
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {tx({ de: `Generiere Dialog (${progress?.current ?? 0}/${progress?.total ?? blocks.length}) …`, en: `Generating dialogue (${progress?.current ?? 0}/${progress?.total ?? blocks.length}) …`, es: `Generando diálogo (${progress?.current ?? 0}/${progress?.total ?? blocks.length}) …` })}</>
        ) : (
          <><Mic className="h-4 w-4 mr-2" /> {tx({ de: "Dialog generieren (", en: "Generate dialog (", es: "Generar diálogo (" })}{blocks.length} Clips · €{totalCost.toFixed(2)})</>
        )}
      </Button>
    </div>
  );
}
