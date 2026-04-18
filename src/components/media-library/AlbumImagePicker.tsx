import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, FolderOpen, Check, Loader2, ImageIcon, Inbox } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const ORPHAN_ALBUM_ID = '__orphan__';

interface Album {
  id: string;
  name: string;
  cover_image_url: string | null;
  image_count: number;
  is_orphan?: boolean;
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
      // Single query: albums with embedded image counts
      const { data: albumsData, error: albumsError } = await supabase
        .from('studio_albums')
        .select('id, name, cover_image_url, is_system, studio_images(count)')
        .eq('user_id', user.id)
        .order('is_system', { ascending: false })
        .order('name');

      if (albumsError) {
        console.error('[AlbumImagePicker] albums query error:', albumsError);
        toast.error('Fehler beim Laden der Alben', { description: albumsError.message });
        return;
      }

      // Map embedded counts and fetch fallback covers in one batch
      const mapped: Album[] = (albumsData || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        cover_image_url: a.cover_image_url,
        image_count: a.studio_images?.[0]?.count ?? 0,
      }));

      // Fetch latest image as fallback cover only for albums missing a cover
      const needsCover = mapped.filter((a) => !a.cover_image_url && a.image_count > 0);
      if (needsCover.length > 0) {
        const { data: covers } = await supabase
          .from('studio_images')
          .select('album_id, image_url, created_at')
          .in('album_id', needsCover.map((a) => a.id))
          .order('created_at', { ascending: false });

        const coverMap = new Map<string, string>();
        (covers || []).forEach((row: any) => {
          if (!coverMap.has(row.album_id)) coverMap.set(row.album_id, row.image_url);
        });
        mapped.forEach((a) => {
          if (!a.cover_image_url) a.cover_image_url = coverMap.get(a.id) || null;
        });
      }

      // Check for orphan images (album_id IS NULL)
      const { count: orphanCount, data: orphanCover } = await (async () => {
        const [{ count }, { data }] = await Promise.all([
          supabase
            .from('studio_images')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .is('album_id', null),
          supabase
            .from('studio_images')
            .select('image_url')
            .eq('user_id', user.id)
            .is('album_id', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        return { count: count ?? 0, data };
      })();

      const finalAlbums: Album[] = mapped.filter((a) => a.image_count > 0);

      if (orphanCount > 0) {
        finalAlbums.unshift({
          id: ORPHAN_ALBUM_ID,
          name: 'Ohne Album',
          cover_image_url: orphanCover?.image_url || null,
          image_count: orphanCount,
          is_orphan: true,
        });
      }

      setAlbums(finalAlbums);
    } catch (err: any) {
      console.error('[AlbumImagePicker] loadAlbums exception:', err);
      toast.error('Unerwarteter Fehler', { description: err?.message });
    } finally {
      setLoading(false);
    }
  };

  const loadImages = async (albumId: string, albumName: string) => {
    if (!user) return;
    setSelectedAlbumId(albumId);
    setSelectedAlbumName(albumName);
    setLoading(true);
    try {
      let query = supabase
        .from('studio_images')
        .select('id, image_url, prompt, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (albumId === ORPHAN_ALBUM_ID) {
        query = query.is('album_id', null);
      } else {
        query = query.eq('album_id', albumId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[AlbumImagePicker] loadImages error:', error);
        toast.error('Album konnte nicht geöffnet werden', { description: error.message });
        setImages([]);
        return;
      }
      setImages(data || []);
    } catch (err: any) {
      console.error('[AlbumImagePicker] loadImages exception:', err);
      toast.error('Unerwarteter Fehler', { description: err?.message });
      setImages([]);
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
                    disabled={loading}
                    className="group relative rounded-lg border border-border overflow-hidden hover:border-primary/50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {album.cover_image_url ? (
                      <img src={album.cover_image_url} alt={album.name} className="w-full h-24 object-cover" />
                    ) : (
                      <div className="w-full h-24 bg-muted flex items-center justify-center">
                        {album.is_orphan ? (
                          <Inbox className="h-8 w-8 text-muted-foreground" />
                        ) : (
                          <FolderOpen className="h-8 w-8 text-muted-foreground" />
                        )}
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
