import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Trash2, Pencil, Shirt } from 'lucide-react';
import { toast } from 'sonner';
import { useSavedOutfits, type OutfitLook } from '@/hooks/useSavedOutfits';

interface Props {
  avatarId: string;
  onOpen: (look: OutfitLook) => void;
}

export function SavedOutfitsSection({ avatarId, onOpen }: Props) {
  const { data: looks = [], isLoading, remove, rename } = useSavedOutfits(avatarId);
  const [renaming, setRenaming] = useState<string | null>(null);

  if (isLoading) return null;
  if (looks.length === 0) return null;

  return (
    <Card className="p-4 bg-card/40 border-primary/10">
      <div className="flex items-center gap-2 mb-1">
        <Shirt className="h-4 w-4 text-primary" />
        <h2 className="font-serif text-base">Saved Outfits</h2>
        <span className="text-[11px] text-muted-foreground">({looks.length})</span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        💡 Click any outfit to preview in 4 angles · then send it to the <strong>AI Video Studio</strong> or
        <strong> Motion Studio</strong> to lock identity & wardrobe in your scenes.
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
        {looks.map((look) => (
          <div key={look.id} className="group relative">
            <button
              onClick={() => onOpen(look)}
              className="block w-full aspect-[3/4] rounded-md overflow-hidden border border-border/40 hover:border-primary/50 transition"
            >
              <img
                src={look.cover_url}
                alt={look.name}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </button>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-1.5 flex items-end justify-between gap-1 pointer-events-none">
              {renaming === look.id ? (
                <input
                  autoFocus
                  defaultValue={look.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== look.name) {
                      rename.mutate({ id: look.id, name: v });
                    }
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  className="text-[10px] bg-black/70 text-white px-1 rounded w-full pointer-events-auto"
                />
              ) : (
                <span className="text-[10px] font-medium text-white drop-shadow truncate">
                  {look.name}
                </span>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition"
                >
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setRenaming(look.id)}>
                  <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    remove.mutate(look.id, { onSuccess: () => toast.success('Outfit deleted') });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
    </Card>
  );
}
