import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, X, Sparkles, MapPin, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import { useLegalConsent } from '@/hooks/useLegalConsent';
import LibraryUploadConsentDialog from '@/components/motion-studio/LibraryUploadConsentDialog';
import {
  EMPTY_LOCATION_DRAFT,
  type LocationDraft,
  type MotionStudioLocation,
} from '@/types/motion-studio';

interface LocationEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location?: MotionStudioLocation | null;
  onSaved?: (l: MotionStudioLocation) => void;
}

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export default function LocationEditor({
  open,
  onOpenChange,
  location,
  onSaved,
}: LocationEditorProps) {
  const { createLocation, updateLocation, uploadLibraryImage } = useMotionStudioLibrary();
  const { hasAccepted: hasConsent } = useLegalConsent('motion_studio_library_upload');
  const [draft, setDraft] = useState<LocationDraft>(EMPTY_LOCATION_DRAFT);
  const [tagInput, setTagInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      if (location) {
        setDraft({
          name: location.name,
          description: location.description,
          reference_image_url: location.reference_image_url,
          lighting_notes: location.lighting_notes,
          tags: location.tags,
        });
      } else {
        setDraft(EMPTY_LOCATION_DRAFT);
      }
      setTagInput('');
      setPendingFile(null);
    }
  }, [open, location]);

  const performUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const tmpId = location?.id ?? `tmp-${Date.now()}`;
        const url = await uploadLibraryImage(file, 'location', tmpId);
        if (url) {
          setDraft((d) => ({ ...d, reference_image_url: url }));
          toast.success('Referenzbild hochgeladen');
        }
      } finally {
        setUploading(false);
      }
    },
    [location?.id, uploadLibraryImage]
  );

  const handleFileUpload = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!ACCEPTED.includes(file.type)) {
        toast.error('Bitte JPG, PNG oder WEBP wählen.');
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`Datei zu groß (max 20 MB).`);
        return;
      }
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
      if (location) {
        const ok = await updateLocation(location.id, draft);
        if (ok) {
          onOpenChange(false);
          onSaved?.({ ...location, ...draft } as MotionStudioLocation);
        }
      } else {
        const created = await createLocation(draft);
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
            <MapPin className="h-5 w-5 text-primary" />
            {location ? 'Location bearbeiten' : 'Neue Location anlegen'}
          </DialogTitle>
          <DialogDescription>
            Schauplätze einmal definieren — in jedem Projekt wiederverwenden.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex gap-2.5">
              <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Lade ein echtes Foto deiner Location hoch — die KI orientiert sich daran und
                hält Schauplätze über mehrere Szenen visuell konsistent.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Name *</Label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="z. B. Mein Wohnzimmer, Tokyo Skyline"
              className="bg-background/60"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Referenzbild (optional)</Label>
            {draft.reference_image_url ? (
              <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-background/50 p-3">
                <img
                  src={draft.reference_image_url}
                  alt={draft.name || 'Reference'}
                  className="w-32 h-20 rounded object-cover border border-border/40"
                />
                <div className="flex-1 space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    Wird als visuelle Referenz an die KI übergeben.
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

          <div className="space-y-1.5">
            <Label className="text-xs">Beschreibung (Englisch empfohlen) *</Label>
            <Textarea
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="modern living room, large window, Scandinavian furniture, hardwood floor"
              rows={3}
              className="bg-background/60 resize-none text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Lichtstimmung (optional)</Label>
            <Input
              value={draft.lighting_notes}
              onChange={(e) => setDraft((d) => ({ ...d, lighting_notes: e.target.value }))}
              placeholder="warm afternoon light, golden hour, side-lit"
              className="bg-background/60 text-sm"
            />
          </div>

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
                placeholder="z. B. interior, outdoor, studio"
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
            {location ? 'Änderungen speichern' : 'Location anlegen'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
