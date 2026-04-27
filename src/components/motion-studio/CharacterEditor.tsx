import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, X, Sparkles, User, Lightbulb, ShieldCheck, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import { useLegalConsent } from '@/hooks/useLegalConsent';
import LibraryUploadConsentDialog from '@/components/motion-studio/LibraryUploadConsentDialog';
import { VoicePicker } from '@/components/motion-studio/VoicePicker';
import CastingVibeGrid from '@/components/motion-studio/CastingVibeGrid';
import {
  EMPTY_CHARACTER_DRAFT,
  type CharacterDraft,
  type MotionStudioCharacter,
} from '@/types/motion-studio';

interface CharacterEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wenn gesetzt → Bearbeiten, sonst Neu-Anlegen. */
  character?: MotionStudioCharacter | null;
  onSaved?: (c: MotionStudioCharacter) => void;
}

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Editor für Charaktere der globalen Motion-Studio-Library.
 * Schritt 1: Daten erfassen + (optional) Reference-Image hochladen.
 */
export default function CharacterEditor({
  open,
  onOpenChange,
  character,
  onSaved,
}: CharacterEditorProps) {
  const { createCharacter, updateCharacter, uploadLibraryImage } = useMotionStudioLibrary();
  const { hasAccepted: hasConsent } = useLegalConsent('motion_studio_library_upload');
  const [draft, setDraft] = useState<CharacterDraft>(EMPTY_CHARACTER_DRAFT);
  const [tagInput, setTagInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [generatingSheet, setGeneratingSheet] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset bei jedem Öffnen
  useEffect(() => {
    if (open) {
      if (character) {
        setDraft({
          name: character.name,
          description: character.description,
          signature_items: character.signature_items,
          reference_image_url: character.reference_image_url,
          reference_image_seed: character.reference_image_seed,
          voice_id: character.voice_id,
          tags: character.tags,
          workspace_id: character.workspace_id ?? null,
        });
      } else {
        setDraft(EMPTY_CHARACTER_DRAFT);
      }
      setTagInput('');
      setPendingFile(null);
    }
  }, [open, character]);

  const performUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const tmpId = character?.id ?? `tmp-${Date.now()}`;
        const url = await uploadLibraryImage(file, 'character', tmpId);
        if (url) {
          setDraft((d) => ({ ...d, reference_image_url: url }));
          toast.success('Referenzbild hochgeladen');
        }
      } finally {
        setUploading(false);
      }
    },
    [character?.id, uploadLibraryImage]
  );

  const handleFileUpload = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!ACCEPTED.includes(file.type)) {
        toast.error('Bitte JPG, PNG oder WEBP wählen.');
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`Datei zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB · max 20 MB).`);
        return;
      }
      // Block E (Legal) — gate uploads behind persistent consent
      if (!hasConsent) {
        setPendingFile(file);
        setShowConsentDialog(true);
        return;
      }
      await performUpload(file);
    },
    [hasConsent, performUpload]
  );

  const handleConsentAccepted = useCallback(async () => {
    if (pendingFile) {
      const file = pendingFile;
      setPendingFile(null);
      await performUpload(file);
    }
  }, [pendingFile, performUpload]);

  /** Generate a 4-view photorealistic character sheet via edge function. */
  const handleGenerateSheet = useCallback(async () => {
    if (!draft.description.trim()) {
      toast.error('Bitte zuerst eine Beschreibung („Aussehen") eingeben');
      return;
    }
    setGeneratingSheet(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-character-sheet', {
        body: {
          mode: 'realistic',
          name: draft.name,
          description: draft.description,
          signatureItems: draft.signature_items,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.imageUrl) throw new Error('Kein Bild generiert');

      // Convert data: URL → File and upload to library bucket for persistence
      try {
        const blob = await (await fetch(data.imageUrl)).blob();
        const file = new File([blob], `sheet-${Date.now()}.png`, { type: 'image/png' });
        const tmpId = character?.id ?? `tmp-${Date.now()}`;
        const url = await uploadLibraryImage(file, 'character', tmpId);
        if (url) {
          setDraft((d) => ({
            ...d,
            reference_image_url: url,
            reference_image_seed: data.styleSeed ?? d.reference_image_seed,
          }));
          toast.success('Character Sheet generiert ✨');
          return;
        }
      } catch (uploadErr) {
        console.warn('[character-sheet] storage upload failed, using direct url', uploadErr);
      }

      // Fallback: use the data URL directly
      setDraft((d) => ({
        ...d,
        reference_image_url: data.imageUrl,
        reference_image_seed: data.styleSeed ?? d.reference_image_seed,
      }));
      toast.success('Character Sheet generiert ✨');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generierung fehlgeschlagen';
      toast.error(msg);
    } finally {
      setGeneratingSheet(false);
    }
  }, [draft.name, draft.description, draft.signature_items, character?.id, uploadLibraryImage]);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t || draft.tags.includes(t)) return;
    setDraft((d) => ({ ...d, tags: [...d.tags, t] }));
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setDraft((d) => ({ ...d, tags: d.tags.filter((t) => t !== tag) }));
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      toast.error('Name ist erforderlich');
      return;
    }
    if (!draft.description.trim()) {
      toast.error('Beschreibung ist erforderlich');
      return;
    }
    setSaving(true);
    try {
      if (character) {
        const ok = await updateCharacter(character.id, draft);
        if (ok) {
          onOpenChange(false);
          onSaved?.({ ...character, ...draft } as MotionStudioCharacter);
        }
      } else {
        const created = await createCharacter(draft);
        if (created) {
          onOpenChange(false);
          onSaved?.(created);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            {character ? 'Charakter bearbeiten' : 'Neuen Charakter anlegen'}
          </DialogTitle>
          <DialogDescription>
            Speichere wiederverwendbare Charaktere mit Reference-Image für visuelle Konsistenz
            über alle Motion-Studio-Projekte hinweg.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Pro-Tip Banner */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex gap-2.5">
              <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold">Sherlock-Holmes-Effekt</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Markante Kleidung & Objekte beschreibst du am besten auf Englisch — die KI
                  wiederholt diese viel zuverlässiger als Gesichter. Ein Reference-Image
                  verbessert die Konsistenz nochmal deutlich.
                </p>
              </div>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs">Name *</Label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="z. B. Richard Löwenherz"
              className="bg-background/60"
            />
          </div>

          {/* Reference Image */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Referenzbild (optional, sehr empfohlen)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={generatingSheet || !draft.description.trim()}
                onClick={handleGenerateSheet}
                className="h-7 text-[11px] gap-1.5 text-primary hover:text-primary hover:bg-primary/10"
                title={!draft.description.trim() ? 'Beschreibung erforderlich' : 'Foto-realistisches 4-View Sheet erzeugen'}
              >
                {generatingSheet ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Wand2 className="h-3 w-3" />
                )}
                Sheet generieren
              </Button>
            </div>

            {!hasConsent && !character && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
                <ShieldCheck className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Beim ersten Upload bestätigst du einmalig die Bildrechte (DSGVO &
                  Persönlichkeitsrechte). Danach läuft jeder weitere Upload ohne Rückfrage.
                </p>
              </div>
            )}

            {draft.reference_image_url ? (
              <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-background/50 p-3">
                <img
                  src={draft.reference_image_url}
                  alt={draft.name || 'Reference'}
                  className="w-24 h-24 rounded object-cover border border-border/40"
                />
                <div className="flex-1 space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    Wird als Image-to-Video-Referenz an Hailuo / Kling / Wan übergeben.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive hover:bg-destructive/10"
                    onClick={() => setDraft((d) => ({ ...d, reference_image_url: null }))}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Entfernen
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => !uploading && inputRef.current?.click()}
                className="relative border border-dashed border-border/60 rounded-md p-4 text-center transition cursor-pointer hover:border-primary/40 hover:bg-background/50"
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPTED.join(',')}
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files?.[0] ?? null)}
                />
                {uploading ? (
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Lädt hoch...
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-xs">
                    <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>JPG / PNG / WEBP · max 20 MB</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Casting · Multi-Vibe Grid (only available after first save) */}
          {character && (
            <div className="rounded-lg border border-border/40 bg-background/30 p-3">
              <CastingVibeGrid character={character} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Aussehen (Englisch empfohlen) *</Label>
            <Textarea
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="tall man late 30s, long auburn red hair, full beard, weathered face, blue eyes"
              rows={3}
              className="bg-background/60 resize-none text-sm"
            />
          </div>

          {/* Signature Items */}
          <div className="space-y-1.5">
            <Label className="text-xs">Markante Kleidung & Objekte (Englisch empfohlen)</Label>
            <Textarea
              value={draft.signature_items}
              onChange={(e) => setDraft((d) => ({ ...d, signature_items: e.target.value }))}
              placeholder="crimson tunic with golden lion crest, fur-lined cloak, golden crown with red rubies, ornate longsword"
              rows={3}
              className="bg-background/60 resize-none text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              Diese Details werden in JEDER Szene wiederholt — der Zuschauer erkennt den Charakter
              daran.
            </p>
          </div>

          {/* Voice */}
          <VoicePicker
            value={draft.voice_id}
            onChange={(voiceId) => setDraft((d) => ({ ...d, voice_id: voiceId }))}
            previewText={
              draft.description
                ? `Hello, I am ${draft.name || 'your character'}. ${draft.description.split(',')[0]}.`
                : undefined
            }
          />

          {/* Tags */}
          <div className="space-y-1.5">
            <Label className="text-xs">Tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="z. B. hero, narrator, villain"
                className="bg-background/60 text-sm"
              />
              <Button variant="outline" size="sm" onClick={addTag}>
                Hinzufügen
              </Button>
            </div>
            {draft.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {draft.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-[10px] gap-1 cursor-pointer hover:bg-destructive/20"
                    onClick={() => removeTag(tag)}
                  >
                    #{tag}
                    <X className="h-2.5 w-2.5" />
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {character ? 'Änderungen speichern' : 'Charakter anlegen'}
          </Button>
        </div>
      </DialogContent>

      <LibraryUploadConsentDialog
        open={showConsentDialog}
        onOpenChange={(o) => {
          setShowConsentDialog(o);
          if (!o) setPendingFile(null);
        }}
        onAccepted={handleConsentAccepted}
        context="character"
      />
    </Dialog>
  );
}
