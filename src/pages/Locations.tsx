import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, MapPin, Loader2, Star, Trash2 } from 'lucide-react';
import { useBrandLocations } from '@/hooks/useBrandLocations';
import { LocationVibeStrip } from '@/components/locations/LocationVibeStrip';

const Locations = () => {
  const { locations, isLoading, createLocation, toggleFavorite, archiveLocation } = useBrandLocations();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const handleCreate = async () => {
    if (!name.trim() || !file) return;
    await createLocation.mutateAsync({ name: name.trim(), description: description.trim() || undefined, file });
    setName(''); setDescription(''); setFile(null); setOpen(false);
  };

  return (
    <>
      <Helmet>
        <title>Location Library — Reusable cinematic settings | useadtool</title>
        <meta name="description" content="Save your recurring filming locations. Reuse the same environment across every AI video scene with full visual consistency." />
      </Helmet>

      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
            <div>
              <div className="flex items-center gap-2 text-primary text-sm mb-2">
                <MapPin className="h-4 w-4" />
                <span className="tracking-widest uppercase">Location Library</span>
              </div>
              <h1 className="font-serif text-4xl md:text-5xl">Your Locations</h1>
              <p className="text-muted-foreground mt-2 max-w-2xl">
                Build a personal scout — wheat fields, neon alleys, modern offices — and reuse them across every AI video scene with consistent atmosphere.
              </p>
            </div>
            <Button onClick={() => setOpen(true)} size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-2" /> New Location
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : locations.length === 0 ? (
            <Card className="p-12 text-center bg-card/40 border-primary/15">
              <MapPin className="h-10 w-10 mx-auto text-primary/60 mb-3" />
              <h3 className="font-serif text-2xl mb-2">No locations yet</h3>
              <p className="text-muted-foreground mb-6">Add your first location to lock visual consistency across scenes.</p>
              <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" /> Add Location</Button>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {locations.map((loc) => (
                <Card key={loc.id} className="overflow-hidden bg-card/60 border-border/60 backdrop-blur-xl group">
                  <div className="aspect-video bg-muted relative">
                    <img src={loc.reference_image_url} alt={loc.name} className="w-full h-full object-cover" loading="lazy" />
                    <button
                      onClick={() => toggleFavorite.mutate({ id: loc.id, is_favorite: !loc.is_favorite })}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Star className={`h-4 w-4 ${loc.is_favorite ? 'fill-primary text-primary' : 'text-muted-foreground'}`} />
                    </button>
                  </div>
                  <div className="p-3 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium text-sm truncate">{loc.name}</h4>
                      <button
                        onClick={() => { if (confirm('Archive this location?')) archiveLocation.mutate(loc.id); }}
                        className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {loc.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2">{loc.description}</p>
                    )}
                    {loc.visual_identity_json?.setting && (
                      <p className="text-[10px] text-primary/80 truncate">{loc.visual_identity_json.setting}</p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Location</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Wheat Field at Dawn" />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Vast golden wheat field, drone-friendly, dawn light" rows={3} />
            </div>
            <div>
              <Label>Reference Image *</Label>
              <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <p className="text-[11px] text-muted-foreground mt-1">AI will extract atmosphere, lighting and color palette automatically.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!name.trim() || !file || createLocation.isPending}>
              {createLocation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Locations;
