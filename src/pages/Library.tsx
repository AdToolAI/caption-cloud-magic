// Cast & World — unified library page combining People, Locations,
// Buildings and Props in a single Hub. Replaces the standalone
// /avatars and /locations pages while keeping their detail routes intact.

import { useState, useMemo } from 'react';
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
  Library as LibraryIcon,
} from 'lucide-react';
import { useAccessibleCharacters } from '@/hooks/useAccessibleCharacters';
import { useBrandLocations } from '@/hooks/useBrandLocations';
import { useBrandBuildings } from '@/hooks/useBrandBuildings';
import { useBrandProps } from '@/hooks/useBrandProps';
import { CatalogBrowser } from '@/components/library-hubs/CatalogBrowser';

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

      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <header className="mb-8">
            <div className="flex items-center gap-2 text-primary text-sm mb-2">
              <LibraryIcon className="h-4 w-4" />
              <span className="tracking-widest uppercase">Cast & World</span>
            </div>
            <h1 className="font-serif text-4xl md:text-5xl">Your Asset Library</h1>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              People, places, architecture and props — all stored as reusable identities so
              every scene you generate stays visually consistent.
            </p>
          </header>

          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <TabsList className="mb-6">
              {TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>

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

  return (
    <Section
      icon={Users}
      empty={{
        title: 'No avatars yet',
        body: 'Create your first avatar to lock visual + voice identity across every scene.',
        cta: { label: 'Open Avatar Studio', to: '/avatars' },
      }}
      loading={isLoading}
      items={chars}
      action={
        <Button asChild variant="outline">
          <Link to="/avatars">
            <Plus className="h-4 w-4 mr-2" />
            New Avatar
          </Link>
        </Button>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {chars.map((c: any) => (
          <Card
            key={c.id}
            onClick={() => onOpenAvatar(c.id)}
            className="overflow-hidden bg-card/60 border-border/60 backdrop-blur-xl group cursor-pointer hover:border-primary/50 transition"
          >
            <div className="aspect-[4/5] bg-muted relative">
              {(c.portrait_url || c.reference_image_url) && (
                <img
                  src={c.portrait_url || c.reference_image_url}
                  alt={c.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}
            </div>
            <div className="p-3">
              <h4 className="font-medium text-sm truncate">{c.name}</h4>
              {c.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  {c.description}
                </p>
              )}
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}

// ============================================================
// Tab: Locations
// ============================================================
function LocationsTab() {
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
      emptyTitle="No locations yet"
      emptyBody="Add your first location to lock atmosphere across scenes — wheat fields, neon alleys, modern offices."
    />
  );
}

// ============================================================
// Tab: Buildings
// ============================================================
function BuildingsTab() {
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
      emptyTitle="No buildings yet"
      emptyBody="Save churches, houses, castles, temples or modern architecture to drop them into any scene as a consistent backdrop."
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
      <div className="flex items-center justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New {label}
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
  empty: { title: string; body: string; cta: { label: string; to: string } };
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
        <Button asChild>
          <Link to={empty.cta.to}>{empty.cta.label}</Link>
        </Button>
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
