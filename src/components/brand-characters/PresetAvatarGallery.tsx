import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Sparkles, User } from 'lucide-react';
import { usePresetAvatars } from '@/hooks/usePresetAvatars';
import { useState } from 'react';

interface Props {
  compact?: boolean;
}

export const PresetAvatarGallery = ({ compact = false }: Props) => {
  const { presets, isLoading, clonePreset } = usePresetAvatars();
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading preset avatars…
      </div>
    );
  }

  if (presets.length === 0) return null;

  const handleClone = async (id: string) => {
    setPendingId(id);
    try {
      await clonePreset.mutateAsync(id);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="mb-10">
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 text-primary text-xs tracking-widest uppercase mb-1">
            <Sparkles className="h-3.5 w-3.5" />
            Preset Avatars
          </div>
          <h2 className="font-serif text-2xl">Start with a ready-made talent</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Pick any preset to instantly add it to your library — fully editable, dressable, and voice-ready.
          </p>
        </div>
      </div>

      <div className={
        compact
          ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3'
          : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4'
      }>
        {presets.map((p) => {
          const busy = pendingId === p.id;
          return (
            <Card
              key={p.id}
              className="group relative overflow-hidden bg-card/40 border-primary/15 hover:border-primary/40 transition"
            >
              <div className="aspect-square w-full bg-muted/30 overflow-hidden">
                {p.portrait_url ? (
                  <img
                    src={p.portrait_url}
                    alt={p.name}
                    loading="lazy"
                    className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                    <User className="h-10 w-10" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium truncate">{p.name}</p>
                  <Badge variant="outline" className="text-[10px] border-primary/30 text-primary capitalize">
                    {p.gender}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate mb-2">{p.role_label}</p>
                <Button
                  size="sm"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => handleClone(p.id)}
                  disabled={busy || clonePreset.isPending}
                >
                  {busy ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Adding…</>
                  ) : (
                    <><Plus className="h-3.5 w-3.5 mr-1" /> Use this Avatar</>
                  )}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
};
