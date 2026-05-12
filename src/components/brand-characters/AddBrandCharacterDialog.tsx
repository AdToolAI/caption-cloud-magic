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

type Gender = 'female' | 'male' | 'neutral';

const GENDERS: Array<{ id: Gender; label: string; emoji: string; hint: string }> = [
  { id: 'female', label: 'Female', emoji: '♀', hint: 'Locks all wardrobe previews to female outfits' },
  { id: 'male', label: 'Male', emoji: '♂', hint: 'Locks all wardrobe previews to male outfits' },
  { id: 'neutral', label: 'Neutral', emoji: '⚪', hint: 'Both genders selectable in wardrobe' },
];

export const AddBrandCharacterDialog = ({ open, onOpenChange }: AddBrandCharacterDialogProps) => {
  const { createCharacter } = useBrandCharacters();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [gender, setGender] = useState<Gender>('neutral');
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
    setGender('neutral');
    setFile(null);
    setPreview(null);
  };

  const handleSubmit = async () => {
    if (!file || !name.trim()) return;
    await createCharacter.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      gender,
      file,
    });
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
            Upload a reference image. AI extracts a visual identity card and generates a clean canonical studio portrait you can immediately re-dress with the wardrobe.
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
            <Label>Gender *</Label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {GENDERS.map((g) => {
                const active = gender === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGender(g.id)}
                    title={g.hint}
                    className={
                      'rounded-lg border px-2 py-2 text-xs font-semibold transition-all flex flex-col items-center gap-0.5 ' +
                      (active
                        ? 'border-primary/70 bg-primary/15 text-primary shadow-[0_0_12px_-4px_hsl(var(--primary)/0.55)]'
                        : 'border-border/40 bg-card/30 text-muted-foreground hover:text-foreground hover:border-border/70')
                    }
                    aria-pressed={active}
                  >
                    <span className="text-base leading-none" aria-hidden>{g.emoji}</span>
                    {g.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Locks wardrobe previews to gender-appropriate outfits. Choose Neutral to keep both selectable.
            </p>
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
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Extracting identity & generating portrait…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" /> Save Character</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
