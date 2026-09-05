import { useCallback, useRef, useState } from 'react';
import { Loader2, Upload, Video } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VideoSourceCard } from '@/components/ai-video/VideoSourceCard';
import { AllVideosDialog } from '@/components/ai-video/AllVideosDialog';
import { LazyVideoThumb } from '@/components/media-library/LazyVideoThumb';
import { useAuth } from '@/hooks/useAuth';
import {
  useRecentEnhanceSources,
  type EnhanceSourceFilter,
} from '@/hooks/useEnhanceSourceVideos';
import {
  formatDuration,
  type CanonicalVideoAsset,
} from '@/lib/videoEnhance/canonicalVideoAsset';
import { uploadVideoAsset } from '@/lib/videoEnhance/uploadVideoAsset';
import { useTx } from '@/lib/i18nText';
import { cn } from '@/lib/utils';

/**
 * The visual source picker for Video Enhance.
 *
 * The selection it emits is always a canonical asset ({ assetId, assetType }).
 * A dropped file is persisted as a real AdTool video asset first — no raw
 * public URL ever leaves this component.
 */

interface Props {
  selected: CanonicalVideoAsset | null;
  onSelect: (asset: CanonicalVideoAsset | null) => void;
}

export function VideoSourcePicker({ selected, onSelect }: Props) {
  const tx = useTx();
  const { user } = useAuth();
  const { data: recent = [], isLoading, refetch } = useRecentEnhanceSources(8);

  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [filter, setFilter] = useState<EnhanceSourceFilter>('recent');
  const [search, setSearch] = useState('');
  const [allOpen, setAllOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!user) return;
      setUploadError(null);
      setUploading(true);
      try {
        const asset = await uploadVideoAsset(file, user.id);
        onSelect(asset);
        void refetch();
      } catch (e) {
        const code = e instanceof Error ? e.message : String(e);
        setUploadError(
          code === 'UNSUPPORTED_FILE_TYPE'
            ? tx({
                de: 'Bitte eine Videodatei wählen.',
                en: 'Please choose a video file.',
                es: 'Elige un archivo de vídeo.',
              })
            : code === 'FILE_TOO_LARGE'
              ? tx({
                  de: 'Die Datei ist zu groß (max. 200 MB).',
                  en: 'That file is too large (max 200 MB).',
                  es: 'El archivo es demasiado grande (máx. 200 MB).',
                })
              : tx({
                  de: 'Der Upload hat nicht geklappt.',
                  en: 'The upload did not work.',
                  es: 'La subida no funcionó.',
                }),
        );
      } finally {
        setUploading(false);
      }
    },
    [onSelect, refetch, tx, user],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop,
  };

  // ---- selected: compact card ---------------------------------------------
  if (selected) {
    const specs = [
      selected.width && selected.height ? `${selected.width}×${selected.height}` : null,
      selected.fps ? `${Math.round(selected.fps)} FPS` : null,
      formatDuration(selected.durationSeconds),
    ]
      .filter(Boolean)
      .join(' · ');

    const origin =
      selected.origin === 'uploaded'
        ? tx({ de: 'Hochgeladen', en: 'Uploaded', es: 'Subido' })
        : selected.origin === 'enhanced'
          ? tx({ de: 'Verbessert', en: 'Enhanced', es: 'Mejorado' })
          : (selected.sourceModel ?? tx({ de: 'Erstellt', en: 'Generated', es: 'Generado' }));

    return (
      <div
        {...dropProps}
        className={cn(
          'flex items-center gap-4 rounded-xl border p-3 transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border bg-card/60',
        )}
      >
        <div className="w-28 shrink-0 aspect-video overflow-hidden rounded-lg bg-muted">
          {selected.thumbnailUrl ? (
            <img src={selected.thumbnailUrl} alt={selected.title} className="w-full h-full object-cover" />
          ) : (
            <LazyVideoThumb src={selected.url} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{selected.title}</p>
          <p className="text-sm text-primary/80 truncate">{origin}</p>
          {specs && <p className="text-sm text-muted-foreground truncate">{specs}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={() => onSelect(null)}>
          {tx({ de: 'Video ändern', en: 'Change video', es: 'Cambiar vídeo' })}
        </Button>
      </div>
    );
  }

  // ---- nothing selected: library / upload ---------------------------------
  return (
    <div
      {...dropProps}
      className={cn(
        'rounded-xl border p-4 space-y-4 transition-colors',
        dragging ? 'border-primary bg-primary/5' : 'border-border bg-card/40',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label className="text-base">
          {tx({ de: 'Video wählen', en: 'Choose a video', es: 'Elige un vídeo' })}
        </Label>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant={tab === 'library' ? 'default' : 'outline'}
            onClick={() => setTab('library')}
          >
            {tx({ de: 'Mediathek', en: 'Media library', es: 'Mediateca' })}
          </Button>
          <Button
            size="sm"
            variant={tab === 'upload' ? 'default' : 'outline'}
            onClick={() => setTab('upload')}
          >
            {tx({ de: 'Hochladen', en: 'Upload', es: 'Subir' })}
          </Button>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />

      {tab === 'upload' || (!isLoading && recent.length === 0) ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/70 py-10 text-center">
          {uploading ? (
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          ) : (
            <Video className="w-7 h-7 text-muted-foreground" />
          )}
          <p className="text-sm text-muted-foreground">
            {tx({
              de: 'Video hier ablegen — oder aus deiner Mediathek wählen',
              en: 'Drop a video here — or pick one from your media library',
              es: 'Suelta un vídeo aquí o elige uno de tu mediateca',
            })}
          </p>
          <Button variant="secondary" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
            <Upload className="w-4 h-4 mr-2" />
            {tx({ de: 'Video hochladen', en: 'Upload video', es: 'Subir vídeo' })}
          </Button>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {recent.map((asset) => (
              <VideoSourceCard key={asset.key} asset={asset} onSelect={onSelect} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setAllOpen(true)}
              placeholder={tx({ de: 'Videos durchsuchen', en: 'Search videos', es: 'Buscar vídeos' })}
              className="max-w-xs"
            />
            <Button variant="ghost" size="sm" onClick={() => setAllOpen(true)}>
              {tx({ de: 'Alle Videos anzeigen', en: 'View all videos', es: 'Ver todos los vídeos' })}
            </Button>
          </div>
        </>
      )}

      {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

      <AllVideosDialog
        open={allOpen}
        onOpenChange={setAllOpen}
        filter={filter}
        onFilterChange={setFilter}
        search={search}
        onSearchChange={setSearch}
        selectedKey={undefined}
        onSelect={onSelect}
      />
    </div>
  );
}
