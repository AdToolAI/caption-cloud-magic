import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, Sparkles } from 'lucide-react';
import { useBrandCharacters } from '@/hooks/useBrandCharacters';

interface AddBrandCharacterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddBrandCharacterDialog = ({ open, onOpenChange }: AddBrandCharacterDialogProps) => {
  const { createCharacter } = useBrandCharacters();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = (f: File | null) => {
    setFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else setPreview(null);
  };

  const reset = () => {
    setName('');
    setDescription('');
    setFile(null);
    setPreview(null);
  };

  const handleSubmit = async () => {
    if (!file || !name.trim()) return;
    await createCharacter.mutateAsync({ name: name.trim(), description: description.trim() || undefined, file });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg bg-card/95 backdrop-blur border-primary/20">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Add Brand Character
          </DialogTitle>
          <DialogDescription>
            Upload a reference image. AI will automatically extract a visual identity card you can reuse across all video & picture studios.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="char-name">Name *</Label>
            <Input
              id="char-name"
              placeholder="e.g. Sarah, Brand Mascot"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />
          </div>

          <div>
            <Label htmlFor="char-desc">Description (optional)</Label>
            <Textarea
              id="char-desc"
              placeholder="e.g. Marketing manager, professional, warm tone"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={300}
            />
          </div>

          <div>
            <Label>Reference Image *</Label>
            <label
              htmlFor="char-file"
              className="mt-1 flex flex-col items-center justify-center w-full h-48 rounded-lg border-2 border-dashed border-primary/30 hover:border-primary/60 bg-background/40 cursor-pointer transition overflow-hidden"
            >
              {preview ? (
                <img src={preview} alt="preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="h-8 w-8" />
                  <span className="text-sm">Click to upload (JPG / PNG / WebP)</span>
                </div>
              )}
              <input
                id="char-file"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createCharacter.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!file || !name.trim() || createCharacter.isPending}
            className="bg-primary text-primary-foreground"
          >
            {createCharacter.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Extracting identity…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" /> Save Character</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
