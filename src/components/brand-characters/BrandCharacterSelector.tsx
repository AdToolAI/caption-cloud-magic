import { useState } from 'react';
import { useBrandCharacters, type BrandCharacter } from '@/hooks/useBrandCharacters';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Sparkles, X, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AddBrandCharacterDialog } from './AddBrandCharacterDialog';

interface BrandCharacterSelectorProps {
  value?: string | null;
  onChange: (character: BrandCharacter | null) => void;
  label?: string;
  hint?: string;
}

export const BrandCharacterSelector = ({
  value,
  onChange,
  label = 'Brand Character',
  hint = 'Lock a recurring character into this generation for consistency.',
}: BrandCharacterSelectorProps) => {
  const { characters, isLoading } = useBrandCharacters();
  const [addOpen, setAddOpen] = useState(false);
  const selected = characters.find((c) => c.id === value) ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          {label}
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-primary hover:text-primary/80"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> New
        </Button>
      </div>

      {selected ? (
        <div className="flex items-center gap-3 p-2 rounded-md border border-primary/30 bg-primary/5">
          <img
            src={selected.reference_image_url}
            alt={selected.name}
            className="h-12 w-12 rounded object-cover"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium truncate">{selected.name}</p>
              <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">LOCKED</Badge>
            </div>
            {selected.description && (
              <p className="text-xs text-muted-foreground truncate">{selected.description}</p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onChange(null)}
            aria-label="Remove character"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Select
          value=""
          onValueChange={(id) => {
            const c = characters.find((x) => x.id === id);
            if (c) onChange(c);
          }}
          disabled={isLoading || characters.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder={
              isLoading ? 'Loading…' :
              characters.length === 0 ? 'No characters yet — create one' :
              'Choose a brand character (optional)'
            } />
          </SelectTrigger>
          <SelectContent>
            {characters.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="flex items-center gap-2">
                  <img src={c.reference_image_url} alt="" className="h-5 w-5 rounded object-cover" />
                  {c.name}
                  {c.is_favorite && <Star className="h-3 w-3 fill-primary text-primary" />}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {hint && !selected && <p className="text-xs text-muted-foreground">{hint}</p>}

      <AddBrandCharacterDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
};

// Re-export Star for the SelectItem inline use above
import { Star } from 'lucide-react';
