import { X, User, CalendarDays, AlertTriangle, FileEdit, Eye } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import type { CalendarFilters } from '@/lib/calendar/filter-engine';
import { getLabel } from './filterLabels';

interface Props {
  filters: CalendarFilters;
  activeCount: number;
  totalCount: number;
  filteredCount: number;
  ownerNames?: Record<string, string>;
  onUpdate: <K extends keyof CalendarFilters>(key: K, value: CalendarFilters[K]) => void;
  onToggle: (key: 'statuses' | 'channels' | 'owners' | 'tags' | 'mediaTypes', value: string) => void;
  onReset: () => void;
  onApplyPreset: (patch: Partial<CalendarFilters>) => void;
}

export function CalendarFilterBar({
  filters,
  activeCount,
  totalCount,
  filteredCount,
  ownerNames = {},
  onUpdate,
  onToggle,
  onReset,
  onApplyPreset,
}: Props) {
  const { language } = useTranslation();
  const { user } = useAuth();
  const L = (k: any) => getLabel(language, k);

  const presets: Array<{ icon: any; label: string; patch: Partial<CalendarFilters> }> = [
    {
      icon: User,
      label: L('myPosts'),
      patch: user?.id ? { owners: [user.id] } : {},
    },
    {
      icon: CalendarDays,
      label: L('thisWeek'),
      patch: thisWeekPatch(),
    },
    {
      icon: Eye,
      label: L('needsReview'),
      patch: { statuses: ['review'] },
    },
    {
      icon: FileEdit,
      label: L('drafts'),
      patch: { statuses: ['draft', 'briefing', 'in_progress'] },
    },
    {
      icon: AlertTriangle,
      label: L('failedOnly'),
      patch: { statuses: ['failed'] },
    },
  ];

  const hasActive = activeCount > 0;

  return (
    <div className="space-y-2">
      {/* Quick presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">
          {L('savedFilters').toString()}:
        </span>
        {presets.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.label}
              onClick={() => onApplyPreset(p.patch)}
              disabled={Object.keys(p.patch).length === 0}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] bg-muted/30 border border-white/10 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-30"
            >
              <Icon className="w-3 h-3" />
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Active chips */}
      {hasActive && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-lg backdrop-blur-xl bg-card/40 border border-primary/20 shadow-[0_0_15px_hsla(43,90%,68%,0.08)]">
          <span className="text-[10px] text-muted-foreground">
            {L('showingFiltered')}
            <span className="text-primary font-semibold">{filteredCount}</span>
            {L('ofTotal')}
            <span className="text-foreground">{totalCount}</span>
          </span>

          {filters.search.trim() && (
            <Chip label={`"${filters.search.trim()}"`} onClear={() => onUpdate('search', '')} />
          )}
          {filters.statuses.map((s) => (
            <Chip key={`s-${s}`} label={s.replace('_', ' ')} onClear={() => onToggle('statuses', s)} />
          ))}
          {filters.channels.map((c) => (
            <Chip key={`c-${c}`} label={c} onClear={() => onToggle('channels', c)} />
          ))}
          {filters.mediaTypes.map((m) => (
            <Chip key={`m-${m}`} label={m} onClear={() => onToggle('mediaTypes', m)} />
          ))}
          {filters.owners.map((o) => (
            <Chip
              key={`o-${o}`}
              label={ownerNames[o] ?? o.slice(0, 8)}
              onClear={() => onToggle('owners', o)}
            />
          ))}
          {filters.tags.map((t) => (
            <Chip key={`t-${t}`} label={`#${t}`} onClear={() => onToggle('tags', t)} />
          ))}
          {(filters.dateFrom || filters.dateTo) && (
            <Chip
              label={`${filters.dateFrom ?? '…'} → ${filters.dateTo ?? '…'}`}
              onClear={() => {
                onUpdate('dateFrom', null);
                onUpdate('dateTo', null);
              }}
            />
          )}

          <button
            onClick={onReset}
            className="ml-auto text-[10px] text-muted-foreground hover:text-red-400 transition-colors"
          >
            {L('clearAll')}
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]',
        'bg-primary/15 text-primary border border-primary/30',
        'shadow-[0_0_8px_hsla(43,90%,68%,0.15)]'
      )}
    >
      <span className="capitalize">{label}</span>
      <button onClick={onClear} className="hover:text-red-400 transition-colors">
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  );
}

function thisWeekPatch(): Partial<CalendarFilters> {
  const now = new Date();
  const day = now.getDay() || 7; // Mon=1..Sun=7
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    dateFrom: monday.toISOString().slice(0, 10),
    dateTo: sunday.toISOString().slice(0, 10),
  };
}
