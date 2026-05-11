/**
 * PresetGrid — visual picker for Shot Director options.
 *
 * Renders a 2-column grid of image thumbnails (Artlist Studio-style)
 * with label overlay. Used inside ShotDirectorPanel popovers and any
 * other surface that needs to pick from a list of cinematic options.
 */

import { Check, X } from 'lucide-react';
import type { ShotCategory, ShotOption } from '@/config/shotDirector';
import { getPresetThumbnail } from '@/config/studioPresetThumbnails';

type Lang = 'en' | 'de' | 'es';

interface PresetGridProps {
  category: ShotCategory;
  options: ShotOption[];
  selectedId?: string;
  onSelect: (id: string | null) => void;
  lang: Lang;
}

export function PresetGrid({ category, options, selectedId, onSelect, lang }: PresetGridProps) {
  return (
    <div className="space-y-2">
      {selectedId && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-destructive/10 text-destructive text-[11px] flex items-center gap-2"
        >
          <X className="h-3 w-3" />
          {lang === 'de' ? 'Auswahl entfernen' : lang === 'es' ? 'Quitar selección' : 'Clear selection'}
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => {
          const isActive = selectedId === opt.id;
          const thumb = getPresetThumbnail(category, opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelect(opt.id)}
              title={opt.description[lang]}
              className={`group relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                isActive
                  ? 'border-primary ring-2 ring-primary/40 shadow-[0_0_20px_-4px_hsl(var(--primary)/0.5)]'
                  : 'border-border/40 hover:border-primary/60'
              }`}
            >
              {thumb ? (
                <img
                  src={thumb}
                  alt={opt.label[lang]}
                  loading="lazy"
                  width={512}
                  height={512}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="absolute inset-0 bg-muted/40 flex items-center justify-center text-[10px] text-muted-foreground">
                  {opt.label[lang]}
                </div>
              )}

              {/* Gradient overlay for legibility */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

              {/* Active checkmark */}
              {isActive && (
                <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center shadow-lg">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              )}

              {/* Label */}
              <div className="absolute inset-x-0 bottom-0 p-2">
                <div
                  className={`text-[11px] font-medium leading-tight ${
                    isActive ? 'text-primary-foreground' : 'text-white'
                  }`}
                >
                  {opt.label[lang]}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
