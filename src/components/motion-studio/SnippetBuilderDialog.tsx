import { tx } from "@/lib/i18nText";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Save, Sparkles, Upload, X, Globe2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import {
  SCENE_SNIPPET_CATEGORIES,
  type SceneSnippet,
  type SceneSnippetDraft,
} from '@/types/motion-studio';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided → edit mode. When undefined → create mode. */
  snippet?: SceneSnippet | null;
  /** Optional auto-fill from active storyboard scene (create mode). */
  presetFromScene?: {
    name?: string;
    prompt?: string;
    cast_character_ids?: string[];
    location_id?: string | null;
    last_frame_url?: string | null;
    duration_seconds?: number | null;
  };
  onSaved?: (snippet: SceneSnippet) => void;
}

const MIN_NAME = 3;
const MIN_PROMPT = 20;

export default function SnippetBuilderDialog({
  open,
  onOpenChange,
  snippet,
  presetFromScene,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const { createSceneSnippet, updateSceneSnippet } = useMotionStudioLibrary();
  const isEdit = !!snippet;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [category, setCategory] = useState<string>('product_hero');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [duration, setDuration] = useState<number | ''>('');
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [lastFrameUrl, setLastFrameUrl] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize form whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    if (snippet) {
      setName(snippet.name);
      setDescription(snippet.description ?? '');
      setPrompt(snippet.prompt);
      setCategory((snippet.category as string) ?? 'product_hero');
      setTags(snippet.tags ?? []);
      setDuration(snippet.duration_seconds ?? '');
      setThumbnailUrl(snippet.thumbnail_url ?? snippet.last_frame_url ?? null);
      setLastFrameUrl(snippet.last_frame_url ?? null);
      setIsPublic(!!snippet.is_public);
    } else {
      setName(presetFromScene?.name ?? '');
      setDescription('');
      setPrompt(presetFromScene?.prompt ?? '');
      setCategory('product_hero');
      setTags([]);
      setDuration(presetFromScene?.duration_seconds ?? '');
      setThumbnailUrl(presetFromScene?.last_frame_url ?? null);
      setLastFrameUrl(presetFromScene?.last_frame_url ?? null);
      setIsPublic(false);
    }
    setTagDraft('');
  }, [open, snippet, presetFromScene]);

  const canPublish = useMemo(() => {
    return name.trim().length >= MIN_NAME && prompt.trim().length >= MIN_PROMPT && !!thumbnailUrl;
  }, [name, prompt, thumbnailUrl]);

  const handleAddTag = useCallback(() => {
    const t = tagDraft.trim().toLowerCase().replace(/\s+/g, '-');
    if (!t) return;
    if (tags.includes(t)) return;
    if (tags.length >= 8) {
      toast.error('Max. 8 Tags');
      return;
    }
    setTags((prev) => [...prev, t]);
    setTagDraft('');
  }, [tagDraft, tags]);

  const handleRemoveTag = useCallback((t: string) => {
    setTags((prev) => prev.filter((x) => x !== t));
  }, []);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!user) {
        toast.error(tx({ de: 'Bitte einloggen', en: 'Please log in', es: 'Por favor inicia sesión' }));
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast.error(tx({ de: 'Nur Bilder erlaubt', en: 'Only pictures allowed', es: 'Sólo se permiten fotografías' }));
        return;
      }
      setUploading(true);
      try {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${user.id}/snippets/${Date.now()}.${ext}`;
        const { error } = await supabase.storage
          .from('motion-studio-library')
          .upload(path, file, { upsert: true, cacheControl: '3600', contentType: file.type });
        if (error) throw error;
        const { data: signed } = await supabase.storage
          .from('motion-studio-library')
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        if (signed?.signedUrl) {
          setThumbnailUrl(signed.signedUrl);
          toast.success(tx({ de: "Vorschau gesetzt", en: "Preview set", es: "Vista previa establecida" }));
        }
      } catch (e: any) {
        toast.error(tx({ de: `Upload fehlgeschlagen: ${e.message ?? e}`, en: `Upload failed: ${e.message ?? e}`, es: `Error al cargar: ${e.message ?? e}` }));
      } finally {
        setUploading(false);
      }
    },
    [user],
  );

  const handleSave = useCallback(async () => {
    if (name.trim().length < MIN_NAME) {
      toast.error(`Name min. ${MIN_NAME} Zeichen`);
      return;
    }
    if (prompt.trim().length < MIN_PROMPT) {
      toast.error(`Prompt min. ${MIN_PROMPT} Zeichen`);
      return;
    }
    if (isPublic && !thumbnailUrl) {
      toast.error(tx({ de: 'Öffentliche Snippets benötigen ein Vorschaubild', en: 'Public snippets require a thumbnail', es: 'Los fragmentos públicos requieren una miniatura' }));
      return;
    }

    setSaving(true);
    try {
      const draft: SceneSnippetDraft & { is_public?: boolean } = {
        name: name.trim(),
        description: description.trim(),
        prompt: prompt.trim(),
        cast_character_ids: snippet?.cast_character_ids ?? presetFromScene?.cast_character_ids ?? [],
        location_id: snippet?.location_id ?? presetFromScene?.location_id ?? null,
        clip_url: snippet?.clip_url ?? null,
        last_frame_url: lastFrameUrl,
        reference_image_url: snippet?.reference_image_url ?? null,
        duration_seconds: typeof duration === 'number' ? duration : null,
        tags,
        workspace_id: snippet?.workspace_id ?? null,
        metadata: snippet?.metadata ?? {},
        category,
        thumbnail_url: thumbnailUrl,
        is_public: isPublic,
      };

      let saved: SceneSnippet | null = null;
      if (isEdit && snippet) {
        saved = await updateSceneSnippet(snippet.id, draft);
      } else {
        saved = await createSceneSnippet(draft);
        // If user toggled public on create, patch it (createSceneSnippet doesn't accept is_public in some shapes)
        if (saved && isPublic && !saved.is_public) {
          saved = (await updateSceneSnippet(saved.id, { is_public: true } as any)) ?? saved;
        }
      }
      if (saved) {
        onSaved?.(saved);
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  }, [
    name,
    prompt,
    description,
    duration,
    tags,
    category,
    thumbnailUrl,
    lastFrameUrl,
    isPublic,
    snippet,
    presetFromScene,
    isEdit,
    createSceneSnippet,
    updateSceneSnippet,
    onSaved,
    onOpenChange,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto bg-card border-border/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {isEdit ? tx({ de: "Snippet bearbeiten", en: "Edit snippet", es: "Editar fragmento" }) : tx({ de: "Neues Snippet", en: "New Snippet", es: "Nuevo fragmento" })}
          </DialogTitle>
          <DialogDescription>
            {tx({ de: "Speichere wiederverwendbare Szenen-Bausteine — optional teilbar mit der Community.", en: "Save reusable scene building blocks — optionally shareable with the community.", es: "Guarda bloques de construcción de escenas reutilizables — opcionalmente compartibles con la comunidad." })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Thumbnail */}
          <div>
            <Label className="text-xs">Vorschaubild</Label>
            <div className="mt-1 flex items-center gap-3">
              <div className="h-24 w-40 rounded-md border border-border/60 bg-background/60 overflow-hidden flex items-center justify-center">
                {thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbnailUrl} alt={tx({ de: "Vorschau", en: "Preview", es: "Vista previa" })} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] text-muted-foreground">{tx({ de: "Kein Bild", en: "No picture", es: "Sin imagen" })}</span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = '';
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="h-7 gap-1.5 text-[11px]"
                >
                  {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  {tx({ de: 'Hochladen', en: 'Upload', es: 'Subir' })}
                </Button>
                {thumbnailUrl && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setThumbnailUrl(null)}
                    className="h-7 text-[11px] text-muted-foreground"
                  >
                    {tx({ de: 'Entfernen', en: 'Remove', es: 'Quitar' })}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Name */}
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Hero Walk-In Tokyo"
              className="bg-background/60 mt-1"
            />
          </div>

          {/* Category */}
          <div>
            <Label className="text-xs">Kategorie</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-background/60 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCENE_SNIPPET_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.emoji} {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div>
            <Label className="text-xs">{tx({ de: "Beschreibung (optional)", en: "Description (optional)", es: "Descripción (opcional)" })}</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tx({ de: "Kurzbeschreibung für die Library-Karte", en: "Short description for the library card", es: "Breve descripción de la tarjeta de la biblioteca" })}
              className="bg-background/60 mt-1"
            />
          </div>

          {/* Prompt */}
          <div>
            <Label className="text-xs">Prompt</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder="Cinematic shot description, camera move, lighting, mood..."
              className="bg-background/60 mt-1 font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground mt-1">{prompt.trim().length}/{MIN_PROMPT}{tx({ de: "+ Zeichen", en: "+ Characters", es: "+ Caracteres" })}</p>
          </div>

          {/* Duration */}
          <div>
            <Label className="text-xs">{tx({ de: "Dauer (Sekunden, optional)", en: "Duration (seconds, optional)", es: "Duración (segundos, opcional)" })}</Label>
            <Input
              type="number"
              min={1}
              max={60}
              step={0.5}
              value={duration}
              onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : '')}
              className="bg-background/60 mt-1 max-w-[120px]"
            />
          </div>

          {/* Tags */}
          <div>
            <Label className="text-xs">Tags</Label>
            <div className="flex gap-1.5 mt-1">
              <Input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="cinematic, golden-hour, wide..."
                className="bg-background/60 h-8 text-sm"
              />
              <Button size="sm" variant="outline" onClick={handleAddTag} className="h-8 gap-1 text-[11px]">
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px] gap-1">
                    {t}
                    <button onClick={() => handleRemoveTag(t)} className="hover:text-destructive">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Public toggle */}
          <div className="rounded-md border border-border/60 bg-background/40 p-3 flex items-start gap-3">
            <Globe2 className="h-4 w-4 text-primary mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-semibold">{tx({ de: 'Mit Community teilen', en: 'Share with community', es: 'Compartir con la comunidad' })}</Label>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} disabled={!canPublish && !isPublic} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {tx({ de: "Öffentliche Snippets erscheinen in der Community-Library. Andere User können liken und klonen", en: "Public snippets appear in the community library. Other users can like and clone", es: "Los fragmentos públicos aparecen en la biblioteca de la comunidad. Otros usuarios pueden dar 'me gusta' y clonar" })}
                — Cast & Location bleiben privat.
              </p>
              {!canPublish && (
                <p className="text-[10px] text-amber-500 mt-1">
                  Voraussetzung: Name ≥ {MIN_NAME} Z{tx({ de: "Zeichen, Prompt ≥", en: "Characters, Prompt ≥", es: "Caracteres, Prompt ≥" })} {MIN_PROMPT} Z{tx({ de: "Zeichen, Vorschaubild gesetzt.", en: "Characters, thumbnail set.", es: "Caracteres, miniatura establecida." })}
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tx({ de: "Abbrechen", en: "Cancel", es: "Cancelar" })}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {isEdit ? tx({ de: 'Speichern', en: 'Save', es: 'Ahorrar' }) : 'Snippet anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
