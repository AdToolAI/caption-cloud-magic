import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Search,
  User,
  MapPin,
  Pencil,
  Trash2,
  ImageIcon,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import CharacterEditor from '@/components/motion-studio/CharacterEditor';
import LocationEditor from '@/components/motion-studio/LocationEditor';
import type { MotionStudioCharacter, MotionStudioLocation } from '@/types/motion-studio';

type Tab = 'characters' | 'locations';

export default function MotionStudioLibrary() {
  const {
    characters,
    locations,
    loading,
    deleteCharacter,
    deleteLocation,
  } = useMotionStudioLibrary();
  const [tab, setTab] = useState<Tab>('characters');
  const [search, setSearch] = useState('');
  const [editingChar, setEditingChar] = useState<MotionStudioCharacter | null>(null);
  const [editingLoc, setEditingLoc] = useState<MotionStudioLocation | null>(null);
  const [charEditorOpen, setCharEditorOpen] = useState(false);
  const [locEditorOpen, setLocEditorOpen] = useState(false);

  const q = search.trim().toLowerCase();
  const filteredChars = characters.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.tags.some((t) => t.includes(q))
  );
  const filteredLocs = locations.filter(
    (l) =>
      !q ||
      l.name.toLowerCase().includes(q) ||
      l.description.toLowerCase().includes(q) ||
      l.tags.some((t) => t.includes(q))
  );

  const openNewChar = () => {
    setEditingChar(null);
    setCharEditorOpen(true);
  };
  const openEditChar = (c: MotionStudioCharacter) => {
    setEditingChar(c);
    setCharEditorOpen(true);
  };
  const openNewLoc = () => {
    setEditingLoc(null);
    setLocEditorOpen(true);
  };
  const openEditLoc = (l: MotionStudioLocation) => {
    setEditingLoc(l);
    setLocEditorOpen(true);
  };

  return (
    <>
      <Helmet>
        <title>Motion Studio Library | Charaktere & Locations</title>
        <meta
          name="description"
          content="Wiederverwendbare Charaktere und Locations für deine AI-Video-Projekte. Konsistenz über alle Szenen hinweg."
        />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-b from-background via-background to-background/95">
        {/* Header */}
        <div className="relative border-b border-border/40 bg-gradient-to-r from-background/80 via-background to-background/80 backdrop-blur">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
          <div className="relative container max-w-7xl mx-auto px-6 py-6">
            <div className="flex items-center gap-3 mb-3">
              <Link to="/video-composer">
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Zurück zu Motion Studio
                </Button>
              </Link>
            </div>
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
                  Motion Studio Library
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Charaktere & Locations einmal definieren — überall wiederverwenden.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1.5">
                  <Sparkles className="h-3 w-3 text-primary" />
                  {characters.length} Charaktere · {locations.length} Locations
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="container max-w-7xl mx-auto px-6 py-6">
          {/* Tabs + Search + Add */}
          <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
            <div className="inline-flex items-center rounded-lg border border-border/40 bg-card/40 p-1">
              <button
                onClick={() => setTab('characters')}
                className={`px-4 py-1.5 text-sm rounded-md transition flex items-center gap-2 ${
                  tab === 'characters'
                    ? 'bg-primary/15 text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <User className="h-3.5 w-3.5" />
                Charaktere
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                  {characters.length}
                </Badge>
              </button>
              <button
                onClick={() => setTab('locations')}
                className={`px-4 py-1.5 text-sm rounded-md transition flex items-center gap-2 ${
                  tab === 'locations'
                    ? 'bg-primary/15 text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <MapPin className="h-3.5 w-3.5" />
                Locations
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                  {locations.length}
                </Badge>
              </button>
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-md ml-auto">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Suchen nach Name, Beschreibung, Tag..."
                  className="pl-8 bg-card/40 border-border/40"
                />
              </div>
              <Button
                onClick={tab === 'characters' ? openNewChar : openNewLoc}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Neu
              </Button>
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-64 rounded-xl bg-card/40 animate-pulse border border-border/40" />
              ))}
            </div>
          ) : tab === 'characters' ? (
            <CharacterGrid
              items={filteredChars}
              onEdit={openEditChar}
              onDelete={(id) => {
                if (confirm('Diesen Charakter wirklich löschen?')) deleteCharacter(id);
              }}
              onCreate={openNewChar}
            />
          ) : (
            <LocationGrid
              items={filteredLocs}
              onEdit={openEditLoc}
              onDelete={(id) => {
                if (confirm('Diese Location wirklich löschen?')) deleteLocation(id);
              }}
              onCreate={openNewLoc}
            />
          )}
        </div>
      </div>

      <CharacterEditor
        open={charEditorOpen}
        onOpenChange={setCharEditorOpen}
        character={editingChar}
      />
      <LocationEditor
        open={locEditorOpen}
        onOpenChange={setLocEditorOpen}
        location={editingLoc}
      />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function CharacterGrid({
  items,
  onEdit,
  onDelete,
  onCreate,
}: {
  items: MotionStudioCharacter[];
  onEdit: (c: MotionStudioCharacter) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}) {
  if (items.length === 0) {
    return <EmptyState kind="characters" onCreate={onCreate} />;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.map((c) => (
        <Card
          key={c.id}
          className="group relative overflow-hidden border-border/40 bg-card/60 hover:bg-card/80 hover:border-primary/40 transition-all hover:shadow-lg hover:shadow-primary/5"
        >
          {/* Image / placeholder */}
          <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-primary/5 via-card to-card border-b border-border/40">
            {c.reference_image_url ? (
              <img
                src={c.reference_image_url}
                alt={c.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground/50">
                <User className="h-12 w-12" />
                <span className="text-[10px]">Kein Reference-Image</span>
              </div>
            )}
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="icon"
                variant="secondary"
                className="h-7 w-7 backdrop-blur"
                onClick={() => onEdit(c)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                className="h-7 w-7 backdrop-blur text-destructive"
                onClick={() => onDelete(c.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
          {/* Body */}
          <div className="p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-sm truncate">{c.name}</h3>
              {c.usage_count > 0 && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0">
                  {c.usage_count}× verwendet
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">
              {c.description || 'Keine Beschreibung'}
            </p>
            {c.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {c.tags.slice(0, 3).map((t) => (
                  <Badge key={t} variant="secondary" className="text-[9px] h-4 px-1.5">
                    #{t}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function LocationGrid({
  items,
  onEdit,
  onDelete,
  onCreate,
}: {
  items: MotionStudioLocation[];
  onEdit: (l: MotionStudioLocation) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}) {
  if (items.length === 0) {
    return <EmptyState kind="locations" onCreate={onCreate} />;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.map((l) => (
        <Card
          key={l.id}
          className="group relative overflow-hidden border-border/40 bg-card/60 hover:bg-card/80 hover:border-primary/40 transition-all hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-primary/5 via-card to-card border-b border-border/40">
            {l.reference_image_url ? (
              <img
                src={l.reference_image_url}
                alt={l.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground/50">
                <MapPin className="h-12 w-12" />
                <span className="text-[10px]">Kein Reference-Image</span>
              </div>
            )}
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="icon"
                variant="secondary"
                className="h-7 w-7 backdrop-blur"
                onClick={() => onEdit(l)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                className="h-7 w-7 backdrop-blur text-destructive"
                onClick={() => onDelete(l.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-sm truncate">{l.name}</h3>
              {l.usage_count > 0 && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0">
                  {l.usage_count}×
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">
              {l.description || 'Keine Beschreibung'}
            </p>
            {l.lighting_notes && (
              <p className="text-[10px] text-primary/80 truncate">💡 {l.lighting_notes}</p>
            )}
            {l.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {l.tags.slice(0, 3).map((t) => (
                  <Badge key={t} variant="secondary" className="text-[9px] h-4 px-1.5">
                    #{t}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({ kind, onCreate }: { kind: 'characters' | 'locations'; onCreate: () => void }) {
  const isChars = kind === 'characters';
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6 rounded-xl border border-dashed border-border/40 bg-card/30">
      <div className="p-4 rounded-full bg-primary/10 mb-4">
        {isChars ? (
          <User className="h-8 w-8 text-primary" />
        ) : (
          <MapPin className="h-8 w-8 text-primary" />
        )}
      </div>
      <h3 className="text-lg font-semibold mb-1.5">
        {isChars ? 'Noch keine Charaktere' : 'Noch keine Locations'}
      </h3>
      <p className="text-sm text-muted-foreground max-w-md mb-5">
        {isChars
          ? 'Lege wiederverwendbare Charaktere mit Reference-Image an, damit deine KI-Videos über alle Szenen hinweg konsistent bleiben.'
          : 'Speichere Schauplätze einmal mit Foto-Referenz und nutze sie in jedem Motion-Studio-Projekt.'}
      </p>
      <Button onClick={onCreate} className="gap-2">
        <Plus className="h-4 w-4" />
        {isChars ? 'Ersten Charakter anlegen' : 'Erste Location anlegen'}
      </Button>
    </div>
  );
}
