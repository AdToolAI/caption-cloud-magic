/**
 * Pure calendar filter engine.
 * Applied client-side to an in-memory list of events.
 */

export type MediaType = 'image' | 'video' | 'carousel' | 'text';

export interface CalendarFilters {
  search: string;
  statuses: string[];
  channels: string[];
  owners: string[];
  tags: string[];
  mediaTypes: MediaType[];
  /** ISO date strings (inclusive) */
  dateFrom: string | null;
  dateTo: string | null;
}

export const EMPTY_FILTERS: CalendarFilters = {
  search: '',
  statuses: [],
  channels: [],
  owners: [],
  tags: [],
  mediaTypes: [],
  dateFrom: null,
  dateTo: null,
};

export function isEmptyFilters(f: CalendarFilters): boolean {
  return (
    !f.search.trim() &&
    f.statuses.length === 0 &&
    f.channels.length === 0 &&
    f.owners.length === 0 &&
    f.tags.length === 0 &&
    f.mediaTypes.length === 0 &&
    !f.dateFrom &&
    !f.dateTo
  );
}

export function countActiveFilters(f: CalendarFilters): number {
  let n = 0;
  if (f.search.trim()) n++;
  if (f.statuses.length) n++;
  if (f.channels.length) n++;
  if (f.owners.length) n++;
  if (f.tags.length) n++;
  if (f.mediaTypes.length) n++;
  if (f.dateFrom || f.dateTo) n++;
  return n;
}

function detectMediaType(assets: any): MediaType {
  if (!Array.isArray(assets) || assets.length === 0) return 'text';
  if (assets.length > 1) return 'carousel';
  const a = assets[0] || {};
  const t = (a.type || a.kind || a.mime_type || '').toString().toLowerCase();
  const url = (a.url || a.src || '').toString().toLowerCase();
  if (t.includes('video') || /\.(mp4|mov|webm|m4v)(\?|$)/.test(url)) return 'video';
  if (t.includes('image') || /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/.test(url)) return 'image';
  return 'image';
}

export interface FilterableEvent {
  id: string;
  title?: string | null;
  caption?: string | null;
  brief?: string | null;
  status: string;
  channels?: string[] | null;
  owner_id?: string | null;
  assignees?: string[] | null;
  tags?: string[] | null;
  start_at?: string | null;
  assets_json?: any;
}

export function applyFilters<T extends FilterableEvent>(
  events: T[],
  f: CalendarFilters
): T[] {
  if (isEmptyFilters(f)) return events;

  const q = f.search.trim().toLowerCase();
  const from = f.dateFrom ? new Date(f.dateFrom).getTime() : null;
  const to = f.dateTo ? new Date(f.dateTo).getTime() + 24 * 3600 * 1000 - 1 : null;

  return events.filter((e) => {
    if (q) {
      const hay = `${e.title ?? ''} ${e.caption ?? ''} ${e.brief ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.statuses.length && !f.statuses.includes(e.status)) return false;
    if (f.channels.length) {
      const ch = e.channels ?? [];
      if (!f.channels.some((c) => ch.includes(c))) return false;
    }
    if (f.owners.length) {
      const people = [e.owner_id, ...(e.assignees ?? [])].filter(Boolean) as string[];
      if (!f.owners.some((o) => people.includes(o))) return false;
    }
    if (f.tags.length) {
      const tags = e.tags ?? [];
      if (!f.tags.some((t) => tags.includes(t))) return false;
    }
    if (f.mediaTypes.length) {
      const mt = detectMediaType(e.assets_json);
      if (!f.mediaTypes.includes(mt)) return false;
    }
    if (from || to) {
      if (!e.start_at) return false;
      const ts = new Date(e.start_at).getTime();
      if (from && ts < from) return false;
      if (to && ts > to) return false;
    }
    return true;
  });
}

/** Build distinct option lists from current event set. */
export function deriveFilterOptions<T extends FilterableEvent>(events: T[]) {
  const statuses = new Set<string>();
  const channels = new Set<string>();
  const owners = new Set<string>();
  const tags = new Set<string>();
  for (const e of events) {
    if (e.status) statuses.add(e.status);
    (e.channels ?? []).forEach((c) => c && channels.add(c));
    if (e.owner_id) owners.add(e.owner_id);
    (e.assignees ?? []).forEach((a) => a && owners.add(a));
    (e.tags ?? []).forEach((t) => t && tags.add(t));
  }
  return {
    statuses: Array.from(statuses).sort(),
    channels: Array.from(channels).sort(),
    owners: Array.from(owners).sort(),
    tags: Array.from(tags).sort(),
  };
}
