import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FolderPlus, Image as ImageIcon, ArrowLeft, Trash2, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImageCard } from "./ImageCard";
import { SaveToAlbumDialog } from "./SaveToAlbumDialog";

interface Album {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  created_at: string;
  image_count?: number;
}

interface StudioImage {
  id: string;
  image_url: string;
  prompt: string | null;
  style: string | null;
  aspect_ratio: string | null;
  album_id: string | null;
  created_at: string;
}

export function AlbumManager() {
  const { user } = useAuth();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [unsortedImages, setUnsortedImages] = useState<StudioImage[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [albumImages, setAlbumImages] = useState<StudioImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [creating, setCreating] = useState(false);
  const [dragOverAlbumId, setDragOverAlbumId] = useState<string | null>(null);

  // Album dialog for unsorted images
  const [albumDialogOpen, setAlbumDialogOpen] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadAlbums();
  }, [user]);

  const loadAlbums = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [albumsRes, imagesRes] = await Promise.all([
        supabase.from('studio_albums').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('studio_images').select('*').eq('user_id', user.id).is('album_id', null).order('created_at', { ascending: false }),
      ]);

      if (albumsRes.data) {
        const { data: countData } = await supabase
          .from('studio_images')
          .select('album_id')
          .eq('user_id', user.id)
          .not('album_id', 'is', null);

        const counts: Record<string, number> = {};
        countData?.forEach(img => {
          if (img.album_id) counts[img.album_id] = (counts[img.album_id] || 0) + 1;
        });

        setAlbums(albumsRes.data.map(a => ({ ...a, image_count: counts[a.id] || 0 })));
      }
      if (imagesRes.data) setUnsortedImages(imagesRes.data as StudioImage[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadAlbumImages = async (album: Album) => {
    if (!user) return;
    setSelectedAlbum(album);
    const { data } = await supabase
      .from('studio_images')
      .select('*')
      .eq('user_id', user.id)
      .eq('album_id', album.id)
      .order('created_at', { ascending: false });
    setAlbumImages((data || []) as StudioImage[]);
  };

  const createAlbum = async () => {
    if (!user || !newAlbumName.trim()) return;
    setCreating(true);
    const { error } = await supabase.from('studio_albums').insert({
      user_id: user.id,
      name: newAlbumName.trim(),
    });
    if (error) {
      toast.error("Fehler beim Erstellen");
    } else {
      toast.success("Album erstellt! 📁");
      setNewAlbumName("");
      setShowCreateDialog(false);
      loadAlbums();
    }
    setCreating(false);
  };

  const deleteAlbum = async (albumId: string) => {
    const { error } = await supabase.from('studio_albums').delete().eq('id', albumId);
    if (!error) {
      toast.success("Album gelöscht");
      setSelectedAlbum(null);
      loadAlbums();
    }
  };

  // Drag & Drop handlers
  const handleDragOver = (e: React.DragEvent, albumId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverAlbumId(albumId);
  };

  const handleDragLeave = () => {
    setDragOverAlbumId(null);
  };

  const handleDrop = async (e: React.DragEvent, albumId: string) => {
    e.preventDefault();
    setDragOverAlbumId(null);

    try {
      const imageData = JSON.parse(e.dataTransfer.getData('application/json'));
      if (!imageData?.id) return;

      const { error } = await supabase
        .from('studio_images')
        .update({ album_id: albumId })
        .eq('id', imageData.id);

      if (error) {
        toast.error("Fehler beim Verschieben");
        return;
      }

      toast.success("Bild verschoben! 📁");
      // Remove from unsorted + update album count
      setUnsortedImages(prev => prev.filter(img => img.id !== imageData.id));
      setAlbums(prev => prev.map(a =>
        a.id === albumId ? { ...a, image_count: (a.image_count || 0) + 1 } : a
      ));
    } catch {
      // Invalid drag data
    }
  };

  const handleSaveToAlbum = (image: any) => {
    if (!image.id) return;
    setSelectedImageId(image.id);
    setAlbumDialogOpen(true);
  };

  const handleUnsortedImageSaved = () => {
    if (selectedImageId) {
      setUnsortedImages(prev => prev.filter(img => img.id !== selectedImageId));
      setSelectedImageId(null);
      loadAlbums();
    }
  };

  const handleDeleteImage = async (image: any) => {
    if (!image.id) return;
    try {
      const url = new URL(image.url);
      const pathMatch = url.pathname.match(/\/object\/public\/background-projects\/(.+)/);
      if (pathMatch) {
        await supabase.storage.from('background-projects').remove([pathMatch[1]]);
      }
      await supabase.from('studio_images').delete().eq('id', image.id);
      setUnsortedImages(prev => prev.filter(img => img.id !== image.id));
      setAlbumImages(prev => prev.filter(img => img.id !== image.id));
      toast.success("Bild gelöscht 🗑️");
      loadAlbums();
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Löschen");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Album detail view
  if (selectedAlbum) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedAlbum(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Zurück
          </Button>
          <h3 className="text-lg font-semibold">{selectedAlbum.name}</h3>
          <span className="text-sm text-muted-foreground">({albumImages.length} Bilder)</span>
          <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto text-destructive" onClick={() => deleteAlbum(selectedAlbum.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        {albumImages.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Keine Bilder in diesem Album</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {albumImages.map((img, i) => (
              <ImageCard
                key={img.id}
                image={{ id: img.id, url: img.image_url, prompt: img.prompt || undefined, style: img.style || undefined }}
                index={i}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Albums grid + unsorted
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Meine Alben</h3>
        <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(true)}>
          <FolderPlus className="h-4 w-4 mr-1" /> Neues Album
        </Button>
      </div>

      {/* Albums */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {albums.map((album, i) => (
          <motion.div
            key={album.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card
              className={`cursor-pointer hover:border-primary/40 hover:shadow-md transition-all group overflow-hidden ${
                dragOverAlbumId === album.id ? 'border-primary border-2 shadow-lg shadow-primary/20 scale-[1.02]' : ''
              }`}
              onClick={() => loadAlbumImages(album)}
              onDragOver={(e) => handleDragOver(e, album.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, album.id)}
            >
              <div className="aspect-video bg-muted/30 relative overflow-hidden">
                {album.cover_image_url ? (
                  <img src={album.cover_image_url} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt={album.name} />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <FolderPlus className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
                {dragOverAlbumId === album.id && (
                  <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                    <FolderPlus className="h-8 w-8 text-primary animate-pulse" />
                  </div>
                )}
              </div>
              <CardContent className="p-3">
                <p className="font-medium text-sm truncate">{album.name}</p>
                <p className="text-xs text-muted-foreground">{album.image_count || 0} Bilder</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Unsorted Images */}
      {unsortedImages.length > 0 && (
        <div>
          <h4 className="text-md font-medium mb-3 text-muted-foreground">Unsortierte Bilder ({unsortedImages.length})</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <AnimatePresence>
              {unsortedImages.map((img, i) => (
                <ImageCard
                  key={img.id}
                  image={{ id: img.id, url: img.image_url, prompt: img.prompt || undefined, style: img.style || undefined }}
                  index={i}
                  onSaveToAlbum={handleSaveToAlbum}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {albums.length === 0 && unsortedImages.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Noch keine Bilder oder Alben vorhanden</p>
          <p className="text-sm mt-1">Generiere dein erstes Bild im "Generieren" Tab!</p>
        </div>
      )}

      {/* Create Album Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues Album erstellen</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Album Name..."
            value={newAlbumName}
            onChange={(e) => setNewAlbumName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createAlbum()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Abbrechen</Button>
            <Button onClick={createAlbum} disabled={creating || !newAlbumName.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FolderPlus className="h-4 w-4 mr-1" />}
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save to Album Dialog for unsorted images */}
      {selectedImageId && (
        <SaveToAlbumDialog
          open={albumDialogOpen}
          onOpenChange={setAlbumDialogOpen}
          imageId={selectedImageId}
          onSaved={handleUnsortedImageSaved}
        />
      )}
    </div>
  );
}
