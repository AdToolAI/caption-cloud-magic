import { useState } from 'react';
import { Filter, Search, X, Save, Bookmark, Trash2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';
import type { CalendarFilters, MediaType } from '@/lib/calendar/filter-engine';
import type { SavedFilter } from '@/hooks/useCalendarFilters';
import { FILTER_LABELS, getLabel } from './filterLabels';

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  briefing: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  in_progress: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  review: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  approved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  scheduled: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  published: 'bg-green-500/20 text-green-300 border-green-500/30',
  failed: 'bg-red-500/20 text-red-300 border-red-500/30',
};

const ALL_STATUSES = ['draft', 'briefing', 'in_progress', 'review', 'approved', 'scheduled', 'published', 'failed'];
const ALL_CHANNELS = ['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin', 'x'];
const ALL_MEDIA: MediaType[] = ['image', 'video', 'carousel', 'text'];

interface Props {
  filters: CalendarFilters;
  options: { statuses: string[]; channels: string[]; owners: string[]; tags: string[] };
  saved: SavedFilter[];
  activeCount: number;
  onToggle: (key: 'statuses' | 'channels' | 'owners' | 'tags' | 'mediaTypes', value: string) => void;
  onUpdate: <K extends keyof CalendarFilters>(key: K, value: CalendarFilters[K]) => void;
  onReset: () => void;
  onSave: (name: string) => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  ownerNames?: Record<string, string>;
}

export function CalendarFilterPopover({
  filters,
  options,
  saved,
  activeCount,
  onToggle,
  onUpdate,
  onReset,
  onSave,
  onLoad,
  onDelete,
  ownerNames = {},
}: Props) {
  const { language } = useTranslation();
  const L = (k: keyof typeof FILTER_LABELS) => getLabel(language, k);
  const [open, setOpen] = useState(false);
  const [savingName, setSavingName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const statusList = Array.from(new Set([...ALL_STATUSES, ...options.statuses]));
  const channelList = Array.from(new Set([...ALL_CHANNELS, ...options.channels]));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-8 px-2 bg-muted/30 border-white/10 hover:border-primary/40 hover:bg-primary/10 relative',
            activeCount > 0 && 'border-primary/60 bg-primary/10 text-primary'
          )}
        >
          <Filter className="w-3.5 h-3.5" />
          {activeCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-[0_0_8px_hsla(43,90%,68%,0.6)]">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[420px] max-h-[80vh] overflow-y-auto backdrop-blur-xl bg-popover/95 border-white/10 p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 sticky top-0 bg-popover/95 backdrop-blur-xl z-10">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">{L('title')}</span>
            {activeCount > 0 && (
              <Badge variant="outline" className="h-5 text-[10px] border-primary/40 text-primary">
                {activeCount} {L('active')}
              </Badge>
            )}
          </div>
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onReset} className="h-7 px-2 text-xs">
              <RotateCcw className="w-3 h-3 mr-1" /> {L('reset')}
            </Button>
          )}
        </div>

        <div className="p-4 space-y-5">
          {/* Search */}
          <div className="space-y-2">
            <Label>{L('search')}</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={filters.search}
                onChange={(e) => onUpdate('search', e.target.value)}
                placeholder={L('searchPlaceholder')}
                className="h-8 pl-8 text-xs bg-muted/30 border-white/10"
              />
            </div>
          </div>

          {/* Date range */}
          <div className="space-y-2">
            <Label>{L('dateRange')}</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              <PresetChip label={L('today')} onClick={() => applyDatePreset(0, onUpdate)} />
              <PresetChip label={L('week7')} onClick={() => applyDatePreset(7, onUpdate)} />
              <PresetChip label={L('days30')} onClick={() => applyDatePreset(30, onUpdate)} />
              <PresetChip
                label={L('clear')}
                onClick={() => {
                  onUpdate('dateFrom', null);
                  onUpdate('dateTo', null);
                }}
              />
            </div>
            <div className="flex gap-2">
              <Input
                type="date"
                value={filters.dateFrom ?? ''}
                onChange={(e) => onUpdate('dateFrom', e.target.value || null)}
                className="h-8 text-xs bg-muted/30 border-white/10"
              />
              <Input
                type="date"
                value={filters.dateTo ?? ''}
                onChange={(e) => onUpdate('dateTo', e.target.value || null)}
                className="h-8 text-xs bg-muted/30 border-white/10"
              />
            </div>
          </div>

          {/* Status */}
          <Section title={L('status')}>
            <div className="flex flex-wrap gap-1.5">
              {statusList.map((s) => {
                const active = filters.statuses.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onToggle('statuses', s)}
                    className={cn(
                      'px-2 py-1 rounded-md text-[11px] border transition-all',
                      active
                        ? STATUS_COLOR[s] ?? 'bg-primary/20 text-primary border-primary/40'
                        : 'bg-muted/20 text-muted-foreground border-white/10 hover:border-white/30'
                    )}
                  >
                    {s.replace('_', ' ')}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Channels */}
          <Section title={L('channels')}>
            <div className="flex flex-wrap gap-1.5">
              {channelList.map((c) => {
                const active = filters.channels.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onToggle('channels', c)}
                    className={cn(
                      'px-2 py-1 rounded-md text-[11px] border capitalize transition-all',
                      active
                        ? 'bg-primary/20 text-primary border-primary/40'
                        : 'bg-muted/20 text-muted-foreground border-white/10 hover:border-white/30'
                    )}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Media types */}
          <Section title={L('mediaType')}>
            <div className="flex flex-wrap gap-1.5">
              {ALL_MEDIA.map((m) => {
                const active = filters.mediaTypes.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onToggle('mediaTypes', m)}
                    className={cn(
                      'px-2 py-1 rounded-md text-[11px] border capitalize transition-all',
                      active
                        ? 'bg-primary/20 text-primary border-primary/40'
                        : 'bg-muted/20 text-muted-foreground border-white/10 hover:border-white/30'
                    )}
                  >
                    {L(`media_${m}` as any) ?? m}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Owners (only show if any exist) */}
          {options.owners.length > 0 && (
            <Section title={L('owner')}>
              <div className="flex flex-wrap gap-1.5">
                {options.owners.map((o) => {
                  const active = filters.owners.includes(o);
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => onToggle('owners', o)}
                      className={cn(
                        'px-2 py-1 rounded-md text-[11px] border transition-all max-w-[200px] truncate',
                        active
                          ? 'bg-primary/20 text-primary border-primary/40'
                          : 'bg-muted/20 text-muted-foreground border-white/10 hover:border-white/30'
                      )}
                      title={ownerNames[o] ?? o}
                    >
                      {ownerNames[o] ?? `${o.slice(0, 8)}…`}
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Tags */}
          {options.tags.length > 0 && (
            <Section title={L('tags')}>
              <div className="flex flex-wrap gap-1.5">
                {options.tags.map((tag) => {
                  const active = filters.tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => onToggle('tags', tag)}
                      className={cn(
                        'px-2 py-1 rounded-md text-[11px] border transition-all',
                        active
                          ? 'bg-primary/20 text-primary border-primary/40'
                          : 'bg-muted/20 text-muted-foreground border-white/10 hover:border-white/30'
                      )}
                    >
                      #{tag}
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Saved filters */}
          <Separator className="bg-white/10" />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                <Bookmark className="w-3 h-3 inline mr-1" />
                {L('savedFilters')}
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSaveInput((v) => !v)}
                disabled={activeCount === 0}
                className="h-6 px-2 text-[10px]"
              >
                <Save className="w-3 h-3 mr-1" />
                {L('save')}
              </Button>
            </div>
            {showSaveInput && (
              <div className="flex gap-2">
                <Input
                  value={savingName}
                  onChange={(e) => setSavingName(e.target.value)}
                  placeholder={L('savePlaceholder')}
                  className="h-7 text-xs bg-muted/30 border-white/10"
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={() => {
                    onSave(savingName);
                    setSavingName('');
                    setShowSaveInput(false);
                  }}
                  className="h-7 text-[10px]"
                >
                  OK
                </Button>
              </div>
            )}
            {saved.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic">{L('noSaved')}</p>
            ) : (
              <div className="space-y-1">
                {saved.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 px-2 py-1 rounded-md bg-muted/20 border border-white/5"
                  >
                    <button
                      onClick={() => {
                        onLoad(s.id);
                        setOpen(false);
                      }}
                      className="flex-1 text-left text-xs hover:text-primary truncate"
                    >
                      {s.name}
                    </button>
                    <button
                      onClick={() => onDelete(s.id)}
                      className="text-muted-foreground hover:text-red-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function applyDatePreset(
  days: number,
  onUpdate: <K extends keyof CalendarFilters>(key: K, value: CalendarFilters[K]) => void
) {
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const to = new Date(today.getTime() + days * 86400000).toISOString().slice(0, 10);
  onUpdate('dateFrom', from);
  onUpdate('dateTo', to);
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{children}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{title}</Label>
      {children}
    </div>
  );
}

function PresetChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-0.5 rounded-md text-[10px] bg-muted/30 border border-white/10 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
    >
      {label}
    </button>
  );
}
