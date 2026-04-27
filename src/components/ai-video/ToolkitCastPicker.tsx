/**
 * ToolkitCastPicker
 * --------------------------------------------------------------
 * Lets the user pick ONE character + ONE location from the global
 * Motion Studio Library and feeds them into the AI Video Toolkit:
 *   • The character's reference image becomes the `startImageUrl`
 *     (i2v anchor) for engines that support it.
 *   • The character's textual description + signature items + the
 *     location's description are returned as a prompt suffix that
 *     the caller appends/injects into the user's prompt.
 *
 * For Sora 2 (prompt-only) → no image is sent; the description is
 * injected in the prompt and a hint toast is fired by the caller.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Users, MapPin, X, Plus, Star, ExternalLink } from 'lucide-react';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import { useTranslation } from '@/hooks/useTranslation';
import type { MotionStudioCharacter, MotionStudioLocation } from '@/types/motion-studio';
import { getConsistencyInfo } from '@/lib/motion-studio/modelConsistencyRanking';

interface Props {
  characterId: string | null;
  locationId: string | null;
  onCharacterChange: (id: string | null) => void;
  onLocationChange: (id: string | null) => void;
  /** ai-kling, ai-hailuo, … — derived from current toolkit model family for the consistency hint. */
  consistencyKey: string;
  /** True if the current model accepts an image input. */
  supportsImageInput: boolean;
}

export function ToolkitCastPicker({
  characterId,
  locationId,
  onCharacterChange,
  onLocationChange,
  consistencyKey,
  supportsImageInput,
}: Props) {
  const { language } = useTranslation();
  const { characters, locations, loading } = useMotionStudioLibrary();

  const character = useMemo(
    () => characters.find((c) => c.id === characterId) ?? null,
    [characters, characterId],
  );
  const location = useMemo(
    () => locations.find((l) => l.id === locationId) ?? null,
    [locations, locationId],
  );
  const info = getConsistencyInfo(consistencyKey);

  const t = (de: string, en: string, es: string) =>
    language === 'de' ? de : language === 'es' ? es : en;

  return (
    <Card className="p-4 bg-card/60 backdrop-blur-xl border-border/60 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">
            {t('Cast & Locations', 'Cast & Locations', 'Reparto y Ubicaciones')}
          </Label>
          <Badge variant="outline" className="text-[10px] gap-0.5 border-primary/30">
            {Array.from({ length: info.stars }).map((_, i) => (
              <Star key={i} className="h-2.5 w-2.5 fill-primary text-primary" />
            ))}
            {Array.from({ length: 5 - info.stars }).map((_, i) => (
              <Star key={`e-${i}`} className="h-2.5 w-2.5 text-muted-foreground/40" />
            ))}
          </Badge>
        </div>
        <Link
          to="/motion-studio/library"
          className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
        >
          {t('Library', 'Library', 'Biblioteca')}
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {/* CHARACTER PICKER */}
        <CastSlot
          icon={<Users className="h-3.5 w-3.5" />}
          label={t('Charakter', 'Character', 'Personaje')}
          selected={character}
          onClear={() => onCharacterChange(null)}
          renderTrigger={() => (
            <CharacterPicker
              characters={characters}
              loading={loading}
              onPick={(c) => onCharacterChange(c.id)}
              language={language}
            />
          )}
        />
        {/* LOCATION PICKER */}
        <CastSlot
          icon={<MapPin className="h-3.5 w-3.5" />}
          label={t('Location', 'Location', 'Ubicación')}
          selected={location}
          onClear={() => onLocationChange(null)}
          renderTrigger={() => (
            <LocationPicker
              locations={locations}
              loading={loading}
              onPick={(l) => onLocationChange(l.id)}
              language={language}
            />
          )}
        />
      </div>

      {/* Consistency hint */}
      {(character || location) && (
        <div className="flex items-start gap-2 rounded-md border border-primary/15 bg-primary/5 p-2.5">
          <div className="flex-1 text-[11px] leading-relaxed text-muted-foreground">
            {supportsImageInput
              ? t(
                  `Referenzbild & Beschreibung werden automatisch übergeben (${info.mode}).`,
                  `Reference image & description are passed automatically (${info.mode}).`,
                  `Imagen y descripción de referencia se envían automáticamente (${info.mode}).`,
                )
              : t(
                  'Dieses Modell akzeptiert kein Referenzbild — nur die Beschreibung wird in den Prompt injiziert. Für längere Stories wechsle zu Kling oder Hailuo (bis zu 5★).',
                  'This model does not accept a reference image — only the description is injected into the prompt. For longer stories, switch to Kling or Hailuo (up to 5★).',
                  'Este modelo no acepta imagen de referencia — solo se inyecta la descripción en el prompt. Para historias largas, cambia a Kling o Hailuo (hasta 5★).',
                )}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─────────── Internal: a single slot (character or location) ─────────── */

function CastSlot({
  icon,
  label,
  selected,
  onClear,
  renderTrigger,
}: {
  icon: React.ReactNode;
  label: string;
  selected: MotionStudioCharacter | MotionStudioLocation | null;
  onClear: () => void;
  renderTrigger: () => React.ReactNode;
}) {
  if (!selected) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          {icon}
          {label}
        </div>
        {renderTrigger()}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
        <Avatar className="h-9 w-9">
          {selected.reference_image_url && (
            <AvatarImage src={selected.reference_image_url} alt={selected.name} />
          )}
          <AvatarFallback className="text-[10px]">
            {selected.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{selected.name}</p>
          <p className="text-[10px] text-muted-foreground truncate">
            {selected.description?.slice(0, 60) || '—'}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClear}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function CharacterPicker({
  characters,
  loading,
  onPick,
  language,
}: {
  characters: MotionStudioCharacter[];
  loading: boolean;
  onPick: (c: MotionStudioCharacter) => void;
  language: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 h-9 border-dashed"
        >
          <Plus className="h-3.5 w-3.5" />
          {language === 'de' ? 'Charakter wählen' : language === 'es' ? 'Elegir personaje' : 'Pick character'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 max-h-[300px] overflow-y-auto" align="start">
        {loading ? (
          <p className="text-xs text-muted-foreground p-3">…</p>
        ) : characters.length === 0 ? (
          <div className="p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              {language === 'de'
                ? 'Noch keine Charaktere. Erstelle einen in der Library.'
                : 'No characters yet. Create one in the library.'}
            </p>
            <Link
              to="/motion-studio/library"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              onClick={() => setOpen(false)}
            >
              {language === 'de' ? 'Zur Library' : 'Open library'}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          characters.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-primary/5 text-left"
            >
              <Avatar className="h-7 w-7">
                {c.reference_image_url && <AvatarImage src={c.reference_image_url} alt={c.name} />}
                <AvatarFallback className="text-[10px]">
                  {c.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{c.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {c.description?.slice(0, 50) || '—'}
                </p>
              </div>
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

function LocationPicker({
  locations,
  loading,
  onPick,
  language,
}: {
  locations: MotionStudioLocation[];
  loading: boolean;
  onPick: (l: MotionStudioLocation) => void;
  language: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 h-9 border-dashed"
        >
          <Plus className="h-3.5 w-3.5" />
          {language === 'de' ? 'Location wählen' : language === 'es' ? 'Elegir ubicación' : 'Pick location'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 max-h-[300px] overflow-y-auto" align="start">
        {loading ? (
          <p className="text-xs text-muted-foreground p-3">…</p>
        ) : locations.length === 0 ? (
          <div className="p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              {language === 'de'
                ? 'Noch keine Locations. Erstelle eine in der Library.'
                : 'No locations yet. Create one in the library.'}
            </p>
            <Link
              to="/motion-studio/library"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              onClick={() => setOpen(false)}
            >
              {language === 'de' ? 'Zur Library' : 'Open library'}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          locations.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                onPick(l);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-primary/5 text-left"
            >
              <Avatar className="h-7 w-7">
                {l.reference_image_url && <AvatarImage src={l.reference_image_url} alt={l.name} />}
                <AvatarFallback className="text-[10px]">
                  <MapPin className="h-3 w-3" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{l.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {l.description?.slice(0, 50) || '—'}
                </p>
              </div>
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ─────────── Helpers exported for the Generator ─────────── */

export function buildCastPromptSuffix(
  character: MotionStudioCharacter | null | undefined,
  location: MotionStudioLocation | null | undefined,
): string {
  const lines: string[] = [];
  if (character) {
    lines.push(`Featuring ${character.name}: ${character.description}.`);
    if (character.signature_items?.trim()) {
      lines.push(`Signature wardrobe: ${character.signature_items}.`);
    }
  }
  if (location) {
    lines.push(`Setting — ${location.name}: ${location.description}.`);
    if (location.lighting_notes?.trim()) {
      lines.push(`Lighting: ${location.lighting_notes}.`);
    }
  }
  return lines.join(' ');
}
