import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { VariantPickerGrid, type VariantRecord } from '@/components/library-hubs/VariantPickerGrid';

export type WardrobeThemePack = 'lifestyle' | 'historical' | 'fantasy' | 'scifi' | 'sport';

const THEME_PACKS: Array<{ id: WardrobeThemePack; label: string; emoji: string }> = [
  { id: 'lifestyle', label: 'Lifestyle', emoji: '👕' },
  { id: 'historical', label: 'Historical', emoji: '⚔️' },
  { id: 'fantasy', label: 'Fantasy', emoji: '🧙' },
  { id: 'scifi', label: 'Sci-Fi', emoji: '🚀' },
  { id: 'sport', label: 'Sport', emoji: '⚽' },
];

const PACK_SLOTS: Record<WardrobeThemePack, Array<{ id: string; label: string }>> = {
  lifestyle: [
    { id: 'casual', label: 'Casual' },
    { id: 'formal', label: 'Formal' },
    { id: 'action', label: 'Action' },
    { id: 'brand', label: 'Brand' },
  ],
  historical: [
    { id: 'knight', label: 'Knight' },
    { id: 'roman', label: 'Roman Legionary' },
    { id: 'viking', label: 'Viking' },
    { id: 'edwardian', label: 'Edwardian' },
  ],
  fantasy: [
    { id: 'wizard', label: 'Wizard' },
    { id: 'elven-ranger', label: 'Elven Ranger' },
    { id: 'dark-knight', label: 'Dark Knight' },
    { id: 'royal', label: 'Royal' },
  ],
  scifi: [
    { id: 'astronaut', label: 'Astronaut' },
    { id: 'cyberpunk', label: 'Cyberpunk' },
    { id: 'mech-pilot', label: 'Mech Pilot' },
    { id: 'holo-suit', label: 'Holo Suit' },
  ],
  sport: [
    { id: 'football', label: 'Football' },
    { id: 'basketball', label: 'Basketball' },
    { id: 'tennis', label: 'Tennis' },
    { id: 'mma', label: 'MMA Fighter' },
  ],
};

interface Props {
  avatarId: string;
  /** When provided, selecting a variant calls back with image url + meta */
  onSelect?: (variant: { variantId: string; outfitId: string; label: string; imageUrl: string; themePack: WardrobeThemePack }) => void;
  /** Compact strip layout for inline use in scene editors */
  layout?: 'sheet' | 'strip';
  /** Initial theme pack */
  initialPack?: WardrobeThemePack;
}

export function AvatarWardrobeSheet({ avatarId, onSelect, layout = 'sheet', initialPack = 'lifestyle' }: Props) {
  const qc = useQueryClient();
  const [pack, setPack] = useState<WardrobeThemePack>(initialPack);

  const { data: outfits = [], isLoading } = useQuery({
    queryKey: ['avatar-wardrobe', avatarId, pack],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('avatar_wardrobe_variants')
        .select('id, outfit_id, label, image_url, theme_pack')
        .eq('avatar_id', avatarId)
        .eq('theme_pack', pack)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as Array<{ id: string; outfit_id: string; label: string; image_url: string; theme_pack: string }>;
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-avatar-wardrobe', {
        body: { avatar_id: avatarId, theme_pack: pack },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Generated ${data?.generated ?? 0} ${THEME_PACKS.find(p => p.id === pack)?.label} outfits`);
      qc.invalidateQueries({ queryKey: ['avatar-wardrobe', avatarId, pack] });
    },
    onError: (e: any) => toast.error(e?.message || 'Wardrobe generation failed'),
  });

  const variantsBySlot = new Map<string, VariantRecord>(
    outfits.map((o) => [o.outfit_id, { variantId: o.id, label: o.label, imageUrl: o.image_url }]),
  );

  return (
    <div className="space-y-3">
      {/* Theme-pack pills */}
      <div className="flex flex-wrap gap-1.5">
        {THEME_PACKS.map((p) => {
          const active = pack === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPack(p.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all',
                active
                  ? 'border-primary/60 bg-primary/15 text-primary shadow-[0_0_12px_-4px_hsl(var(--primary)/0.55)]'
                  : 'border-border/40 bg-card/30 text-muted-foreground hover:text-foreground hover:border-border/70',
              )}
              aria-pressed={active}
            >
              <span aria-hidden>{p.emoji}</span>
              {p.label}
            </button>
          );
        })}
      </div>

      <VariantPickerGrid
        axis="wardrobe"
        slots={PACK_SLOTS[pack]}
        variantsBySlot={variantsBySlot}
        isLoading={isLoading}
        onGenerate={() => generate.mutate()}
        isGenerating={generate.isPending}
        layout={layout}
        onSelect={(slotId, variant) => {
          onSelect?.({
            variantId: variant.variantId,
            outfitId: slotId,
            label: variant.label,
            imageUrl: variant.imageUrl,
            themePack: pack,
          });
        }}
      />
    </div>
  );
}
