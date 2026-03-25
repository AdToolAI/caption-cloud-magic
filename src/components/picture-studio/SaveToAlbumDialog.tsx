import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderPlus, Folder, Loader2, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Album {
  id: string;
  name: string;
}

interface SaveToAlbumDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageId: string;
  onSaved: () => void;
}

export function SaveToAlbumDialog({ open, onOpenChange, imageId, onSaved }: SaveToAlbumDialogProps) {
  const { user } = useAuth();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open && user) loadAlbums();
  }, [open, user]);

  const loadAlbums = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('studio_albums')
      .select('id, name')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setAlbums(data || []);
    setLoading(false);
  };

  const saveToAlbum = async (albumId: string) => {
    setSaving(true);
    const { error } = await supabase
      .from('studio_images')
      .update({ album_id: albumId })
      .eq('id', imageId);
    
    if (error) {
      toast.error("Fehler beim Speichern");
    } else {
      toast.success("Bild im Album gespeichert! 📁");
      onSaved();
      onOpenChange(false);
    }
    setSaving(false);
  };

  const createAndSave = async () => {
    if (!user || !newName.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from('studio_albums')
      .insert({ user_id: user.id, name: newName.trim() })
      .select('id')
      .single();
    
    if (error || !data) {
      toast.error("Fehler beim Erstellen");
      setCreating(false);
      return;
    }

    await saveToAlbum(data.id);
    setNewName("");
    setShowCreate(false);
    setCreating(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-primary" />
            In Album speichern
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {albums.map(album => (
              <button
                key={album.id}
                onClick={() => saveToAlbum(album.id)}
                disabled={saving}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-primary/40 hover:bg-accent/50 transition-all text-left"
              >
                <Folder className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium truncate">{album.name}</span>
              </button>
            ))}

            {albums.length === 0 && !showCreate && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Noch keine Alben vorhanden
              </p>
            )}
          </div>
        )}

        {showCreate ? (
          <div className="flex gap-2">
            <Input
              placeholder="Album Name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createAndSave()}
              autoFocus
            />
            <Button size="sm" onClick={createAndSave} disabled={creating || !newName.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "OK"}
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Neues Album erstellen
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
