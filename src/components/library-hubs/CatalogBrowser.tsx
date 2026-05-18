// CatalogBrowser — shared component for Locations / Buildings / Props.
// Reads admin-seeded preview rows from <kind>_catalog_previews and groups
// them by theme_pack. Admins see a "Seed more" button that polls the
// seed-world-catalog edge function until done.

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Sparkles, Wand2, Send } from 'lucide-react';
import { useUserRoles } from '@/hooks/useUserRoles';
import { toast } from 'sonner';

type Kind = 'location' | 'building' | 'prop' | 'character';

const TABLE: Record<Kind, 'location_catalog_previews' | 'building_catalog_previews' | 'prop_catalog_previews' | 'character_catalog_previews'> = {
  location: 'location_catalog_previews',
  building: 'building_catalog_previews',
  prop: 'prop_catalog_previews',
  character: 'character_catalog_previews',
};

interface Row {
  id: string;
  theme_pack: string;
  label: string;
  image_url: string;
}

interface Props {
  kind: Kind;
  onPick?: (row: Row) => void;
  /** When true, hides the "All" filter pill and defaults to the first theme. */
  hideAllFilter?: boolean;
}

const prettify = (s: string) =>
  s
    .replace(/_/g, ' ')
    .replace(/\bfan\b/gi, '')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export function CatalogBrowser({ kind, onPick, hideAllFilter = false }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin } = useUserRoles();
  const [seeding, setSeeding] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState<string | null>(null);

  // Default pick handler: handoff to the Composer via sessionStorage so the
  // user can drop a catalog tile straight into their next scene without saving
  // it to their personal library first. Receiver lives in VideoComposer/index.
  const handlePick = (row: Row) => {
    if (onPick) return onPick(row);
    const payload = {
      kind,
      catalog_id: row.id,
      label: row.label,
      image_url: row.image_url,
      theme_pack: row.theme_pack,
      ts: Date.now(),
    };
    try {
      sessionStorage.setItem('composer:incoming-asset', JSON.stringify(payload));
    } catch {
      // ignore quota issues
    }
    toast.success(`${row.label} → ready for next scene`, {
      description: 'Open the Motion Studio to drop it in.',
      action: {
        label: 'Open',
        onClick: () => navigate('/video-composer'),
      },
    });
  };

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['world-catalog', kind],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from(TABLE[kind])
        .select('id, theme_pack, label, image_url')
        .order('theme_pack', { ascending: true })
        .order('label', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  // Group theme_packs by category prefix (split on ':').
  // Items without ':' live under category = full theme_pack, sub = null.
  const categoriesMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    rows.forEach((r) => {
      const [cat, sub] = r.theme_pack.includes(':')
        ? r.theme_pack.split(':', 2)
        : [r.theme_pack, ''];
      if (!map.has(cat)) map.set(cat, new Set());
      if (sub) map.get(cat)!.add(sub);
    });
    const out: Array<{ category: string; subs: string[] }> = [];
    Array.from(map.keys()).sort().forEach((cat) => {
      out.push({ category: cat, subs: Array.from(map.get(cat)!).sort() });
    });
    return out;
  }, [rows]);

  // Initialize default selection once rows load.
  useEffect(() => {
    if (categoriesMap.length === 0) return;
    if (!activeCategory || !categoriesMap.find((c) => c.category === activeCategory)) {
      const first = categoriesMap[0];
      setActiveCategory(first.category);
      setActiveSub(first.subs[0] ?? null);
    }
  }, [categoriesMap, activeCategory]);

  const activeCategoryEntry = categoriesMap.find((c) => c.category === activeCategory) ?? null;

  const visible = useMemo(() => {
    if (!activeCategory) return rows;
    const pack = activeSub ? `${activeCategory}:${activeSub}` : activeCategory;
    return rows.filter((r) => r.theme_pack === pack);
  }, [rows, activeCategory, activeSub]);

  const runSeeder = async () => {
    setSeeding(true);
    let totalProcessed = 0;
    try {
      for (let i = 0; i < 80; i++) {
        const { data, error } = await supabase.functions.invoke('seed-world-catalog', {
          body: { kind },
        });
        if (error) throw error;
        const processed = (data as any)?.processed ?? 0;
        const remaining = (data as any)?.remaining ?? 0;
        const done = (data as any)?.done;
        totalProcessed += processed;
        toast.message(`Seeded ${totalProcessed} so far…`, {
          description: `${remaining} left for ${kind}s`,
        });
        if (done) break;
      }
      toast.success(`Catalog seeded (${totalProcessed} new ${kind} previews)`);
      qc.invalidateQueries({ queryKey: ['world-catalog', kind] });
    } catch (e: any) {
      toast.error(e?.message || 'Seeder failed');
    } finally {
      setSeeding(false);
    }
  };

  const showCategoryRow = categoriesMap.length > 1;
  const showSubRow = !!activeCategoryEntry && activeCategoryEntry.subs.length > 0;

  return (
    <Card className="p-6 md:p-8 bg-card/40 border-primary/15 space-y-6 rounded-2xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="tracking-[0.3em] uppercase text-[10px] font-bold">Catalog</span>
          </div>
          <h3 className="font-serif text-xl md:text-2xl leading-tight">
            Browse curated {kind === 'character' ? 'cast' : `${kind}s`}
          </h3>
          <p className="text-xs text-muted-foreground font-light">
            Pick a theme to filter — every preview is ready to drop into your next scene.
          </p>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            disabled={seeding}
            onClick={runSeeder}
            title="Admin: generate missing catalog previews"
            className="rounded-full"
          >
            {seeding ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
            {seeding ? 'Seeding…' : 'Seed catalog'}
          </Button>
        )}
      </div>

      {(showCategoryRow || showSubRow) && (
        <div className="space-y-3">
          {showCategoryRow && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-wrap gap-2">
                {categoriesMap.map(({ category }) => {
                  const isActive = category === activeCategory;
                  return (
                    <button
                      key={category}
                      onClick={() => {
                        setActiveCategory(category);
                        const entry = categoriesMap.find((c) => c.category === category);
                        setActiveSub(entry?.subs[0] ?? null);
                      }}
                      className={`text-xs px-4 py-2 rounded-full border transition whitespace-nowrap ${
                        isActive
                          ? 'bg-primary/15 border-primary/60 text-primary shadow-[0_0_18px_-6px_hsl(var(--primary)/0.55)]'
                          : 'bg-background/40 border-border/40 text-muted-foreground hover:border-border hover:text-foreground'
                      }`}
                    >
                      {prettify(category)}
                    </button>
                  );
                })}
              </div>
              <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground/70">
                {visible.length} preview{visible.length === 1 ? '' : 's'}
              </span>
            </div>
          )}

          {showCategoryRow && showSubRow && (
            <div className="h-px w-6 bg-primary/40" aria-hidden="true" />
          )}

          {showSubRow && (
            <div className="flex flex-wrap gap-1.5">
              {activeCategoryEntry!.subs.map((sub) => {
                const isActive = sub === activeSub;
                return (
                  <button
                    key={sub}
                    onClick={() => setActiveSub(sub)}
                    className={`text-[10px] px-3 py-1 rounded-full border transition whitespace-nowrap ${
                      isActive
                        ? 'bg-primary/10 border-primary/50 text-primary'
                        : 'bg-background/30 border-border/30 text-muted-foreground hover:border-border/60 hover:text-foreground'
                    }`}
                  >
                    {prettify(sub)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : visible.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">
          No previews yet. {isAdmin ? 'Click "Seed catalog" to generate them.' : 'Check back soon.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
          {visible.map((row) => (
            <button
              key={row.id}
              onClick={() => handlePick(row)}
              className="group relative overflow-hidden rounded-md border border-border/40 hover:border-primary/60 transition aspect-[4/3] bg-muted"
              title={`${row.theme_pack} · ${row.label} — click to use in next scene`}
            >
              <img
                src={row.image_url}
                alt={row.label}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 to-transparent p-1.5">
                <div className="text-[10px] font-medium truncate">{row.label}</div>
              </div>
              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition bg-primary/90 text-primary-foreground rounded-full px-1.5 py-0.5 text-[9px] inline-flex items-center gap-0.5">
                <Send className="h-2.5 w-2.5" /> Use
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
