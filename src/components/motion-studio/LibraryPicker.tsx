import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, User, MapPin, Plus, X, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import type { MotionStudioCharacter, MotionStudioLocation } from '@/types/motion-studio';

export type LibraryItem =
  | { kind: 'character'; data: MotionStudioCharacter }
  | { kind: 'location'; data: MotionStudioLocation };

interface LibraryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Welche Library-Typen anzeigen. Default: beide. */
  modes?: ('character' | 'location')[];
  /** Aktuell bereits ausgewählte IDs (markiert) */
  selectedCharacterIds?: string[];
  selectedLocationIds?: string[];
  onSelect: (item: LibraryItem) => void;
  title?: string;
}

/**
 * Modal um aus der Library Charaktere / Locations in die aktuelle Szene
 * (oder ins Projekt-Briefing) einzufügen.
 */
export default function LibraryPicker({
  open,
  onOpenChange,
  modes = ['character', 'location'],
  selectedCharacterIds = [],
  selectedLocationIds = [],
  onSelect,
  title = 'Aus Library hinzufügen',
}: LibraryPickerProps) {
  const { characters, locations, loading, trackUsage } = useMotionStudioLibrary();
  const [search, setSearch] = useState('');

  const items = useMemo<LibraryItem[]>(() => {
    const arr: LibraryItem[] = [];
    if (modes.includes('character')) {
      arr.push(...characters.map((c) => ({ kind: 'character' as const, data: c })));
    }
    if (modes.includes('location')) {
      arr.push(...locations.map((l) => ({ kind: 'location' as const, data: l })));
    }
    return arr;
  }, [characters, locations, modes]);

  const q = search.trim().toLowerCase();
  const filtered = items.filter(({ data }) => {
    if (!q) return true;
    return (
      data.name.toLowerCase().includes(q) ||
      data.description.toLowerCase().includes(q) ||
      data.tags.some((t) => t.includes(q))
    );
  });

  const isSelected = (item: LibraryItem) =>
    item.kind === 'character'
      ? selectedCharacterIds.includes(item.data.id)
      : selectedLocationIds.includes(item.data.id);

  const handlePick = async (item: LibraryItem) => {
    onSelect(item);
    trackUsage(item.kind, item.data.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col bg-card border-border/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Wähle gespeicherte {modes.includes('character') && modes.includes('location') ? 'Charaktere und Locations' : modes[0] === 'character' ? 'Charaktere' : 'Locations'} oder lege neue in der Library an.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 pb-3 border-b border-border/40">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suchen..."
              className="pl-8 bg-background/60 border-border/40 h-9"
              autoFocus
            />
          </div>
          <Link to="/motion-studio/library" onClick={() => onOpenChange(false)}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Library öffnen
            </Button>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto py-3 -mx-1 px-1">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-40 rounded-lg bg-background/40 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 px-6">
              <p className="text-sm text-muted-foreground mb-3">
                {items.length === 0
                  ? 'Du hast noch keine gespeicherten Einträge.'
                  : 'Keine Ergebnisse für deine Suche.'}
              </p>
              {items.length === 0 && (
                <Link to="/motion-studio/library" onClick={() => onOpenChange(false)}>
                  <Button size="sm" className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Library öffnen & anlegen
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map((item) => {
                const selected = isSelected(item);
                return (
                  <button
                    key={`${item.kind}-${item.data.id}`}
                    onClick={() => handlePick(item)}
                    className={`group relative text-left rounded-lg border overflow-hidden transition-all hover:shadow-md hover:shadow-primary/5 ${
                      selected
                        ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                        : 'border-border/40 bg-background/40 hover:border-primary/40'
                    }`}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-primary/5 via-background to-background">
                      {item.data.reference_image_url ? (
                        <img
                          src={item.data.reference_image_url}
                          alt={item.data.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                          {item.kind === 'character' ? (
                            <User className="h-10 w-10" />
                          ) : (
                            <MapPin className="h-10 w-10" />
                          )}
                        </div>
                      )}
                      <Badge
                        variant="secondary"
                        className="absolute top-1.5 left-1.5 text-[9px] h-4 px-1.5 backdrop-blur bg-background/80"
                      >
                        {item.kind === 'character' ? '👤 Char' : '📍 Loc'}
                      </Badge>
                      {selected && (
                        <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full p-1">
                          <X className="h-2.5 w-2.5" />
                        </div>
                      )}
                    </div>
                    <div className="p-2 space-y-0.5">
                      <p className="font-medium text-xs truncate">{item.data.name}</p>
                      <p className="text-[10px] text-muted-foreground line-clamp-1">
                        {item.data.description || '—'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
