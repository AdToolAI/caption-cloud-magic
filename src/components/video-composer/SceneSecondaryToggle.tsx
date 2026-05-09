/**
 * SceneSecondaryToggle — Phase 3 of the "Studio Set" simplification.
 *
 * Renders the "Mehr ▾ / Weniger ▴" footer button that toggles the visibility
 * of all secondary settings on a SceneCard (Effects, Character-Anchor + Face-
 * Lock, Lip-Sync, Reference image + Still-Frame Studio, hard-cut hint).
 *
 * When the drawer is closed, this button surfaces small "active pills" so the
 * user can still see at a glance which sub-features are switched on without
 * having to expand the drawer.
 */
import { ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type Lang = 'de' | 'en' | 'es';

export interface SecondarySummary {
  effectsCount: number;
  anchorLabel: string | null;
  faceLock: boolean;
  lipSyncOn: boolean;
  hasReferenceImage: boolean;
}

interface Props {
  language: Lang;
  open: boolean;
  onToggle: () => void;
  summary: SecondarySummary;
}

const t = {
  de: { more: 'Mehr', less: 'Weniger', label: 'Erweiterte Optionen' },
  en: { more: 'More', less: 'Less', label: 'Advanced options' },
  es: { more: 'Más', less: 'Menos', label: 'Opciones avanzadas' },
} as const;

export default function SceneSecondaryToggle({
  language, open, onToggle, summary,
}: Props) {
  const L = t[language];
  const pills: string[] = [];
  if (summary.effectsCount > 0) pills.push(`${summary.effectsCount} Fx`);
  if (summary.anchorLabel) pills.push(summary.anchorLabel);
  if (summary.faceLock) pills.push('Face-Lock');
  if (summary.lipSyncOn) pills.push('Lip-Sync');
  if (summary.hasReferenceImage) pills.push(language === 'de' ? 'Ref-Bild' : language === 'es' ? 'Ref-img' : 'Ref-img');

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 hover:bg-background/70 hover:border-primary/40 px-2.5 py-1.5 text-[10px] text-muted-foreground transition-colors"
      title={L.label}
    >
      <span className="flex items-center gap-1.5">
        <Settings2 className="h-3 w-3" />
        <span className="font-medium">{open ? L.less : L.more}</span>
        {!open && pills.length > 0 && (
          <span className="flex flex-wrap items-center gap-1 ml-1">
            {pills.map((p) => (
              <Badge
                key={p}
                variant="outline"
                className="h-4 px-1 text-[9px] py-0 border-primary/30 bg-primary/5 text-primary/90"
              >
                {p}
              </Badge>
            ))}
          </span>
        )}
      </span>
      {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
    </button>
  );
}
