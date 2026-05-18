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

export function CatalogBrowser({ kind, onPick, hideAllFilter = false }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin } = useUserRoles();
  const [seeding, setSeeding] = useState(false);
  const [activeTheme, setActiveTheme] = useState<string | 'all'>('all');

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

  const themes = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => s.add(r.theme_pack));
    const sorted = Array.from(s).sort();
    return hideAllFilter ? sorted : ['all', ...sorted];
  }, [rows, hideAllFilter]);

  // When the "All" filter is hidden, snap the default activeTheme to the
  // first available theme as soon as rows arrive.
  useEffect(() => {
    if (hideAllFilter && activeTheme === 'all' && themes.length > 0) {
      setActiveTheme(themes[0]);
    }
  }, [hideAllFilter, activeTheme, themes]);

  const visible = useMemo(
    () => (activeTheme === 'all' ? rows : rows.filter((r) => r.theme_pack === activeTheme)),
    [rows, activeTheme],
  );

  const runSeeder = async () => {
    setSeeding(true);
    let totalProcessed = 0;
    try {
      // Poll until done — server returns done:true when nothing remains.
      // Each call processes up to 4 slots synchronously (~10–15s).
      // Safety: cap at 80 invocations (~320 slots).
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

  return (
    <Card className="p-4 bg-card/40 border-primary/15 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-primary">
          <Sparkles className="h-4 w-4" />
          <span className="tracking-widest uppercase text-xs">Catalog</span>
          <span className="text-muted-foreground normal-case tracking-normal">
            Pick a curated {kind} as a starting point
          </span>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            disabled={seeding}
            onClick={runSeeder}
            title="Admin: generate missing catalog previews"
          >
            {seeding ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
            {seeding ? 'Seeding…' : 'Seed catalog'}
          </Button>
        )}
      </div>

      {themes.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {themes.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTheme(t)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                activeTheme === t
                  ? 'bg-primary/15 border-primary/50 text-primary'
                  : 'bg-background/40 border-border/40 text-muted-foreground hover:border-border'
              }`}
            >
              {t === 'all' ? 'All' : t.replace(':', ' / ')}
            </button>
          ))}
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
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
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
