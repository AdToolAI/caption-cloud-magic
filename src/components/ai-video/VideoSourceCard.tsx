import { LazyVideoThumb } from '@/components/media-library/LazyVideoThumb';
import { cn } from '@/lib/utils';
import { formatDuration, type CanonicalVideoAsset } from '@/lib/videoEnhance/canonicalVideoAsset';
import { useTx } from '@/lib/i18nText';

interface Props {
  asset: CanonicalVideoAsset;
  selected?: boolean;
  onSelect: (asset: CanonicalVideoAsset) => void;
}

export function VideoSourceCard({ asset, selected, onSelect }: Props) {
  const tx = useTx();

  const originLabel =
    asset.origin === 'uploaded'
      ? tx({ de: 'Hochgeladen', en: 'Uploaded', es: 'Subido' })
      : asset.origin === 'enhanced'
        ? tx({ de: 'Verbessert', en: 'Enhanced', es: 'Mejorado' })
        : (asset.sourceModel ?? tx({ de: 'Erstellt', en: 'Generated', es: 'Generado' }));

  const specs = [
    asset.width && asset.height ? `${asset.width}×${asset.height}` : null,
    asset.fps ? `${Math.round(asset.fps)} FPS` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const duration = formatDuration(asset.durationSeconds);

  return (
    <button
      type="button"
      onClick={() => onSelect(asset)}
      aria-pressed={selected}
      className={cn(
        'group text-left rounded-xl overflow-hidden border bg-card/60 backdrop-blur-sm transition-all',
        'hover:border-primary/60 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        selected ? 'border-primary ring-2 ring-primary/60' : 'border-border',
      )}
    >
      <div className="relative aspect-video bg-muted">
        {asset.thumbnailUrl ? (
          <img
            src={asset.thumbnailUrl}
            alt={asset.title}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <LazyVideoThumb src={asset.url} />
        )}
        {duration && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-background/80 px-1.5 py-0.5 text-[11px] font-medium">
            {duration}
          </span>
        )}
      </div>
      <div className="p-2.5 space-y-1">
        <p className="text-sm font-medium truncate">{asset.title}</p>
        {specs && <p className="text-xs text-muted-foreground truncate">{specs}</p>}
        <p className="text-[11px] text-primary/80 truncate">{originLabel}</p>
      </div>
    </button>
  );
}
