// AssetPhotoUploadSheet
// ---------------------------------------------------------------
// Unified sheet that lets a user drop any photo of a character,
// prop, building or location and get back a clean Cast & World
// asset with a canonical UUID. Powered by `useRefineAssetPhoto`.

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Sparkles } from 'lucide-react';
import {
  useRefineAssetPhoto,
  REFINE_KIND_LABEL,
  type RefineKind,
} from '@/hooks/useRefineAssetPhoto';

interface AssetPhotoUploadSheetProps {
  kind: RefineKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (assetId: string, kind: RefineKind) => void;
}

const KIND_DESCRIPTION: Record<RefineKind, string> = {
  character:
    'Upload any photo of a person. The AI will re-render them as a clean full-body portrait on a transparent background.',
  prop:
    'Upload any photo of an object (laptop, cup, bike, tool…). The AI will re-render it as a clean studio product cutout on a transparent background.',
  building:
    'Upload any photo of a building. The AI will render a clean architectural hero shot with a plain sky.',
  location:
    'Upload any photo of a place. The AI will render a clean cinematic establishing shot without people or clutter.',
};

export function AssetPhotoUploadSheet({
  kind,
  open,
  onOpenChange,
  onCreated,
}: AssetPhotoUploadSheetProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const refine = useRefineAssetPhoto();

  const reset = useCallback(() => {
    setFile(null);
    setPreviewUrl(null);
    setName('');
    setNotes('');
  }, []);

  const handleFile = useCallback((f: File | null) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }, [previewUrl]);

  const handleSubmit = useCallback(async () => {
    if (!file || !name.trim()) return;
    const res = await refine.mutateAsync({
      kind,
      file,
      name: name.trim(),
      extraPrompt: notes.trim() || undefined,
    });
    onCreated?.(res.assetId, res.kind);
    reset();
    onOpenChange(false);
  }, [file, name, notes, kind, refine, onCreated, onOpenChange, reset]);

  const busy = refine.isPending;
  const canSubmit = useMemo(
    () => !!file && !!name.trim() && !busy,
    [file, name, busy],
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            New {REFINE_KIND_LABEL[kind]} from photo
          </SheetTitle>
          <SheetDescription>{KIND_DESCRIPTION[kind]}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* File picker / dropzone */}
          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
              Source photo
            </Label>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="relative w-full aspect-square rounded-lg border border-dashed border-border bg-muted/30 hover:bg-muted/50 transition-colors flex flex-col items-center justify-center overflow-hidden"
              disabled={busy}
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">
                    Click to upload — any quality works
                  </span>
                  <span className="text-xs text-muted-foreground/70 mt-1">
                    JPG, PNG, WebP · Max ~10 MB
                  </span>
                </>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
          </div>

          {/* Name */}
          <div>
            <Label htmlFor="asset-name" className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
              Name
            </Label>
            <Input
              id="asset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                kind === 'character' ? 'e.g. Sarah'
                  : kind === 'prop' ? 'e.g. My MacBook'
                  : kind === 'building' ? 'e.g. Our office'
                  : 'e.g. Rooftop terrace'
              }
              disabled={busy}
            />
          </div>

          {/* Optional notes */}
          <div>
            <Label htmlFor="asset-notes" className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
              Notes for the AI <span className="text-muted-foreground/60 normal-case">(optional)</span>
            </Label>
            <Textarea
              id="asset-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. keep the red color of the laptop lid"
              rows={2}
              disabled={busy}
            />
          </div>
        </div>

        <SheetFooter className="mt-6 gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Refining…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Create with AI
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
