import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VideoSourceCard } from '@/components/ai-video/VideoSourceCard';
import {
  useEnhanceSourceLibrary,
  type EnhanceSourceFilter,
} from '@/hooks/useEnhanceSourceVideos';
import type { CanonicalVideoAsset } from '@/lib/videoEnhance/canonicalVideoAsset';
import { useTx } from '@/lib/i18nText';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: EnhanceSourceFilter;
  onFilterChange: (filter: EnhanceSourceFilter) => void;
  search: string;
  onSearchChange: (search: string) => void;
  selectedKey?: string;
  onSelect: (asset: CanonicalVideoAsset) => void;
}

export function AllVideosDialog({
  open,
  onOpenChange,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  selectedKey,
  onSelect,
}: Props) {
  const tx = useTx();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useEnhanceSourceLibrary(filter, search, 18, open);
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !sentinel.current || !hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [open, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const filters: { id: EnhanceSourceFilter; label: string }[] = [
    { id: 'recent', label: tx({ de: 'Zuletzt', en: 'Recent', es: 'Recientes' }) },
    { id: 'generated', label: tx({ de: 'Erstellt', en: 'Generated', es: 'Generados' }) },
    { id: 'uploaded', label: tx({ de: 'Hochgeladen', en: 'Uploaded', es: 'Subidos' }) },
    { id: 'enhanced', label: tx({ de: 'Verbessert', en: 'Enhanced', es: 'Mejorados' }) },
  ];

  const assets = data?.pages.flat() ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {tx({ de: 'Alle Videos', en: 'All videos', es: 'Todos los vídeos' })}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={tx({
              de: 'Videos durchsuchen',
              en: 'Search videos',
              es: 'Buscar vídeos',
            })}
            className="max-w-xs"
          />
          <div className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <Button
                key={f.id}
                size="sm"
                variant={filter === f.id ? 'default' : 'outline'}
                onClick={() => onFilterChange(f.id)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : assets.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {tx({
              de: 'Keine Videos gefunden.',
              en: 'No videos found.',
              es: 'No se encontraron vídeos.',
            })}
          </p>
        ) : (
          <div className={cn('grid gap-3 sm:grid-cols-3 lg:grid-cols-4')}>
            {assets.map((asset) => (
              <VideoSourceCard
                key={asset.key}
                asset={asset}
                selected={asset.key === selectedKey}
                onSelect={(a) => {
                  onSelect(a);
                  onOpenChange(false);
                }}
              />
            ))}
          </div>
        )}

        <div ref={sentinel} className="h-6" />
        {isFetchingNextPage && (
          <div className="flex justify-center pb-2">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
