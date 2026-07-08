// Unified per-scene asset picker for the Composer storyboard.
//
// Visually a continuation of the existing CharacterCastPicker — same chip-row
// look — but adds three additional rows for non-character world assets:
//
//   Cast       → max 4   (delegated to <CharacterCastPicker/>)
//   Location   → max 1   (brand_locations)
//   Architect. → max 1   (brand_buildings)
//   Props      → max 3   (brand_props)
//
// Selection is persisted by injecting slugified @-mentions into the scene
// prompt via `applySceneAssetsToPrompt`. The Mention-Resolver
// (`useUnifiedMentionLibrary` + `resolveMentions`) then forwards each
// asset's reference_image_url to the render pipeline (Vidu Q2,
// Hailuo i2v, Nano Banana scene anchor) — no schema change needed.

import { useMemo } from 'react';
import {
  Plus, X, MapPin, Building2, Package, Sparkles,
} from 'lucide-react';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CharacterCastPicker } from './CharacterCastPicker';
import {
  applySceneAssetsToPrompt,
  readSceneAssetSlugs,
  slugifyAssetName,
  type SceneAssetMention,
} from '@/lib/motion-studio/applySceneAssetsToPrompt';
import type {
  CharacterShot,
  ComposerCharacter,
} from '@/types/video-composer';

type Lang = 'en' | 'de' | 'es';

interface AssetItem {
  id: string;
  name: string;
  reference_image_url?: string | null;
}

interface AssetFamilyConfig {
  key: 'location' | 'building' | 'prop';
  icon: typeof MapPin;
  iconClass: string;
  ringClass: string;
  bgClass: string;
  max: number;
  label: Record<Lang, string>;
  empty: Record<Lang, string>;
  add: Record<Lang, string>;
}

const FAMILIES: AssetFamilyConfig[] = [
  {
    key: 'location',
    icon: MapPin,
    iconClass: 'text-cyan-300',
    ringClass: 'border-cyan-500/40',
    bgClass: 'bg-cyan-500/5',
    max: 1,
    label: { en: 'Location:', de: 'Location:', es: 'Lugar:' },
    empty: { en: 'No location set', de: 'Keine Location', es: 'Sin lugar' },
    add: { en: 'Add location', de: 'Location wählen', es: 'Añadir lugar' },
  },
  {
    key: 'building',
    icon: Building2,
    iconClass: 'text-amber-300',
    ringClass: 'border-amber-500/40',
    bgClass: 'bg-amber-500/5',
    max: 1,
    label: { en: 'Architecture:', de: 'Bauwerk:', es: 'Arquitectura:' },
    empty: { en: 'No building set', de: 'Kein Bauwerk', es: 'Sin edificio' },
    add: { en: 'Add building', de: 'Bauwerk wählen', es: 'Añadir edificio' },
  },
  {
    key: 'prop',
    icon: Package,
    iconClass: 'text-emerald-300',
    ringClass: 'border-emerald-500/40',
    bgClass: 'bg-emerald-500/5',
    max: 3,
    label: { en: 'Props:', de: 'Props:', es: 'Objetos:' },
    empty: { en: 'No props', de: 'Keine Props', es: 'Sin objetos' },
    add: { en: 'Add prop', de: 'Prop wählen', es: 'Añadir objeto' },
  },
];

export interface UnifiedAssetPickerProps {
  /** Cast pass-through */
  characters: ComposerCharacter[];
  libraryCharacters?: ComposerCharacter[];
  onAddToBriefing?: (character: ComposerCharacter) => void;
  cast?: CharacterShot[];
  legacyCast?: CharacterShot;
  onCastChange: (next: CharacterShot[]) => void;

  /** World-asset pools (already loaded by SceneCard parent) */
  locations: AssetItem[];
  buildings: AssetItem[];
  props: AssetItem[];

  /** Current scene prompt — used to read & write the leading mention block. */
  prompt: string;
  onPromptChange: (next: string) => void;

  /** v211 — optional canonical scene-asset callback. When provided, the picker
   *  emits `{ id, type, name }[]` alongside the prompt-string update so the
   *  parent can persist `composer_scenes.scene_assets` (v202 canonical column). */
  onSceneAssetsChange?: (assets: SceneAssetMention[]) => void;

  language?: Lang;
}

function pickByFamily(
  family: AssetFamilyConfig['key'],
  pools: { locations: AssetItem[]; buildings: AssetItem[]; props: AssetItem[] },
): AssetItem[] {
  if (family === 'location') return pools.locations;
  if (family === 'building') return pools.buildings;
  return pools.props;
}

export function UnifiedAssetPicker({
  characters,
  libraryCharacters,
  onAddToBriefing,
  cast,
  legacyCast,
  onCastChange,
  locations,
  buildings,
  props: propsList,
  prompt,
  onPromptChange,
  onSceneAssetsChange,
  language = 'en',
}: UnifiedAssetPickerProps) {
  const lang: Lang = language;
  const pools = { locations, buildings, props: propsList };

  // Slugs currently injected at the head of the prompt.
  const activeSlugs = useMemo(() => readSceneAssetSlugs(prompt), [prompt]);

  // Resolve which asset is selected per family by matching slugs to
  // slugified asset names (first match wins).
  const selectedByFamily = useMemo(() => {
    const result: Record<AssetFamilyConfig['key'], AssetItem[]> = {
      location: [],
      building: [],
      prop: [],
    };
    for (const fam of FAMILIES) {
      const pool = pickByFamily(fam.key, pools);
      const matched: AssetItem[] = [];
      for (const slug of activeSlugs) {
        const hit = pool.find((a) => slugifyAssetName(a.name) === slug);
        if (hit && !matched.some((m) => m.id === hit.id)) matched.push(hit);
        if (matched.length >= fam.max) break;
      }
      result[fam.key] = matched;
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlugs.join('|'), locations, buildings, propsList]);

  /** Rewrites the prompt's leading scene-asset block with the union of all
   *  three families, preserving order: locations → buildings → props.
   *  v211: mentions carry `{ id, type, name }` so downstream resolvers lock
   *  by UUID instead of slug-matching. */
  const writeSelection = (next: Record<AssetFamilyConfig['key'], AssetItem[]>) => {
    const flat: SceneAssetMention[] = [
      ...next.location.map((a) => ({ name: a.name, id: a.id, type: 'location' as const })),
      ...next.building.map((a) => ({ name: a.name, id: a.id, type: 'building' as const })),
      ...next.prop.map((a) => ({ name: a.name, id: a.id, type: 'prop' as const })),
    ];
    onPromptChange(applySceneAssetsToPrompt(prompt, flat));
    onSceneAssetsChange?.(flat);
  };

  const addAsset = (fam: AssetFamilyConfig, asset: AssetItem) => {
    const current = { ...selectedByFamily };
    const existing = current[fam.key];
    if (existing.some((e) => e.id === asset.id)) return;
    current[fam.key] = [...existing, asset].slice(0, fam.max);
    writeSelection(current);
  };

  const removeAsset = (fam: AssetFamilyConfig, assetId: string) => {
    const current = { ...selectedByFamily };
    current[fam.key] = current[fam.key].filter((a) => a.id !== assetId);
    writeSelection(current);
  };

  return (
    <div className="space-y-2">
      {/* Cast row — unchanged behaviour */}
      <CharacterCastPicker
        characters={characters}
        libraryCharacters={libraryCharacters}
        onAddToBriefing={onAddToBriefing}
        value={cast}
        legacyValue={legacyCast}
        onChange={onCastChange}
        language={lang}
      />

      {/* World-asset rows */}
      {FAMILIES.map((fam) => {
        const pool = pickByFamily(fam.key, pools);
        // Hide the row entirely when there's nothing to pick AND nothing chosen.
        if (pool.length === 0 && selectedByFamily[fam.key].length === 0) return null;

        const selected = selectedByFamily[fam.key];
        const available = pool.filter(
          (a) => !selected.some((s) => s.id === a.id),
        );
        const Icon = fam.icon;
        const canAddMore = selected.length < fam.max && available.length > 0;

        return (
          <div key={fam.key} className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Icon className={`h-3 w-3 ${fam.iconClass}`} />
              {fam.label[lang]}
            </span>

            {selected.length === 0 && (
              <span className="text-[10px] text-muted-foreground italic">
                {fam.empty[lang]}
              </span>
            )}

            {selected.map((asset) => (
              <div
                key={asset.id}
                className={`inline-flex items-center gap-1 rounded-full border ${fam.ringClass} ${fam.bgClass} pl-0.5 pr-1 py-0.5`}
                title={`@${slugifyAssetName(asset.name)}`}
              >
                {asset.reference_image_url ? (
                  <img
                    src={asset.reference_image_url}
                    alt={asset.name}
                    className="h-5 w-5 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center">
                    <Icon className={`h-3 w-3 ${fam.iconClass}`} />
                  </div>
                )}
                <span className="text-[10px] font-medium px-1">{asset.name}</span>
                <button
                  type="button"
                  onClick={() => removeAsset(fam, asset.id)}
                  className="ml-0.5 h-4 w-4 rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive flex items-center justify-center"
                  aria-label="remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}

            {canAddMore && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px] gap-1 border-dashed"
                  >
                    <Plus className="h-3 w-3" />
                    {fam.add[lang]}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-1 max-h-72 overflow-y-auto">
                  <div className="space-y-0.5">
                    {available.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => addAsset(fam, a)}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-muted text-left"
                      >
                        {a.reference_image_url ? (
                          <img
                            src={a.reference_image_url}
                            alt={a.name}
                            className="h-7 w-7 rounded object-cover"
                          />
                        ) : (
                          <div className="h-7 w-7 rounded bg-muted flex items-center justify-center">
                            <Icon className={`h-3.5 w-3.5 ${fam.iconClass}`} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs truncate">{a.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            @{slugifyAssetName(a.name)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-border/40 my-1" />
                  <a
                    href="/library"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-muted text-left text-xs text-primary"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {lang === 'de'
                      ? 'In der Library erstellen…'
                      : lang === 'es'
                      ? 'Crear en la librería…'
                      : 'Create in Library…'}
                  </a>
                </PopoverContent>
              </Popover>
            )}
          </div>
        );
      })}
    </div>
  );
}
