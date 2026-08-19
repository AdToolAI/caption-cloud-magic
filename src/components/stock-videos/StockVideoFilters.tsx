import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StockVideoFilters } from "@/hooks/useStockVideoSearch";

interface FiltersProps {
  filters: StockVideoFilters;
  onChange: (next: StockVideoFilters) => void;
}

const QUALITY: Array<{ k: undefined | "hd" | "4k"; label: string }> = [
  { k: undefined, label: "Alle" },
  { k: "hd", label: "HD+" },
  { k: "4k", label: "4K only" },
];

const ORIENTATION: Array<{ k: undefined | "landscape" | "portrait" | "square"; label: string }> = [
  { k: undefined, label: "Alle" },
  { k: "landscape", label: "16:9" },
  { k: "portrait", label: "9:16" },
  { k: "square", label: "1:1" },
];

const DURATION: Array<{ label: string; min?: number; max?: number }> = [
  { label: "Alle" },
  { label: "<10s", max: 10 },
  { label: "10–30s", min: 10, max: 30 },
  { label: ">30s", min: 30 },
];

const FPS: Array<{ k: undefined | number; label: string }> = [
  { k: undefined, label: "Alle FPS" },
  { k: 30, label: "30+" },
  { k: 50, label: "Slow-Mo (50+)" },
];

function chip<T>(active: boolean, label: string, onClick: () => void) {
  return (
    <Button
      key={label}
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      className={cn(
        "h-7 text-[11px] shrink-0",
        active
          ? "bg-yellow-500 text-black hover:bg-yellow-400 border-transparent"
          : "border-yellow-500/25 hover:border-yellow-500/50 bg-black/40",
      )}
    >
      {label}
    </Button>
  );
}

export function StockVideoFilters({ filters, onChange }: FiltersProps) {
  const activeCount =
    (filters.min_quality ? 1 : 0) +
    (filters.orientation ? 1 : 0) +
    (filters.min_fps ? 1 : 0) +
    (filters.min_duration || filters.max_duration ? 1 : 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Filter</span>
        {activeCount > 0 && (
          <>
            <Badge variant="outline" className="border-yellow-500/40 text-yellow-400 text-[10px] h-4">
              {activeCount} aktiv
            </Badge>
            <button
              className="text-[11px] text-yellow-400 hover:underline"
              onClick={() => onChange({})}
            >
              Zurücksetzen
            </button>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {QUALITY.map((q) => chip(filters.min_quality === q.k, q.label, () => onChange({ ...filters, min_quality: q.k })))}
        <span className="w-px bg-yellow-500/15 mx-1" />
        {ORIENTATION.map((o) => chip(filters.orientation === o.k, o.label, () => onChange({ ...filters, orientation: o.k })))}
        <span className="w-px bg-yellow-500/15 mx-1" />
        {DURATION.map((d) =>
          chip(
            filters.min_duration === d.min && filters.max_duration === d.max,
            d.label,
            () => onChange({ ...filters, min_duration: d.min, max_duration: d.max }),
          ),
        )}
        <span className="w-px bg-yellow-500/15 mx-1" />
        {FPS.map((f) => chip(filters.min_fps === f.k, f.label, () => onChange({ ...filters, min_fps: f.k })))}
      </div>
    </div>
  );
}
