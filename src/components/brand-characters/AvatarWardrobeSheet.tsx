import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Lock } from 'lucide-react';
import { VariantPickerGrid, type VariantRecord } from '@/components/library-hubs/VariantPickerGrid';

/**
 * Stage 21 — Hierarchical theme packs.
 * Theme → Sub-Pack → 4 Outfits. DB stores composite key `${theme}:${sub}`
 * in `avatar_wardrobe_variants.theme_pack`.
 */
export type WardrobeTheme =
  | 'lifestyle' | 'business' | 'historical' | 'fantasy' | 'scifi' | 'sport';

/** Backwards-compat alias — many callers still import this name. */
export type WardrobeThemePack = WardrobeTheme;

interface SubPack { id: string; label: string; slots: Array<{ id: string; label: string }>; }

const THEMES: Array<{ id: WardrobeTheme; label: string; emoji: string }> = [
  { id: 'lifestyle', label: 'Lifestyle', emoji: '👕' },
  { id: 'business', label: 'Business', emoji: '💼' },
  { id: 'historical', label: 'Historical', emoji: '⚔️' },
  { id: 'fantasy', label: 'Fantasy', emoji: '🧙' },
  { id: 'scifi', label: 'Sci-Fi', emoji: '🚀' },
  { id: 'sport', label: 'Sport', emoji: '⚽' },
];

const SUB_PACKS: Record<WardrobeTheme, SubPack[]> = {
  lifestyle: [
    { id: 'everyday', label: 'Everyday', slots: [
      { id: 'casual', label: 'Casual' },
      { id: 'streetwear', label: 'Streetwear' },
      { id: 'brunch', label: 'Brunch' },
      { id: 'loungewear', label: 'Loungewear' },
    ]},
    { id: 'formal', label: 'Formal', slots: [
      { id: 'black-tie', label: 'Black Tie' },
      { id: 'cocktail', label: 'Cocktail' },
      { id: 'wedding-guest', label: 'Wedding Guest' },
      { id: 'gala', label: 'Gala' },
    ]},
    { id: 'seasonal', label: 'Seasonal', slots: [
      { id: 'summer', label: 'Summer' },
      { id: 'winter', label: 'Winter' },
      { id: 'rainy', label: 'Rainy Day' },
      { id: 'spring', label: 'Spring' },
    ]},
    { id: 'brand', label: 'Brand', slots: [
      { id: 'brand-hero', label: 'Brand Hero' },
      { id: 'brand-casual', label: 'Brand Casual' },
      { id: 'brand-formal', label: 'Brand Formal' },
      { id: 'brand-sport', label: 'Brand Sport' },
    ]},
  ],
  business: [
    { id: 'corporate', label: 'Corporate', slots: [
      { id: 'executive-suit', label: 'Executive Suit' },
      { id: 'boardroom', label: 'Boardroom' },
      { id: 'banker', label: 'Banker' },
      { id: 'consultant', label: 'Consultant' },
    ]},
    { id: 'startup', label: 'Startup', slots: [
      { id: 'smart-casual', label: 'Smart Casual' },
      { id: 'founder-hoodie', label: 'Founder Hoodie' },
      { id: 'power-blazer', label: 'Power Blazer' },
      { id: 'pitch', label: 'Pitch Day' },
    ]},
    { id: 'creative', label: 'Creative', slots: [
      { id: 'designer', label: 'Designer' },
      { id: 'agency', label: 'Agency Lead' },
      { id: 'architect', label: 'Architect' },
      { id: 'editor', label: 'Editor' },
    ]},
    { id: 'travel', label: 'Travel', slots: [
      { id: 'airport-pro', label: 'Airport Pro' },
      { id: 'conference', label: 'Conference' },
      { id: 'networking', label: 'Networking' },
      { id: 'coworking', label: 'Coworking' },
    ]},
  ],
  historical: [
    { id: 'antiquity', label: 'Antiquity', slots: [
      { id: 'roman', label: 'Roman Legionary' },
      { id: 'greek-hoplite', label: 'Greek Hoplite' },
      { id: 'egyptian-royal', label: 'Egyptian Royal' },
      { id: 'celtic-warrior', label: 'Celtic Warrior' },
    ]},
    { id: 'medieval', label: 'Medieval', slots: [
      { id: 'knight', label: 'Knight' },
      { id: 'viking', label: 'Viking' },
      { id: 'crusader', label: 'Crusader' },
      { id: 'monk', label: 'Monk' },
    ]},
    { id: 'renaissance', label: 'Renaissance', slots: [
      { id: 'noble', label: 'Renaissance Noble' },
      { id: 'musketeer', label: 'Musketeer' },
      { id: 'pirate', label: 'Pirate' },
      { id: 'court', label: 'Court Attendant' },
    ]},
    { id: 'industrial', label: 'Industrial', slots: [
      { id: 'edwardian', label: 'Edwardian' },
      { id: 'victorian', label: 'Victorian' },
      { id: 'steampunk', label: 'Steampunk' },
      { id: 'wild-west', label: 'Wild West' },
    ]},
    { id: 'world-war-1', label: 'World War I', slots: [
      { id: 'doughboy', label: 'US Doughboy' },
      { id: 'tommy', label: 'British Tommy' },
      { id: 'pilot-ace', label: 'Pilot Ace' },
      { id: 'trench-officer', label: 'Trench Officer' },
    ]},
    { id: 'world-war-2', label: 'World War II', slots: [
      { id: 'gi', label: 'US GI' },
      { id: 'german-soldier', label: 'German Soldier' },
      { id: 'raf-pilot', label: 'RAF Pilot' },
      { id: 'resistance', label: 'Resistance' },
    ]},
    { id: 'feudal-japan', label: 'Feudal Japan', slots: [
      { id: 'samurai', label: 'Samurai' },
      { id: 'ninja', label: 'Ninja' },
      { id: 'geisha', label: 'Geisha' },
      { id: 'ronin', label: 'Ronin' },
    ]},
  ],
  fantasy: [
    { id: 'light', label: 'Light', slots: [
      { id: 'wizard', label: 'Wizard' },
      { id: 'elven-ranger', label: 'Elven Ranger' },
      { id: 'paladin', label: 'Paladin' },
      { id: 'royal', label: 'Royal' },
    ]},
    { id: 'dark', label: 'Dark', slots: [
      { id: 'dark-knight', label: 'Dark Knight' },
      { id: 'necromancer', label: 'Necromancer' },
      { id: 'assassin', label: 'Assassin' },
      { id: 'vampire', label: 'Vampire Lord' },
    ]},
    { id: 'mythic', label: 'Mythic', slots: [
      { id: 'dragon-rider', label: 'Dragon Rider' },
      { id: 'druid', label: 'Druid' },
      { id: 'sorceress', label: 'Sorceress' },
      { id: 'forest-guardian', label: 'Forest Guardian' },
    ]},
  ],
  scifi: [
    { id: 'space', label: 'Space', slots: [
      { id: 'astronaut', label: 'Astronaut' },
      { id: 'star-captain', label: 'Star Captain' },
      { id: 'alien-diplomat', label: 'Alien Diplomat' },
      { id: 'mech-pilot', label: 'Mech Pilot' },
    ]},
    { id: 'cyber', label: 'Cyber', slots: [
      { id: 'cyberpunk', label: 'Cyberpunk' },
      { id: 'netrunner', label: 'Netrunner' },
      { id: 'corp-exec', label: 'Corp Exec' },
      { id: 'street-samurai', label: 'Street Samurai' },
    ]},
    { id: 'future', label: 'Future', slots: [
      { id: 'holo-suit', label: 'Holo Suit' },
      { id: 'bio-engineer', label: 'Bio-Engineer' },
      { id: 'energy-knight', label: 'Energy Knight' },
      { id: 'drone-pilot', label: 'Drone Pilot' },
    ]},
  ],
  sport: [
    { id: 'team', label: 'Team', slots: [
      { id: 'football', label: 'Football' },
      { id: 'basketball', label: 'Basketball' },
      { id: 'baseball', label: 'Baseball' },
      { id: 'american-football', label: 'American Football' },
    ]},
    { id: 'combat', label: 'Combat', slots: [
      { id: 'mma', label: 'MMA Fighter' },
      { id: 'boxing', label: 'Boxing' },
      { id: 'karate', label: 'Karate' },
      { id: 'fencing', label: 'Fencing' },
    ]},
    { id: 'outdoor', label: 'Outdoor', slots: [
      { id: 'tennis', label: 'Tennis' },
      { id: 'skiing', label: 'Skiing' },
      { id: 'climbing', label: 'Rock Climbing' },
      { id: 'cycling', label: 'Cycling' },
    ]},
  ],
};

/** Parse composite "theme:sub" key. Falls back to defaults if malformed. */
function parseInitial(input?: string): { theme: WardrobeTheme; sub: string } {
  const raw = input ?? 'lifestyle';
  const [t, s] = raw.split(':');
  const theme = (THEMES.find((p) => p.id === t)?.id ?? 'lifestyle') as WardrobeTheme;
  const subs = SUB_PACKS[theme];
  const sub = subs.find((sp) => sp.id === s)?.id ?? subs[0].id;
  return { theme, sub };
}

interface Props {
  avatarId: string;
  /** Avatar's gender hint, used as default for the toggle. */
  avatarGender?: 'male' | 'female' | 'neutral' | null;
  /** When provided, selecting a variant calls back with image url + meta */
  onSelect?: (variant: {
    variantId: string | null;
    outfitId: string;
    label: string;
    imageUrl: string;
    /** Composite `theme:sub` key (e.g. "historical:medieval") */
    themePack: string;
  }) => void;
  /** Compact strip layout for inline use in scene editors */
  layout?: 'sheet' | 'strip';
  /** Initial theme pack — accepts plain theme ("historical") or composite ("historical:medieval"). */
  initialPack?: string;
}

export function AvatarWardrobeSheet({ avatarId, avatarGender, onSelect, layout = 'sheet', initialPack }: Props) {
  const initial = parseInitial(initialPack);
  const [theme, setTheme] = useState<WardrobeTheme>(initial.theme);
  const [sub, setSub] = useState<string>(initial.sub);

  // If avatar has a fixed gender → lock the toggle entirely.
  const genderLocked = avatarGender === 'male' || avatarGender === 'female';
  const [gender, setGender] = useState<'male' | 'female'>(
    avatarGender === 'male' ? 'male' : 'female',
  );
  // Keep gender in sync if avatarGender changes after mount (e.g. after backfill)
  useEffect(() => {
    if (genderLocked) setGender(avatarGender as 'male' | 'female');
  }, [avatarGender, genderLocked]);

  // When theme changes, snap to the first sub-pack of that theme.
  useEffect(() => {
    if (!SUB_PACKS[theme].some((sp) => sp.id === sub)) {
      setSub(SUB_PACKS[theme][0].id);
    }
  }, [theme, sub]);

  const compositeKey = `${theme}:${sub}`;
  const activeSub = SUB_PACKS[theme].find((sp) => sp.id === sub) ?? SUB_PACKS[theme][0];

  // Per-user generated outfits (highest priority — show user's own avatar in that outfit)
  const { data: userOutfits = [], isLoading: loadingUser } = useQuery({
    queryKey: ['avatar-wardrobe', avatarId, compositeKey],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('avatar_wardrobe_variants')
        .select('id, outfit_id, label, image_url, theme_pack')
        .eq('avatar_id', avatarId)
        .eq('theme_pack', compositeKey);
      if (error) throw error;
      return (data || []) as Array<{ id: string; outfit_id: string; label: string; image_url: string }>;
    },
  });

  // Shared catalog previews (gendered generic models). Always loaded.
  const { data: catalog = [], isLoading: loadingCatalog } = useQuery({
    queryKey: ['wardrobe-catalog', compositeKey, gender],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('wardrobe_catalog_previews')
        .select('outfit_id, outfit_label, image_url, gender')
        .eq('theme_pack', compositeKey)
        .eq('gender', gender);
      if (error) throw error;
      return (data || []) as Array<{ outfit_id: string; outfit_label: string; image_url: string; gender: string }>;
    },
    refetchInterval: (q) => {
      const rows = (q.state.data as any[] | undefined) ?? [];
      // Auto-refetch while catalog is still being seeded for this combo
      return rows.length < 4 ? 8000 : false;
    },
  });

  const variantsBySlot = useMemo(() => {
    const map = new Map<string, VariantRecord & { isUser: boolean }>();
    for (const c of catalog) {
      map.set(c.outfit_id, { variantId: '', label: c.outfit_label, imageUrl: c.image_url, isUser: false });
    }
    for (const u of userOutfits) {
      map.set(u.outfit_id, { variantId: u.id, label: u.label, imageUrl: u.image_url, isUser: true });
    }
    return map as Map<string, VariantRecord>;
  }, [catalog, userOutfits]);

  const isLoading = loadingUser || loadingCatalog;

  return (
    <div className="space-y-3">
      {/* Tier 1 — Theme pills */}
      <div className="flex flex-wrap gap-1.5">
        {THEMES.map((p) => {
          const active = theme === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setTheme(p.id)}
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

      {/* Tier 2 — Sub-pack pills + gender toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 pl-2 border-l-2 border-primary/30 ml-1">
          {SUB_PACKS[theme].map((sp) => {
            const active = sub === sp.id;
            return (
              <button
                key={sp.id}
                type="button"
                onClick={() => setSub(sp.id)}
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all',
                  active
                    ? 'border-primary/70 bg-primary/20 text-primary'
                    : 'border-border/30 bg-card/20 text-muted-foreground hover:text-foreground hover:border-border/60',
                )}
                aria-pressed={active}
              >
                {sp.label}
              </button>
            );
          })}
        </div>

        {/* Gender toggle — hidden when avatar has fixed gender */}
        {genderLocked ? (
          <div
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary shrink-0"
            title={`Locked to ${avatarGender} — set on the avatar itself`}
          >
            <Lock className="h-2.5 w-2.5" />
            <span aria-hidden>{avatarGender === 'female' ? '♀' : '♂'}</span>
            <span className="capitalize">{avatarGender}</span>
          </div>
        ) : (
          <div className="inline-flex items-center rounded-full border border-border/40 bg-card/30 p-0.5 text-[11px] font-semibold shrink-0">
            {(['female', 'male'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                className={cn(
                  'rounded-full px-2.5 py-0.5 transition-all',
                  gender === g ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
                aria-pressed={gender === g}
                title={g === 'female' ? 'Female model preview' : 'Male model preview'}
              >
                {g === 'female' ? '♀' : '♂'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Inline "Personalize with my avatar" — optional upgrade above the grid */}
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[10.5px] text-muted-foreground">
          {hasUserOverrides
            ? <>Showing <span className="text-primary font-semibold">your avatar</span> in {activeSub.label}.</>
            : catalogPending
              ? <>Catalog preview wird vorbereitet… Modelle erscheinen gleich.</>
              : <>Generic model previews — outfits are locked, faces are neutral.</>}
        </p>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary transition-all',
            'hover:bg-primary/15 hover:border-primary/60 disabled:opacity-50',
          )}
          title="Render these 4 outfits with your avatar's face (~30s)"
        >
          {isGenerating ? (
            <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Personalizing…</>
          ) : (
            <><Sparkles className="h-2.5 w-2.5" /> {hasUserOverrides ? 'Re-render with my face' : 'Use my face (~30s)'}</>
          )}
        </button>
      </div>

      <VariantPickerGrid
        axis="wardrobe"
        slots={activeSub.slots}
        variantsBySlot={variantsBySlot}
        isLoading={isLoading || isGenerating}
        isGenerating={isGenerating}
        layout={layout}
        onGenerate={handleGenerate}
        onSelect={(slotId, variant) => {
          onSelect?.({
            variantId: variant.variantId || null,
            outfitId: slotId,
            label: variant.label,
            imageUrl: variant.imageUrl,
            themePack: compositeKey,
          });
        }}
      />
    </div>
  );
}
