import { useMemo } from "react";
import { Briefcase, Users, Palette, SlidersHorizontal, ChevronDown, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/use-mobile";

interface Entity {
  id: string;
  name: string;
}

interface ContextSwitcherProps {
  workspaceId: string | null;
  clientId: string | null;
  brandId: string | null;
  workspaces: Entity[];
  clients: Entity[];
  brands: Entity[];
  onWorkspaceChange: (id: string) => void;
  onClientChange: (id: string) => void;
  onBrandChange: (id: string) => void;
}

interface PillProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  items: Entity[];
  value: string | null;
  onChange: (id: string) => void;
  allLabel?: string;
  allValue?: string;
}

function ContextPill({ icon: Icon, label, items, value, onChange, allLabel, allValue }: PillProps) {
  const active = value && value !== allValue;
  const current = items.find((i) => i.id === value);
  const displayLabel = current?.name ?? label;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <motion.button
          layout
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={cn(
            "group relative flex items-center gap-2 h-9 px-3.5 rounded-full",
            "bg-background/40 backdrop-blur-xl border transition-all duration-300",
            active
              ? "border-primary/60 shadow-[0_0_18px_-4px_hsl(var(--primary)/0.45)]"
              : "border-white/10 hover:border-primary/30",
          )}
        >
          <Icon className={cn(
            "w-3.5 h-3.5 transition-colors",
            active ? "text-primary" : "text-muted-foreground group-hover:text-primary/70"
          )} />
          <span className={cn(
            "text-xs font-medium tracking-wide max-w-[140px] truncate",
            active ? "text-foreground" : "text-muted-foreground"
          )}>
            {displayLabel}
          </span>
          <ChevronDown className="w-3 h-3 text-muted-foreground/60 group-hover:text-primary/70 transition-colors" />
          {active && (
            <motion.span
              layoutId={`pill-glow-${label}`}
              className="pointer-events-none absolute inset-x-3 -bottom-px h-px bg-gradient-to-r from-transparent via-primary to-transparent"
            />
          )}
        </motion.button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-60 p-1.5 backdrop-blur-xl bg-popover/95 border-white/10"
      >
        <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          {label}
        </div>
        <div className="max-h-72 overflow-y-auto">
          {allLabel && allValue && (
            <button
              onClick={() => onChange(allValue)}
              className={cn(
                "w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs",
                "hover:bg-primary/10 transition-colors",
                !value || value === allValue ? "text-primary" : "text-muted-foreground"
              )}
            >
              <span>{allLabel}</span>
              {(!value || value === allValue) && <Check className="w-3.5 h-3.5" />}
            </button>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={cn(
                "w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs",
                "hover:bg-primary/10 transition-colors",
                value === item.id ? "text-primary" : "text-foreground/90"
              )}
            >
              <span className="truncate">{item.name}</span>
              {value === item.id && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ContextSwitcher({
  workspaceId,
  clientId,
  brandId,
  workspaces,
  clients,
  brands,
  onWorkspaceChange,
  onClientChange,
  onBrandChange,
}: ContextSwitcherProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  // Cascade: if clients exist and one is selected, filter brands by client_id
  const visibleBrands = useMemo(() => {
    if (!clientId || clientId === "all") return brands;
    const filtered = brands.filter((b: any) => !b.client_id || b.client_id === clientId);
    return filtered.length > 0 ? filtered : brands;
  }, [brands, clientId]);

  const hasMultipleWorkspaces = workspaces.length > 1;
  const hasClients = clients.length > 0;
  const hasMultipleBrands = visibleBrands.length > 1;
  const singleBrand = visibleBrands.length === 1 ? visibleBrands[0] : null;

  // Auto-clear stale "all" values so pills compute correctly
  const effectiveBrandId = brandId === "all" ? null : brandId;
  const effectiveClientId = clientId === "all" ? null : clientId;

  const showAnyPill = hasMultipleWorkspaces || hasClients || hasMultipleBrands;

  return (
    <div className={cn(
      "flex gap-2 items-center",
      isMobile && "flex-wrap"
    )}>
      <AnimatePresence mode="popLayout">
        {hasMultipleWorkspaces && (
          <motion.div
            key="ws"
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
          >
            <ContextPill
              icon={Briefcase}
              label={t("calendar.selectWorkspace")}
              items={workspaces}
              value={workspaceId}
              onChange={onWorkspaceChange}
            />
          </motion.div>
        )}

        {hasClients && (
          <motion.div
            key="client"
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
          >
            <ContextPill
              icon={Users}
              label={t("calendar.selectClient")}
              items={clients}
              value={effectiveClientId}
              onChange={onClientChange}
              allLabel={t("calendar.allClients")}
              allValue="all"
            />
          </motion.div>
        )}

        {hasMultipleBrands && (
          <motion.div
            key="brand"
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
          >
            <ContextPill
              icon={Palette}
              label={t("calendar.selectBrand")}
              items={visibleBrands}
              value={effectiveBrandId}
              onChange={onBrandChange}
              allLabel={t("calendar.allBrands")}
              allValue="all"
            />
          </motion.div>
        )}

        {/* Solo case: 1 brand, 0 clients, 1 workspace — just show a quiet chip */}
        {!showAnyPill && singleBrand && (
          <motion.div
            key="solo-brand"
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 h-9 px-3.5 rounded-full bg-background/30 border border-primary/20"
          >
            <Palette className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium text-foreground/90 tracking-wide max-w-[160px] truncate">
              {singleBrand.name}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Power-user: advanced filter popover always available */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 rounded-full hover:bg-primary/10 hover:text-primary"
            title={t("calendar.advancedFilters") ?? "Filter"}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-72 p-3 backdrop-blur-xl bg-popover/95 border-white/10 space-y-3"
        >
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 px-1">
            {t("calendar.advancedFilters") ?? "Advanced filters"}
          </div>

          <div className="space-y-2">
            <label className="text-[11px] text-muted-foreground px-1">
              {t("calendar.selectWorkspace")}
            </label>
            <Select value={workspaceId || undefined} onValueChange={onWorkspaceChange}>
              <SelectTrigger className="h-8 text-xs bg-muted/30 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="backdrop-blur-xl bg-popover/95 border-white/10">
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] text-muted-foreground px-1">
              {t("calendar.selectClient")}
            </label>
            <Select value={clientId || "all"} onValueChange={onClientChange}>
              <SelectTrigger className="h-8 text-xs bg-muted/30 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="backdrop-blur-xl bg-popover/95 border-white/10">
                <SelectItem value="all">{t("calendar.allClients")}</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] text-muted-foreground px-1">
              {t("calendar.selectBrand")}
            </label>
            <Select value={brandId || "all"} onValueChange={onBrandChange}>
              <SelectTrigger className="h-8 text-xs bg-muted/30 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="backdrop-blur-xl bg-popover/95 border-white/10">
                <SelectItem value="all">{t("calendar.allBrands")}</SelectItem>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 text-xs hover:bg-primary/10 hover:text-primary"
            onClick={() => {
              onClientChange("all");
              onBrandChange("all");
            }}
          >
            {t("calendar.resetFilters") ?? "Reset"}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
