import { useState, useCallback } from 'react';
import { Loader2, Sparkles, Shirt, Package, Users, Check, ImageIcon, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export type VariantAxis = 'pose' | 'wardrobe' | 'vibe' | 'prop';

export interface VariantSlot { id: string; label: string }
export interface VariantRecord { variantId: string; label: string; imageUrl: string }

interface AxisMeta {
  icon: LucideIcon;
  title: string;
  helper: string;
  selectToast: string;
}

const AXIS_META: Record<VariantAxis, AxisMeta> = {
  pose: {
    icon: Users,
    title: 'Pose Sheet',
    helper: 'Locked-identity pose variants — same face, different framing. Used as i2v anchor frames in any studio.',
    selectToast: 'Pose selected — will be used as the anchor frame in your next generation.',
  },
  wardrobe: {
    icon: Shirt,
    title: 'Wardrobe Sheet',
    helper: 'Locked-identity outfit variants — same face, different wardrobe. Drop into any studio for tonal control.',
    selectToast: 'Outfit selected — will be applied to your next generation.',
  },
  vibe: {
    icon: Sparkles,
    title: 'Vibes',
    helper: 'Same location, different time-of-day & atmosphere. Compare lighting moods 1:1.',
    selectToast: 'Vibe selected — will be applied to your next location render.',
  },
  prop: {
    icon: Package,
    title: 'Props & Dressings',
    helper: 'Same location, different prop dressings. Empty, product-hero, lifestyle, event.',
    selectToast: 'Prop dressing selected — will be applied to your next location render.',
  },
};

interface Props {
  axis: VariantAxis;
  slots: VariantSlot[];
  /** Map of slot.id -> variant data (already loaded) */
  variantsBySlot: Map<string, VariantRecord>;
  isLoading?: boolean;
  /** Optional: enable Generate / Regenerate button */
  onGenerate?: () => void;
  isGenerating?: boolean;
  /** Compact "strip" layout for inline use, vs full "sheet" with header card */
  layout?: 'sheet' | 'strip';
  /** Controlled selection (slot.id). If omitted, uses internal state. */
  selectedId?: string | null;
  onSelect?: (slotId: string, variant: VariantRecord) => void;
}

export function VariantPickerGrid({
  axis,
  slots,
  variantsBySlot,
  isLoading,
  onGenerate,
  isGenerating,
  layout = 'sheet',
  selectedId: controlledSelected,
  onSelect,
}: Props) {
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const selected = controlledSelected !== undefined ? controlledSelected : internalSelected;
  const meta = AXIS_META[axis];
  const Icon = meta.icon;

  const handleClick = useCallback(
    (slot: VariantSlot, variant: VariantRecord | undefined) => {
      if (!variant) return;
      if (controlledSelected === undefined) setInternalSelected(slot.id);
      onSelect?.(slot.id, variant);
      toast.success(`${slot.label} — selected`, {
        description: meta.selectToast,
        duration: 2200,
      });
    },
    [controlledSelected, onSelect, meta.selectToast],
  );

  const isStrip = layout === 'strip';
  const cols = slots.length === 5
    ? 'grid-cols-5'
    : slots.length === 4
      ? 'grid-cols-2 sm:grid-cols-4'
      : 'grid-cols-2 sm:grid-cols-3';

  const grid = (
    <div className={cn('grid gap-2', isStrip ? 'grid-cols-4 sm:grid-cols-5 gap-1' : cols + ' gap-3')}>
      {slots.map((slot) => {
        const v = variantsBySlot.get(slot.id);
        const isSelected = selected === slot.id;
        const clickable = !!v;
        return (
          <button
            key={slot.id}
            type="button"
            onClick={() => handleClick(slot, v)}
            disabled={!clickable}
            title={slot.label}
            className={cn(
              'group relative aspect-square rounded-lg overflow-hidden border bg-muted/20 text-left transition-all',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              clickable && 'cursor-pointer hover:scale-[1.03] hover:shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.6)]',
              !clickable && 'cursor-default',
              isSelected
                ? 'border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.55),0_8px_24px_-8px_hsl(var(--primary)/0.6)]'
                : 'border-border/40 hover:border-primary/50',
            )}
          >
            {v ? (
              <img
                src={v.imageUrl}
                alt={slot.label}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : axis === 'wardrobe' ? (
              // Wardrobe: catalog auto-fills in the background.
              // Always show a shimmering skeleton instead of "Not generated".
              <div className="absolute inset-0 bg-gradient-to-br from-muted/40 via-muted/20 to-muted/40 animate-pulse flex items-end p-2">
                <span className="text-[10px] text-muted-foreground/70 leading-tight drop-shadow">
                  {slot.label}
                </span>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/60 gap-1 px-1 text-center">
                {isGenerating || isLoading ? (
                  <Loader2 className={cn(isStrip ? 'h-3 w-3' : 'h-5 w-5', 'animate-spin')} />
                ) : (
                  <ImageIcon className={isStrip ? 'h-3 w-3' : 'h-5 w-5'} />
                )}
                <span className={cn(isStrip ? 'text-[8px]' : 'text-[10px]', 'leading-tight')}>
                  {isStrip ? slot.label : 'Not generated'}
                </span>
              </div>
            )}

            {/* Label overlay (only for sheet layout when image present) */}
            {v && !isStrip && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2">
                <span className="text-[11px] font-medium text-white drop-shadow">{slot.label}</span>
              </div>
            )}

            {/* Selected check badge */}
            {isSelected && (
              <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-[0_2px_8px_hsl(var(--primary)/0.6)]">
                <Check className="h-3 w-3" strokeWidth={3} />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );

  if (isStrip) {
    return (
      <div className="border-t border-border/40 px-3 py-2.5 space-y-2 bg-background/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Icon className="h-2.5 w-2.5 text-primary" /> {meta.title}
          </div>
          {onGenerate && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] text-primary hover:text-primary"
              disabled={isGenerating}
              onClick={onGenerate}
            >
              {isGenerating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
              {variantsBySlot.size > 0 ? 'Regen' : 'Generate'}
            </Button>
          )}
        </div>
        {grid}
      </div>
    );
  }

  return (
    <Card className="p-5 bg-card/60 backdrop-blur border-primary/15 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" /> {meta.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">{meta.helper}</p>
        </div>
        {onGenerate && (
          <Button
            onClick={onGenerate}
            disabled={isGenerating}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {variantsBySlot.size > 0 ? 'Regenerate' : `Generate ${meta.title}`}
          </Button>
        )}
      </div>
      {grid}
    </Card>
  );
}
