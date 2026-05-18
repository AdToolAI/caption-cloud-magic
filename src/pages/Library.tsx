// Cast & World — unified library page combining People, Locations,
// Buildings and Props in a single Hub. Replaces the standalone
// /avatars and /locations pages while keeping their detail routes intact.

import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Users,
  MapPin,
  Building2,
  Package,
  Plus,
  Loader2,
  Star,
  Trash2,
  Sparkles,
  Library as LibraryIcon,
} from 'lucide-react';
import { useAccessibleCharacters } from '@/hooks/useAccessibleCharacters';
import { useBrandLocations } from '@/hooks/useBrandLocations';
import { useBrandBuildings } from '@/hooks/useBrandBuildings';
import { useBrandProps } from '@/hooks/useBrandProps';
import { CatalogBrowser } from '@/components/library-hubs/CatalogBrowser';
import { AddBrandCharacterDialog } from '@/components/brand-characters/AddBrandCharacterDialog';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type TabKey = 'people' | 'locations' | 'props';

const TABS: { key: TabKey; label: string; icon: typeof Users }[] = [
  { key: 'people', label: 'People', icon: Users },
  { key: 'locations', label: 'Locations', icon: MapPin },
  { key: 'props', label: 'Props', icon: Package },
];

const Library = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = (params.get('tab') as TabKey) || 'people';

  const setTab = (next: TabKey) => {
    setParams((p) => {
      p.set('tab', next);
      p.delete('sub');
      return p;
    });
  };

  return (
    <>
      <Helmet>
        <title>Cast & World — Your unified asset library | useadtool</title>
        <meta
          name="description"
          content="One library for every visual building block of your videos: people, locations, architecture and props — all reusable, all consistent."
        />
      </Helmet>

      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">
          {/* Cinematic header */}
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12 border-b border-border/40 pb-10">
            <div className="space-y-4 max-w-2xl">
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-primary" />
                <p className="text-primary tracking-[0.3em] text-[10px] font-bold uppercase">
                  Asset Library
                </p>
              </div>
              <h1 className="font-serif text-5xl md:text-6xl font-medium tracking-tight">
                Cast &amp; World
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed font-light max-w-lg">
                Manage your digital actors, environments and props. Maintain visual consistency
                across every generated scene with persistent identity markers.
              </p>
            </div>
          </header>

          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            {/* Cinematic pill nav */}
            <div className="mb-8">
              <TabsList className="flex bg-card/40 p-1 rounded-2xl border border-border/40 h-auto gap-1">
                {TABS.map((t) => {
                  const Icon = t.icon;
                  return (
                    <TabsTrigger
                      key={t.key}
                      value={t.key}
                      className="px-6 md:px-8 py-2.5 rounded-xl text-sm font-medium text-muted-foreground data-[state=active]:bg-foreground/10 data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-xl transition gap-1.5"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {t.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            <TabsContent value="people">
              <PeopleTab onOpenAvatar={(id) => navigate(`/avatars/${id}`)} />
            </TabsContent>

            <TabsContent value="locations">
              <LocationsTab />
            </TabsContent>

            <TabsContent value="props">
              <PropsTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
};

export default Library;

// ============================================================
// Tab: People (read-only summary, deep-links to /avatars/:id and /avatars)
// ============================================================
function PeopleTab({ onOpenAvatar }: { onOpenAvatar: (id: string) => void }) {
  const { data: chars = [], isLoading } = useAccessibleCharacters();
  const [addOpen, setAddOpen] = useState(false);

  const feature = chars[0];
  const rest = chars.slice(1);

  return (
    <>
      {/* Top action row: catalog filter pills + gold CTA */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <CatalogBrowser kind="character" hideAllFilter />
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 md:px-8 py-5 md:py-6 shadow-[0_0_20px_hsl(var(--primary)/0.2)] hover:shadow-[0_0_35px_hsl(var(--primary)/0.4)] transition-all duration-500"
        >
          <Plus className="h-4 w-4 mr-2" strokeWidth={3} />
          <span className="tracking-tight">New Avatar</span>
        </Button>
      </div>

      <Section
        icon={Users}
        empty={{
          title: 'No avatars yet',
          body: 'Create your first avatar to lock visual + voice identity across every scene.',
          cta: { label: 'New Avatar', onClick: () => setAddOpen(true) },
        }}
        loading={isLoading}
        items={chars}
      >
        {/* Cinematic Bento Grid */}
        <div className="grid grid-cols-2 md:grid-cols-12 gap-4 md:gap-5 auto-rows-[180px] md:auto-rows-[220px]">
          {feature && (
            <button
              onClick={() => onOpenAvatar(feature.id)}
              className="col-span-2 md:col-span-5 md:row-span-2 group relative overflow-hidden rounded-[2rem] border border-border/40 bg-gradient-to-br from-foreground/10 to-transparent transition-all duration-700 hover:border-primary/40 text-left"
            >
              {(feature.portrait_url || feature.reference_image_url) && (
                <img
                  src={feature.portrait_url || feature.reference_image_url}
                  alt={feature.name}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                  loading="lazy"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent opacity-80 transition-opacity group-hover:opacity-60" />
              <div className="absolute bottom-0 p-6 md:p-10 w-full">
                <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-foreground/10 border border-border/40 backdrop-blur-md">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[10px] uppercase font-bold tracking-widest">
                    Primary Cast
                  </span>
                </div>
                <h3 className="font-serif text-3xl md:text-4xl mb-2 leading-tight">{feature.name}</h3>
                {feature.description && (
                  <p className="text-sm text-foreground/60 max-w-xs font-light leading-relaxed line-clamp-2">
                    {feature.description}
                  </p>
                )}
              </div>
            </button>
          )}

          {rest.map((c: any) => (
            <button
              key={c.id}
              onClick={() => onOpenAvatar(c.id)}
              className="col-span-1 md:col-span-3 md:row-span-1 group relative overflow-hidden rounded-[2rem] border border-border/40 transition-all duration-500 hover:border-primary/30 bg-muted text-left"
            >
              {(c.portrait_url || c.reference_image_url) && (
                <img
                  src={c.portrait_url || c.reference_image_url}
                  alt={c.name}
                  className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-90 group-hover:scale-110 transition-all duration-1000"
                  loading="lazy"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
              <div className="absolute bottom-4 left-5 right-5">
                <p className="text-primary text-[9px] uppercase font-black tracking-[0.2em] mb-1">
                  Cast Member
                </p>
                <h4 className="font-serif text-lg md:text-xl truncate">{c.name}</h4>
              </div>
            </button>
          ))}

          {/* Action cell — always present */}
          <button
            onClick={() => setAddOpen(true)}
            className="col-span-2 md:col-span-3 md:row-span-1 group relative overflow-hidden rounded-[2rem] border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all duration-500 flex items-center justify-center min-h-[180px]"
          >
            <div className="text-center space-y-3 relative z-10">
              <div className="w-14 h-14 rounded-full border border-primary flex items-center justify-center mx-auto transition-transform duration-500 group-hover:scale-110">
                <Plus className="h-6 w-6 text-primary" strokeWidth={2} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-primary">
                  New Avatar
                </p>
                <p className="text-[10px] text-primary/60 mt-1 uppercase font-medium">
                  Add to your cast
                </p>
              </div>
            </div>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.1)_0%,transparent_70%)]" />
          </button>
        </div>
      </Section>
      <AddBrandCharacterDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}

// ============================================================
// Tab: Locations  (Sub-Toggle: Environments | Architecture)
// ============================================================
function LocationsTab() {
  const [params, setParams] = useSearchParams();
  const sub = (params.get('sub') as 'env' | 'arch') || 'env';

  const setSub = (next: 'env' | 'arch') => {
    setParams((p) => {
      p.set('tab', 'locations');
      p.set('sub', next);
      return p;
    });
  };

  return (
    <div className="space-y-4">
      <div className="inline-flex p-1 rounded-full bg-muted/40 border border-border/40 text-xs">
        <button
          onClick={() => setSub('env')}
          className={`px-3 py-1.5 rounded-full transition flex items-center gap-1.5 ${
            sub === 'env' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MapPin className="h-3.5 w-3.5" /> Environments
        </button>
        <button
          onClick={() => setSub('arch')}
          className={`px-3 py-1.5 rounded-full transition flex items-center gap-1.5 ${
            sub === 'arch' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Building2 className="h-3.5 w-3.5" /> Architecture
        </button>
      </div>

      {sub === 'env' ? <EnvironmentsPane /> : <ArchitecturePane />}
    </div>
  );
}

function EnvironmentsPane() {
  const { locations, isLoading, createLocation, toggleFavorite, archiveLocation } =
    useBrandLocations();
  return (
    <AssetTabBody
      kind="location"
      label="Location"
      items={locations as any[]}
      isLoading={isLoading}
      onCreate={(input) => createLocation.mutateAsync(input)}
      onToggleFavorite={(id, fav) => toggleFavorite.mutate({ id, is_favorite: fav })}
      onArchive={(id) => archiveLocation.mutate(id)}
      icon={MapPin}
      emptyTitle="No environments yet"
      emptyBody="Add your first environment to lock atmosphere across scenes — wheat fields, neon alleys, modern offices."
    />
  );
}

function ArchitecturePane() {
  const { buildings, isLoading, createBuilding, toggleFavorite, archiveBuilding } =
    useBrandBuildings();
  return (
    <AssetTabBody
      kind="building"
      label="Building"
      items={buildings as any[]}
      isLoading={isLoading}
      onCreate={(input) => createBuilding.mutateAsync(input)}
      onToggleFavorite={(id, fav) => toggleFavorite.mutate({ id, is_favorite: fav })}
      onArchive={(id) => archiveBuilding.mutate(id)}
      icon={Building2}
      emptyTitle="No architecture yet"
      emptyBody="Save churches, houses, castles, temples, skyscrapers or bridges to drop them into any scene as a consistent backdrop."
    />
  );
}

// ============================================================
// Tab: Props
// ============================================================
function PropsTab() {
  const { props: items, isLoading, createProp, toggleFavorite, archiveProp } =
    useBrandProps();

  return (
    <AssetTabBody
      kind="prop"
      label="Prop"
      items={items as any[]}
      isLoading={isLoading}
      onCreate={(input) => createProp.mutateAsync(input)}
      onToggleFavorite={(id, fav) => toggleFavorite.mutate({ id, is_favorite: fav })}
      onArchive={(id) => archiveProp.mutate(id)}
      icon={Package}
      emptyTitle="No props yet"
      emptyBody="Furniture, vehicles, tech, instruments — anything you want consistently in your scenes."
    />
  );
}

// ============================================================
// Shared Asset Tab Body (used by Locations, Buildings, Props)
// ============================================================
interface AssetTabBodyProps {
  kind: 'location' | 'building' | 'prop';
  label: string;
  items: any[];
  isLoading: boolean;
  onCreate: (input: { name: string; description?: string; file: File }) => Promise<any>;
  onToggleFavorite: (id: string, fav: boolean) => void;
  onArchive: (id: string) => void;
  icon: typeof MapPin;
  emptyTitle: string;
  emptyBody: string;
}

function AssetTabBody({
  kind,
  label,
  items,
  isLoading,
  onCreate,
  onToggleFavorite,
  onArchive,
  icon: Icon,
  emptyTitle,
  emptyBody,
}: AssetTabBodyProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setDescription('');
    setFile(null);
  };

  const handleCreate = async () => {
    if (!name.trim() || !file) return;
    setSubmitting(true);
    try {
      await onCreate({ name: name.trim(), description: description.trim() || undefined, file });
      reset();
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <GenerateAssetButton kind={kind} label={label} />
        <Button onClick={() => setOpen(true)} variant="outline">
          <Plus className="h-4 w-4 mr-2" /> Upload {label}
        </Button>
      </div>

      <CatalogBrowser kind={kind} />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <Card className="p-12 text-center bg-card/40 border-primary/15">
          <Icon className="h-10 w-10 mx-auto text-primary/60 mb-3" />
          <h3 className="font-serif text-2xl mb-2">{emptyTitle}</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">{emptyBody}</p>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add {label}
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((item) => (
            <Card
              key={item.id}
              className="overflow-hidden bg-card/60 border-border/60 backdrop-blur-xl group"
            >
              <div className="aspect-video bg-muted relative">
                <img
                  src={item.reference_image_url}
                  alt={item.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <button
                  onClick={() => onToggleFavorite(item.id, !item.is_favorite)}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 backdrop-blur opacity-0 group-hover:opacity-100 transition"
                  aria-label="Favorite"
                >
                  <Star
                    className={`h-4 w-4 ${
                      item.is_favorite
                        ? 'fill-primary text-primary'
                        : 'text-muted-foreground'
                    }`}
                  />
                </button>
              </div>
              <div className="p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-medium text-sm truncate">{item.name}</h4>
                  <button
                    onClick={() => {
                      if (confirm(`Archive this ${label.toLowerCase()}?`))
                        onArchive(item.id);
                    }}
                    className="text-muted-foreground hover:text-destructive transition opacity-0 group-hover:opacity-100"
                    aria-label="Archive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {item.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {item.description}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`My ${label.toLowerCase()}`} />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="A short note that helps the AI keep this asset consistent."
              />
            </div>
            <div>
              <Label>Reference image</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Upload one clear photo. We'll extract a visual identity card so the AI can recreate it in any scene.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || !file || submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save {label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Generic empty / loading section wrapper for People tab
// ============================================================
function Section({
  loading,
  items,
  action,
  empty,
  children,
}: {
  loading: boolean;
  items: any[];
  action?: React.ReactNode;
  empty: { title: string; body: string; cta: { label: string; to?: string; onClick?: () => void } };
  icon: typeof Users;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="p-12 text-center bg-card/40 border-primary/15">
        <h3 className="font-serif text-2xl mb-2">{empty.title}</h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">{empty.body}</p>
        {empty.cta.onClick ? (
          <Button onClick={empty.cta.onClick}>{empty.cta.label}</Button>
        ) : (
          <Button asChild>
            <Link to={empty.cta.to ?? '#'}>{empty.cta.label}</Link>
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {action && <div className="flex items-center justify-end">{action}</div>}
      {children}
    </div>
  );
}

// ============================================================
// "Generate your own" — prompt → Nano Banana 2 → identity card → row
// ============================================================
function GenerateAssetButton({
  kind,
  label,
}: {
  kind: 'location' | 'building' | 'prop';
  label: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);

  const placeholder =
    kind === 'location'
      ? 'A misty Norwegian fjord at sunrise, dramatic cliffs, soft golden light…'
      : kind === 'building'
        ? 'A baroque cathedral with twin spires, weathered stone, overcast sky…'
        : 'A vintage brass telescope on a leather-bound astronomy book…';

  const reset = () => { setName(''); setPrompt(''); };

  const submit = async () => {
    if (!name.trim() || !prompt.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-world-asset', {
        body: { kind, name: name.trim(), prompt: prompt.trim() },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`${label} generated and saved`);
      const queryKey =
        kind === 'location' ? 'brand-locations' : kind === 'building' ? 'brand-buildings' : 'brand-props';
      qc.invalidateQueries({ queryKey: [queryKey] });
      reset();
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Generation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Sparkles className="h-4 w-4" />
        Generate {label} with AI
      </Button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Generate {label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`My AI ${label.toLowerCase()}`}
                disabled={busy}
              />
            </div>
            <div>
              <Label>Prompt (English works best)</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder={placeholder}
                disabled={busy}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Rendered with Nano Banana 2. We auto-extract a visual identity card so this {label.toLowerCase()} can be reused as a reference in the Toolkit, Composer and image-to-video (Vidu / Hailuo).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={!name.trim() || !prompt.trim() || busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
