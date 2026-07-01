/**
 * ToolkitCastWorldPicker
 * --------------------------------------------------------------
 * Full Cast & World picker for the AI Video Studio (Toolkit).
 * Mirrors the Motion Studio model 1:1 — same IDs, same library
 * (motion_studio_characters + motion_studio_locations, where the
 * "locations" table also carries buildings + props via tags).
 *
 *   • Characters (up to 4, multi-select)
 *   • Location  (1)
 *   • Building  (1)
 *   • Props     (up to 3)
 *
 * All IDs returned are the real `motion_studio_characters.id` /
 * `motion_studio_locations.id`, so a character/location created in the
 * Motion Studio Library is available here — and vice-versa — without
 * any duplication or ID remapping.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Users, MapPin, Building2, Package, X, Plus, Star, ExternalLink } from 'lucide-react';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import { useTranslation } from '@/hooks/useTranslation';
import type { MotionStudioCharacter, MotionStudioLocation } from '@/types/motion-studio';
import { getConsistencyInfo } from '@/lib/motion-studio/modelConsistencyRanking';

const MAX_CHARACTERS = 4;
const MAX_PROPS = 3;

function kindOf(l: MotionStudioLocation): 'location' | 'building' | 'prop' {
  const tags = (l.tags ?? []) as string[];
  if (tags.includes('building')) return 'building';
  if (tags.includes('prop')) return 'prop';
  return 'location';
}

interface Props {
  characterIds: string[];
  locationId: string | null;
  buildingId: string | null;
  propIds: string[];
  onCharacterIdsChange: (ids: string[]) => void;
  onLocationIdChange: (id: string | null) => void;
  onBuildingIdChange: (id: string | null) => void;
  onPropIdsChange: (ids: string[]) => void;
  /** ai-kling, ai-hailuo, … — derived from current toolkit model family. */
  consistencyKey: string;
  /** True if the current model accepts an image input. */
  supportsImageInput: boolean;
}

export function ToolkitCastWorldPicker({
  characterIds,
  locationId,
  buildingId,
  propIds,
  onCharacterIdsChange,
  onLocationIdChange,
  onBuildingIdChange,
  onPropIdsChange,
  consistencyKey,
  supportsImageInput,
}: Props) {
  const { language } = useTranslation();
  const { characters, locations, loading } = useMotionStudioLibrary();

  const worldLocations = useMemo(() => locations.filter((l) => kindOf(l) === 'location'), [locations]);
  const worldBuildings = useMemo(() => locations.filter((l) => kindOf(l) === 'building'), [locations]);
  const worldProps = useMemo(() => locations.filter((l) => kindOf(l) === 'prop'), [locations]);

  const selectedChars = useMemo(
    () =>
      characterIds
        .map((id) => characters.find((c) => c.id === id))
        .filter((c): c is MotionStudioCharacter => !!c),
    [characterIds, characters],
  );
  const selectedLocation = useMemo(
    () => worldLocations.find((l) => l.id === locationId) ?? null,
    [worldLocations, locationId],
  );
  const selectedBuilding = useMemo(
    () => worldBuildings.find((l) => l.id === buildingId) ?? null,
    [worldBuildings, buildingId],
  );
  const selectedProps = useMemo(
    () =>
      propIds
        .map((id) => worldProps.find((p) => p.id === id))
        .filter((p): p is MotionStudioLocation => !!p),
    [propIds, worldProps],
  );

  const info = getConsistencyInfo(consistencyKey);
  const t = (de: string, en: string, es: string) =>
    language === 'de' ? de : language === 'es' ? es : en;

  const anySelected =
    selectedChars.length > 0 ||
    !!selectedLocation ||
    !!selectedBuilding ||
    selectedProps.length > 0;

  const addChar = (id: string) => {
    if (characterIds.includes(id)) return;
    if (characterIds.length >= MAX_CHARACTERS) return;
    onCharacterIdsChange([...characterIds, id]);
  };
  const removeChar = (id: string) => onCharacterIdsChange(characterIds.filter((x) => x !== id));

  const toggleProp = (id: string) => {
    if (propIds.includes(id)) {
      onPropIdsChange(propIds.filter((x) => x !== id));
      return;
    }
    if (propIds.length >= MAX_PROPS) return;
    onPropIdsChange([...propIds, id]);
  };

  return (
    <Card className="p-4 bg-card/60 backdrop-blur-xl border-border/60 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Users className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">
            {t('Cast & World', 'Cast & World', 'Reparto y Mundo')}
          </Label>
          <Badge variant="outline" className="text-[10px] gap-0.5 border-primary/30">
            {Array.from({ length: info.stars }).map((_, i) => (
              <Star key={i} className="h-2.5 w-2.5 fill-primary text-primary" />
            ))}
            {Array.from({ length: 5 - info.stars }).map((_, i) => (
              <Star key={`e-${i}`} className="h-2.5 w-2.5 text-muted-foreground/40" />
            ))}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {t('Motion-Studio Library', 'Motion Studio Library', 'Biblioteca Motion Studio')}
          </span>
        </div>
        <Link
          to="/motion-studio/library"
          className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
        >
          {t('Library', 'Library', 'Biblioteca')}
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Characters (multi) */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {t('Charaktere', 'Characters', 'Personajes')}
          <span className="text-muted-foreground/60">
            {selectedChars.length}/{MAX_CHARACTERS}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {selectedChars.map((c) => (
            <SelectedChip
              key={c.id}
              name={c.name}
              imageUrl={c.reference_image_url}
              onRemove={() => removeChar(c.id)}
            />
          ))}
          {selectedChars.length < MAX_CHARACTERS && (
            <MotionAssetPicker
              items={characters.filter((c) => !characterIds.includes(c.id))}
              loading={loading}
              onPick={(c) => addChar(c.id)}
              language={language}
              emptyLabel={t('Noch keine Charaktere.', 'No characters yet.', 'Aún no hay personajes.')}
              triggerLabel={t('Charakter hinzufügen', 'Add character', 'Añadir personaje')}
            />
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {/* Location (single) */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {t('Location', 'Location', 'Ubicación')}
          </div>
          {selectedLocation ? (
            <SelectedRow
              name={selectedLocation.name}
              subtitle={selectedLocation.description?.slice(0, 60) || '—'}
              imageUrl={selectedLocation.reference_image_url}
              onRemove={() => onLocationIdChange(null)}
            />
          ) : (
            <MotionAssetPicker
              items={worldLocations}
              loading={loading}
              onPick={(l) => onLocationIdChange((l as MotionStudioLocation).id)}
              language={language}
              emptyLabel={t('Noch keine Locations.', 'No locations yet.', 'Aún no hay ubicaciones.')}
              triggerLabel={t('Location wählen', 'Pick location', 'Elegir ubicación')}
              fullWidth
            />
          )}
        </div>

        {/* Building (single) */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            {t('Building', 'Building', 'Edificio')}
          </div>
          {selectedBuilding ? (
            <SelectedRow
              name={selectedBuilding.name}
              subtitle={selectedBuilding.description?.slice(0, 60) || '—'}
              imageUrl={selectedBuilding.reference_image_url}
              onRemove={() => onBuildingIdChange(null)}
            />
          ) : (
            <MotionAssetPicker
              items={worldBuildings}
              loading={loading}
              onPick={(l) => onBuildingIdChange((l as MotionStudioLocation).id)}
              language={language}
              emptyLabel={t('Noch keine Buildings.', 'No buildings yet.', 'Aún no hay edificios.')}
              triggerLabel={t('Building wählen', 'Pick building', 'Elegir edificio')}
              fullWidth
            />
          )}
        </div>
      </div>

      {/* Props (multi) */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          {t('Props', 'Props', 'Objetos')}
          <span className="text-muted-foreground/60">
            {selectedProps.length}/{MAX_PROPS}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {selectedProps.map((p) => (
            <SelectedChip
              key={p.id}
              name={p.name}
              imageUrl={p.reference_image_url}
              onRemove={() => toggleProp(p.id)}
            />
          ))}
          {selectedProps.length < MAX_PROPS && (
            <MotionAssetPicker
              items={worldProps.filter((p) => !propIds.includes(p.id))}
              loading={loading}
              onPick={(p) => toggleProp((p as MotionStudioLocation).id)}
              language={language}
              emptyLabel={t('Noch keine Props.', 'No props yet.', 'Aún no hay objetos.')}
              triggerLabel={t('Prop hinzufügen', 'Add prop', 'Añadir objeto')}
            />
          )}
        </div>
      </div>

      {/* Consistency hint */}
      {anySelected && (
        <div className="flex items-start gap-2 rounded-md border border-primary/15 bg-primary/5 p-2.5">
          <div className="flex-1 text-[11px] leading-relaxed text-muted-foreground">
            {supportsImageInput
              ? t(
                  `Charakter- & World-Referenzen werden automatisch in den Startframe komponiert (${info.mode}).`,
                  `Character & world references are composed into the first frame automatically (${info.mode}).`,
                  `Referencias de personaje y mundo se componen automáticamente en el fotograma inicial (${info.mode}).`,
                )
              : t(
                  'Dieses Modell akzeptiert keinen Startframe — nur die Beschreibungen werden in den Prompt injiziert. Für maximale Konsistenz → Kling / Hailuo.',
                  'This model does not accept a first frame — only descriptions are injected into the prompt. For maximum consistency, switch to Kling / Hailuo.',
                  'Este modelo no acepta fotograma inicial — solo se inyectan las descripciones. Para máxima consistencia usa Kling / Hailuo.',
                )}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─────────── Internal atoms ─────────── */

function SelectedChip({
  name,
  imageUrl,
  onRemove,
}: {
  name: string;
  imageUrl: string | null | undefined;
  onRemove: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 pl-1 pr-1.5 py-0.5">
      <Avatar className="h-6 w-6">
        {imageUrl && <AvatarImage src={imageUrl} alt={name} />}
        <AvatarFallback className="text-[9px]">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="text-xs font-medium max-w-[120px] truncate">{name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground hover:text-foreground rounded-full p-0.5"
        aria-label="remove"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function SelectedRow({
  name,
  subtitle,
  imageUrl,
  onRemove,
}: {
  name: string;
  subtitle: string;
  imageUrl: string | null | undefined;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
      <Avatar className="h-9 w-9">
        {imageUrl && <AvatarImage src={imageUrl} alt={name} />}
        <AvatarFallback className="text-[10px]">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{name}</p>
        <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>
      </div>
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onRemove}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

type PickableItem = MotionStudioCharacter | MotionStudioLocation;

function MotionAssetPicker({
  items,
  loading,
  onPick,
  language,
  emptyLabel,
  triggerLabel,
  fullWidth = false,
}: {
  items: PickableItem[];
  loading: boolean;
  onPick: (item: PickableItem) => void;
  language: string;
  emptyLabel: string;
  triggerLabel: string;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`${fullWidth ? 'w-full ' : ''}justify-start gap-2 h-9 border-dashed`}
        >
          <Plus className="h-3.5 w-3.5" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 max-h-[320px] overflow-y-auto" align="start">
        {loading ? (
          <p className="text-xs text-muted-foreground p-3">…</p>
        ) : items.length === 0 ? (
          <div className="p-3 space-y-2">
            <p className="text-xs text-muted-foreground">{emptyLabel}</p>
            <Link
              to="/motion-studio/library"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              onClick={() => setOpen(false)}
            >
              {language === 'de' ? 'Zur Library' : language === 'es' ? 'Abrir biblioteca' : 'Open library'}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onPick(item);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-primary/5 text-left"
            >
              <Avatar className="h-7 w-7">
                {item.reference_image_url && (
                  <AvatarImage src={item.reference_image_url} alt={item.name} />
                )}
                <AvatarFallback className="text-[10px]">
                  {item.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{item.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {item.description?.slice(0, 50) || '—'}
                </p>
              </div>
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ─────────── Helper: prompt suffix for description injection ─────────── */

export function buildCastWorldPromptSuffix(
  characters: MotionStudioCharacter[],
  location: MotionStudioLocation | null,
  building: MotionStudioLocation | null,
  props: MotionStudioLocation[],
): string {
  const lines: string[] = [];
  for (const c of characters) {
    lines.push(`Featuring ${c.name}: ${c.description}.`);
    if (c.signature_items?.trim()) {
      lines.push(`Signature wardrobe (${c.name}): ${c.signature_items}.`);
    }
  }
  if (location) {
    lines.push(`Setting — ${location.name}: ${location.description}.`);
    if (location.lighting_notes?.trim()) {
      lines.push(`Lighting: ${location.lighting_notes}.`);
    }
  }
  if (building) {
    lines.push(`Building — ${building.name}: ${building.description}.`);
  }
  if (props.length > 0) {
    lines.push(
      `Props: ${props.map((p) => `${p.name} (${p.description})`).join('; ')}.`,
    );
  }
  return lines.join(' ');
}
