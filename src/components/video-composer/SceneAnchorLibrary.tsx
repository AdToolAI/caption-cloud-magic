// Phase 2 — Scene Anchor Library
// A compact chip strip that lets the user pick a reference image for the
// scene's i2v first-frame from a curated set of project-aware sources:
//   • Last frame of the previous scene (if rendered)
//   • Favorite Brand Character portrait
//   • Brand Locations from the @-mention library (max 3)
//   • Clear current reference
//
// All chips set `referenceImageUrl` on the scene via onPick.
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Link2, User, MapPin, X, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUnifiedMentionLibrary } from '@/hooks/useUnifiedMentionLibrary';
import { useBrandCharacters } from '@/hooks/useBrandCharacters';

interface Props {
  selectedReferenceUrl?: string;
  previousSceneLastFrameUrl?: string;
  previousSceneIndex?: number; // 1-based label
  onPick: (url: string | undefined) => void;
  language?: 'de' | 'en' | 'es';
}

const TXT = {
  de: { title: 'Quick-Anker', last: 'Letzter Frame Szene', char: 'Brand-Char', loc: 'Location', clear: 'Leeren' },
  en: { title: 'Quick anchors', last: 'Last frame Scene', char: 'Brand char', loc: 'Location', clear: 'Clear' },
  es: { title: 'Anclas rápidas', last: 'Último fotograma Escena', char: 'Personaje', loc: 'Lugar', clear: 'Borrar' },
};

export default function SceneAnchorLibrary({
  selectedReferenceUrl,
  previousSceneLastFrameUrl,
  previousSceneIndex,
  onPick,
  language = 'de',
}: Props) {
  const t = TXT[language];
  const { locations } = useUnifiedMentionLibrary();
  const { characters } = useBrandCharacters();
  const brand = characters.find((c) => c.is_favorite) ?? characters[0];

  const locItems = useMemo(
    () =>
      (locations ?? [])
        .filter((l: any) => l.reference_image_url || l.image_url)
        .slice(0, 3),
    [locations],
  );

  const hasAny =
    !!previousSceneLastFrameUrl ||
    !!brand?.reference_image_url ||
    locItems.length > 0 ||
    !!selectedReferenceUrl;

  if (!hasAny) return null;

  const Chip = ({
    active,
    onClick,
    icon: Icon,
    label,
    thumb,
  }: {
    active?: boolean;
    onClick: () => void;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    thumb?: string;
  }) => (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={onClick}
      className={cn(
        'h-7 gap-1.5 px-2 text-[10px] border-border/40',
        active && 'border-primary text-primary bg-primary/10',
      )}
    >
      {thumb ? (
        <img
          src={thumb}
          alt=""
          className="h-4 w-4 rounded object-cover border border-border/40"
        />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      <span className="truncate max-w-[110px]">{label}</span>
    </Button>
  );

  return (
    <div className="flex items-center gap-1.5 flex-wrap p-1.5 rounded-md border border-border/30 bg-muted/20">
      <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1 pr-1">
        <ImageIcon className="h-3 w-3" />
        {t.title}:
      </span>
      {previousSceneLastFrameUrl && (
        <Chip
          active={selectedReferenceUrl === previousSceneLastFrameUrl}
          onClick={() => onPick(previousSceneLastFrameUrl)}
          icon={Link2}
          label={`${t.last} ${previousSceneIndex ?? ''}`.trim()}
          thumb={previousSceneLastFrameUrl}
        />
      )}
      {brand?.reference_image_url && (
        <Chip
          active={selectedReferenceUrl === brand.reference_image_url}
          onClick={() => onPick(brand.reference_image_url!)}
          icon={User}
          label={brand.name || t.char}
          thumb={brand.reference_image_url}
        />
      )}
      {locItems.map((l: any) => {
        const url = l.reference_image_url || l.image_url;
        return (
          <Chip
            key={l.id}
            active={selectedReferenceUrl === url}
            onClick={() => onPick(url)}
            icon={MapPin}
            label={l.name || t.loc}
            thumb={url}
          />
        );
      })}
      {selectedReferenceUrl && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onPick(undefined)}
          className="h-7 gap-1 px-2 text-[10px] text-muted-foreground hover:text-destructive"
        >
          <X className="h-3 w-3" />
          {t.clear}
        </Button>
      )}
    </div>
  );
}
