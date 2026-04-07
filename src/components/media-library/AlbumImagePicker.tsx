import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, FolderOpen, Check, Loader2, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Album {
  id: string;
  name: string;
  cover_url: string | null;
  image_count: number;
}

interface AlbumImage {
  id: string;
  image_url: string;
  prompt: string | null;
  created_at: string;
}

interface AlbumImagePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectImage: (url: string) => void;
}

export function AlbumImagePicker({ open, onOpenChange, onSelectImage }: AlbumImagePickerProps) {
  const { user } = useAuth();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [images, setImages] = useState<AlbumImage[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedAlbumName, setSelectedAlbumName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && user) loadAlbums();
  }, [open, user]);

  const loadAlbums = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: albumsData } = await supabase
        .from('studio_albums')
        .select('id, name, cover_image_url')
        .eq('user_id', user.id)
        .order('is_system', { ascending: false })
        .order('name');

      if (albumsData) {
        // Get image counts per album
        const albumsWithCounts = await Promise.all(
          albumsData.map(async (album) => {
            const { count } = await supabase
              .from('studio_images')
              .select('id', { count: 'exact', head: true })
              .eq('album_id', album.id);
            return { ...album, image_count: count || 0 };
          })
        );
        setAlbums(albumsWithCounts.filter(a => a.image_count > 0));
      }
    } finally {
      setLoading(false);
    }
  };

  const loadImages = async (albumId: string, albumName: string) => {
    setSelectedAlbumId(albumId);
    setSelectedAlbumName(albumName);
    setLoading(true);
    try {
      const { data } = await supabase
        .from('studio_images')
        .select('id, image_url, prompt, created_at')
        .eq('album_id', albumId)
        .order('created_at', { ascending: false });
      setImages(data || []);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (url: string) => {
    onSelectImage(url);
    onOpenChange(false);
    setSelectedAlbumId(null);
    setImages([]);
  };

  const handleBack = () => {
    setSelectedAlbumId(null);
    setImages([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedAlbumId && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {selectedAlbumId ? selectedAlbumName : 'Bild aus Alben wählen'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !selectedAlbumId ? (
            // Album list
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-1">
              {albums.length === 0 ? (
                <p className="col-span-full text-center text-muted-foreground py-8">
                  Keine Alben mit Bildern gefunden
                </p>
              ) : (
                albums.map((album) => (
                  <button
                    key={album.id}
                    onClick={() => loadImages(album.id, album.name)}
                    className="group relative rounded-lg border border-border overflow-hidden hover:border-primary/50 transition-all text-left"
                  >
                    {album.cover_url ? (
                      <img src={album.cover_url} alt={album.name} className="w-full h-24 object-cover" />
                    ) : (
                      <div className="w-full h-24 bg-muted flex items-center justify-center">
                        <FolderOpen className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="p-2">
                      <p className="text-sm font-medium truncate">{album.name}</p>
                      <p className="text-xs text-muted-foreground">{album.image_count} Bilder</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            // Image grid
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-1">
              {images.length === 0 ? (
                <p className="col-span-full text-center text-muted-foreground py-8">
                  Keine Bilder in diesem Album
                </p>
              ) : (
                images.map((img) => (
                  <button
                    key={img.id}
                    onClick={() => handleSelect(img.image_url)}
                    className="group relative rounded-lg overflow-hidden border border-border hover:border-primary transition-all"
                  >
                    <img src={img.image_url} alt={img.prompt || ''} className="w-full h-24 object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                      <Check className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
