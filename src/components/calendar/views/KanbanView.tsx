import { useMemo, useState, useEffect, useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCenter,
} from "@dnd-kit/core";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/hooks/useTranslation";
import { format, formatDistanceToNowStrict, isPast } from "date-fns";
import { de, es, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Plus,
  Search,
  Filter,
  Settings2,
  GripVertical,
  MoreHorizontal,
  Calendar as CalendarIcon,
  Image as ImageIcon,
  Instagram,
  Facebook,
  Linkedin,
  Youtube,
  Music2,
  Twitter,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

interface Post {
  id: string;
  title?: string | null;
  channels: string[];
  status: string;
  start_at: string;
  brief?: string | null;
  owner_id?: string;
  assets_json?: any[] | null;
  assignees?: string[] | null;
  tags?: string[] | null;
}

interface KanbanViewProps {
  posts: Post[];
  onPostClick: (post: Post) => void;
  onStatusChange: (postId: string, newStatus: string) => void;
  onCreateInColumn?: (status: string) => void;
  readOnly?: boolean;
  selectedEventIds?: string[];
}

interface ColumnDef {
  key: string;
  accent: string; // hsl/hex used for gold glow line
  wipLimit: number | null;
}

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: "briefing", accent: "#94a3b8", wipLimit: null },
  { key: "in_progress", accent: "#60a5fa", wipLimit: 5 },
  { key: "review", accent: "#fbbf24", wipLimit: 5 },
  { key: "pending_approval", accent: "#fb923c", wipLimit: 8 },
  { key: "approved", accent: "#34d399", wipLimit: null },
  { key: "scheduled", accent: "#a78bfa", wipLimit: null },
  { key: "published", accent: "#F5C76A", wipLimit: null },
];

const STATUS_FALLBACK: Record<string, string> = {
  briefing: "Briefing",
  in_progress: "In Arbeit",
  review: "Review",
  pending_approval: "Zur Freigabe",
  approved: "Freigegeben",
  scheduled: "Geplant",
  published: "Veröffentlicht",
  draft: "Entwurf",
  failed: "Fehlgeschlagen",
};

const CHANNEL_ICON: Record<string, React.ComponentType<any>> = {
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  twitter: Twitter,
  youtube: Youtube,
  tiktok: Music2,
};

const CHANNEL_TINT: Record<string, string> = {
  instagram: "text-pink-400",
  facebook: "text-blue-400",
  linkedin: "text-sky-500",
  twitter: "text-sky-300",
  youtube: "text-red-400",
  tiktok: "text-white",
};

type SortMode = "date_asc" | "date_desc" | "updated";

interface BoardSettings {
  hidden: string[];
  sort: SortMode;
  limits: Record<string, number | null>;
}

const SETTINGS_KEY = "kanban:settings:v1";

function loadSettings(): BoardSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    hidden: ["approved", "scheduled"],
    sort: "date_asc",
    limits: Object.fromEntries(DEFAULT_COLUMNS.map((c) => [c.key, c.wipLimit])),
  };
}

function saveSettings(s: BoardSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

function getThumbnail(post: Post): string | null {
  const a = post.assets_json;
  if (!Array.isArray(a) || a.length === 0) return null;
  const first = a[0] as any;
  return first?.thumbnail_url || first?.thumb || first?.url || first?.src || null;
}

function pickLocale(lang: string) {
  if (lang === "de") return de;
  if (lang === "es") return es;
  return enUS;
}

export function KanbanView({
  posts,
  onPostClick,
  onStatusChange,
  onCreateInColumn,
  readOnly,
  selectedEventIds = [],
}: KanbanViewProps) {
  const { t, language } = useTranslation();
  const locale = pickLocale(language);

  const [settings, setSettings] = useState<BoardSettings>(() => loadSettings());
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);

  useEffect(() => saveSettings(settings), [settings]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  );

  const tStatus = (k: string) => {
    const v = t(`calendar.status.${k}`);
    if (typeof v === "string" && !v.includes(".")) return v;
    return STATUS_FALLBACK[k] || k;
  };

  const visibleColumns = useMemo(
    () => DEFAULT_COLUMNS.filter((c) => !settings.hidden.includes(c.key)),
    [settings.hidden]
  );

  const channels = useMemo(() => {
    const s = new Set<string>();
    posts.forEach((p) => p.channels?.forEach((c) => s.add(c.toLowerCase())));
    return Array.from(s).sort();
  }, [posts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts.filter((p) => {
      if (channelFilter.length > 0) {
        const has = p.channels?.some((c) => channelFilter.includes(c.toLowerCase()));
        if (!has) return false;
      }
      if (q) {
        const hay = `${p.title || ""} ${p.brief || ""} ${(p.tags || []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [posts, search, channelFilter]);

  const grouped = useMemo(() => {
    const map: Record<string, Post[]> = {};
    for (const col of DEFAULT_COLUMNS) map[col.key] = [];
    for (const p of filtered) {
      if (!map[p.status]) map[p.status] = [];
      map[p.status].push(p);
    }
    const sortFn = (a: Post, b: Post) => {
      const da = a.start_at ? new Date(a.start_at).getTime() : 0;
      const db = b.start_at ? new Date(b.start_at).getTime() : 0;
      if (settings.sort === "date_desc") return db - da;
      return da - db;
    };
    Object.keys(map).forEach((k) => map[k].sort(sortFn));
    return map;
  }, [filtered, settings.sort]);

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      setActiveId(null);
      setOverColumn(null);
      const id = String(e.active.id);
      const over = e.over?.id ? String(e.over.id) : null;
      if (!over) return;
      const newStatus = over.startsWith("col:") ? over.slice(4) : null;
      if (!newStatus) return;
      const post = posts.find((p) => p.id === id);
      if (!post || post.status === newStatus) return;
      if (post.status === "published" && newStatus !== "published") {
        if (!window.confirm(t("calendar.kanban.confirmUnpublish") as string || "Dieser Post ist bereits veröffentlicht. Wirklich zurücksetzen?")) return;
      }
      const limit = settings.limits[newStatus];
      const count = grouped[newStatus]?.length ?? 0;
      if (limit && count >= limit) {
        toast.warning(`WIP-Limit ${count}/${limit} überschritten — Karte wurde trotzdem verschoben.`);
      }
      onStatusChange(id, newStatus);
    },
    [posts, grouped, settings.limits, onStatusChange, t]
  );

  const activePost = activeId ? posts.find((p) => p.id === activeId) : null;

  const scrollerRef = (el: HTMLDivElement | null) => {
    (window as any).__kanbanScroller = el;
  };
  const scrollBy = (dx: number) => {
    const el = (window as any).__kanbanScroller as HTMLDivElement | null;
    el?.scrollBy({ left: dx, behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search") as string || "Suchen…"}
            className="pl-8 bg-background/40 backdrop-blur border-white/10"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 bg-background/40 backdrop-blur border-white/10">
              <Filter className="h-4 w-4" />
              Kanäle
              {channelFilter.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {channelFilter.length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 bg-popover/95 backdrop-blur border-white/10">
            <DropdownMenuLabel>Kanal-Filter</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {channels.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Keine Kanäle</div>
            )}
            {channels.map((c) => (
              <DropdownMenuCheckboxItem
                key={c}
                checked={channelFilter.includes(c)}
                onCheckedChange={(v) =>
                  setChannelFilter((prev) => (v ? [...prev, c] : prev.filter((x) => x !== c)))
                }
                className="capitalize"
              >
                {c}
              </DropdownMenuCheckboxItem>
            ))}
            {channelFilter.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setChannelFilter([])}>
                  Zurücksetzen
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 bg-background/40 backdrop-blur border-white/10">
              <Settings2 className="h-4 w-4" />
              Board
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 bg-popover/95 backdrop-blur border-white/10">
            <DropdownMenuLabel>Sortierung</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setSettings((s) => ({ ...s, sort: "date_asc" }))}>
              {settings.sort === "date_asc" ? "✓ " : ""}Datum aufsteigend
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSettings((s) => ({ ...s, sort: "date_desc" }))}>
              {settings.sort === "date_desc" ? "✓ " : ""}Datum absteigend
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Spalten</DropdownMenuLabel>
            {DEFAULT_COLUMNS.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.key}
                checked={!settings.hidden.includes(c.key)}
                onCheckedChange={(v) =>
                  setSettings((s) => ({
                    ...s,
                    hidden: v ? s.hidden.filter((k) => k !== c.key) : [...s.hidden, c.key],
                  }))
                }
              >
                {tStatus(c.key)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => scrollBy(-360)}
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => scrollBy(360)}
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={(e) => setOverColumn(e.over?.id ? String(e.over.id).replace(/^col:/, "") : null)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setOverColumn(null);
        }}
      >
        <div
          ref={scrollerRef}
          className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scroll-smooth"
        >
          {visibleColumns.map((col) => (
            <Column
              key={col.key}
              col={col}
              posts={grouped[col.key] || []}
              limit={settings.limits[col.key]}
              isOver={overColumn === col.key}
              onPostClick={onPostClick}
              onCreate={onCreateInColumn}
              readOnly={readOnly}
              selectedEventIds={selectedEventIds}
              label={tStatus(col.key)}
              locale={locale}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 180 }}>
          {activePost ? (
            <div className="rotate-2 opacity-95 pointer-events-none">
              <KanbanCard post={activePost} locale={locale} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

/* ----------------------------- Column ----------------------------- */

function Column({
  col,
  posts,
  limit,
  isOver,
  onPostClick,
  onCreate,
  readOnly,
  selectedEventIds,
  label,
  locale,
}: {
  col: ColumnDef;
  posts: Post[];
  limit: number | null;
  isOver: boolean;
  onPostClick: (p: Post) => void;
  onCreate?: (status: string) => void;
  readOnly?: boolean;
  selectedEventIds: string[];
  label: string;
  locale: any;
}) {
  const { setNodeRef } = useDroppable({ id: `col:${col.key}` });
  const count = posts.length;
  const overLimit = limit != null && count > limit;

  return (
    <div className="flex-shrink-0 w-[300px] snap-start">
      {/* Header */}
      <div
        className="mb-3 flex items-center justify-between rounded-lg px-3 py-2 border border-white/5"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
          borderLeft: `2px solid ${col.accent}`,
          boxShadow: `0 0 18px -8px ${col.accent}`,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-serif text-sm tracking-wide truncate" style={{ color: col.accent }}>
            {label}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          {limit ? (
            <Badge
              variant={overLimit ? "destructive" : "secondary"}
              className="h-5 px-1.5 text-[10px] tabular-nums"
              title={`WIP-Limit ${count}/${limit}`}
            >
              {count}/{limit}
              {overLimit && <AlertTriangle className="ml-1 h-3 w-3" />}
            </Badge>
          ) : (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] tabular-nums">
              {count}
            </Badge>
          )}
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          "space-y-2 min-h-[260px] p-2 rounded-xl border border-white/5 transition-colors",
          "bg-background/30 backdrop-blur-sm",
          isOver && "ring-2 ring-offset-0",
          isOver && "bg-background/50"
        )}
        style={isOver ? { boxShadow: `inset 0 0 0 1px ${col.accent}66` } : undefined}
      >
        {posts.length === 0 ? (
          <div className="h-[200px] flex flex-col items-center justify-center text-center text-xs text-muted-foreground/60 select-none">
            <ImageIcon className="h-6 w-6 mb-2 opacity-40" />
            <div>Keine Karten</div>
            <div className="mt-0.5 opacity-70">Ziehe Karten hierher</div>
          </div>
        ) : (
          posts.map((p) => (
            <DraggableCard
              key={p.id}
              post={p}
              readOnly={readOnly}
              selected={selectedEventIds.includes(p.id)}
              onClick={() => onPostClick(p)}
              locale={locale}
            />
          ))
        )}

        {!readOnly && onCreate && (
          <button
            onClick={() => onCreate(col.key)}
            className={cn(
              "w-full mt-1 flex items-center justify-center gap-1.5 py-2 rounded-lg",
              "text-xs text-muted-foreground hover:text-foreground",
              "border border-dashed border-white/10 hover:border-white/30",
              "bg-transparent hover:bg-white/[0.03] transition"
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            Karte hinzufügen
          </button>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Card ----------------------------- */

function DraggableCard({
  post,
  readOnly,
  selected,
  onClick,
  locale,
}: {
  post: Post;
  readOnly?: boolean;
  selected: boolean;
  onClick: () => void;
  locale: any;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: post.id,
    disabled: readOnly,
  });

  return (
    <div ref={setNodeRef} style={{ opacity: isDragging ? 0.35 : 1 }}>
      <KanbanCard
        post={post}
        onClick={onClick}
        selected={selected}
        dragHandleProps={{ ...attributes, ...listeners }}
        locale={locale}
      />
    </div>
  );
}

function KanbanCard({
  post,
  onClick,
  selected,
  dragging,
  dragHandleProps,
  locale,
}: {
  post: Post;
  onClick?: () => void;
  selected?: boolean;
  dragging?: boolean;
  dragHandleProps?: any;
  locale: any;
}) {
  const thumb = getThumbnail(post);
  const start = post.start_at ? new Date(post.start_at) : null;
  const overdue = start ? isPast(start) && post.status !== "published" : false;
  const rel = start
    ? formatDistanceToNowStrict(start, { addSuffix: true, locale })
    : null;

  return (
    <Card
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden p-0 cursor-pointer",
        "bg-card/70 backdrop-blur border-white/10",
        "hover:border-[color:hsl(var(--primary))] hover:shadow-[0_0_24px_-6px_hsl(var(--primary)/0.45)]",
        "transition-all",
        selected && "ring-2 ring-primary",
        dragging && "shadow-[0_0_36px_-4px_hsl(var(--primary)/0.6)]"
      )}
    >
      {/* Drag handle */}
      {dragHandleProps && (
        <button
          {...dragHandleProps}
          className="absolute left-1 top-1 z-10 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition cursor-grab active:cursor-grabbing"
          aria-label="Drag"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}

      {/* Thumbnail */}
      {thumb ? (
        <div className="aspect-[16/9] w-full bg-black/40 overflow-hidden border-b border-white/5">
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => ((e.currentTarget.style.display = "none"))}
          />
        </div>
      ) : null}

      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <div className="font-medium text-sm leading-snug line-clamp-2 flex-1">
            {post.title || "Untitled"}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="p-1 -mr-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition"
                aria-label="Aktionen"
              >
                <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="bg-popover/95 backdrop-blur border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem onClick={onClick}>Öffnen / Bearbeiten</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Channels */}
        {post.channels?.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {post.channels.slice(0, 5).map((c) => {
              const key = c.toLowerCase();
              const Icon = CHANNEL_ICON[key];
              const tint = CHANNEL_TINT[key] || "text-muted-foreground";
              return (
                <div
                  key={c}
                  title={c}
                  className={cn(
                    "h-5 w-5 rounded-full flex items-center justify-center bg-white/5 border border-white/10",
                    tint
                  )}
                >
                  {Icon ? <Icon className="h-3 w-3" /> : <span className="text-[9px]">{c[0]}</span>}
                </div>
              );
            })}
            {post.channels.length > 5 && (
              <span className="text-[10px] text-muted-foreground">+{post.channels.length - 5}</span>
            )}
          </div>
        )}

        {post.brief && (
          <p className="text-xs text-muted-foreground line-clamp-2">{post.brief}</p>
        )}

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {post.tags.slice(0, 3).map((tg) => (
              <span
                key={tg}
                className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-muted-foreground"
              >
                #{tg}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          {start ? (
            <div
              className={cn(
                "flex items-center gap-1 text-[11px]",
                overdue ? "text-red-400" : "text-muted-foreground"
              )}
              title={format(start, "PPpp", { locale })}
            >
              <CalendarIcon className="h-3 w-3" />
              <span>{rel}</span>
            </div>
          ) : (
            <span />
          )}

          {/* Assignee avatars */}
          {post.assignees && post.assignees.length > 0 && (
            <div className="flex -space-x-1.5">
              {post.assignees.slice(0, 3).map((a, i) => (
                <div
                  key={a + i}
                  title={a}
                  className="h-5 w-5 rounded-full border border-background bg-gradient-to-br from-amber-400/60 to-amber-700/60 text-[9px] flex items-center justify-center text-background font-semibold uppercase"
                >
                  {(a || "?").slice(0, 1)}
                </div>
              ))}
              {post.assignees.length > 3 && (
                <div className="h-5 w-5 rounded-full border border-background bg-muted text-[9px] flex items-center justify-center">
                  +{post.assignees.length - 3}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
