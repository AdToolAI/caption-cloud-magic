import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, Trash2, TrendingUp } from 'lucide-react';
import { type BrandCharacter, useBrandCharacters } from '@/hooks/useBrandCharacters';

interface BrandCharacterCardProps {
  character: BrandCharacter;
}

export const BrandCharacterCard = ({ character }: BrandCharacterCardProps) => {
  const { toggleFavorite, archiveCharacter } = useBrandCharacters();
  const id = character.visual_identity_json || {};
  const tags: string[] = Array.isArray(id.style_tags) ? id.style_tags.slice(0, 3) : [];

  return (
    <Card className="group relative overflow-hidden bg-card/60 backdrop-blur border-primary/15 hover:border-primary/40 transition">
      <div className="aspect-[4/5] relative bg-background/40">
        <img
          src={character.reference_image_url}
          alt={character.name}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        <button
          onClick={() => toggleFavorite.mutate({ id: character.id, is_favorite: !character.is_favorite })}
          className="absolute top-2 right-2 p-2 rounded-full bg-background/70 backdrop-blur hover:bg-background transition"
          aria-label="Toggle favorite"
        >
          <Star className={`h-4 w-4 ${character.is_favorite ? 'fill-primary text-primary' : 'text-muted-foreground'}`} />
        </button>
      </div>

      <div className="p-3 space-y-2">
        <div>
          <h3 className="font-serif text-lg leading-tight">{character.name}</h3>
          {character.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{character.description}</p>
          )}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((t, i) => (
              <Badge key={i} variant="outline" className="text-[10px] border-primary/30 text-primary/80">
                {t}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            {character.usage_count} uses
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-muted-foreground hover:text-destructive"
            onClick={() => {
              if (confirm(`Archive "${character.name}"?`)) archiveCharacter.mutate(character.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
