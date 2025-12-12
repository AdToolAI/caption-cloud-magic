import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Camera, Loader2, Trash2, User } from "lucide-react";

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  onAvatarChange: (url: string | null) => void;
}

export const AvatarUpload = ({ currentAvatarUrl, onAvatarChange }: AvatarUploadProps) => {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Bitte wähle eine Bilddatei");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Maximale Dateigröße: 5MB");
      return;
    }

    setUploading(true);
    try {
      // Delete old avatar if exists
      if (currentAvatarUrl) {
        const oldPath = currentAvatarUrl.split("/").pop();
        if (oldPath) {
          await supabase.storage.from("avatars").remove([`${user.id}/${oldPath}`]);
        }
      }

      // Upload new avatar
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      // Update profile
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);

      if (updateError) throw updateError;

      onAvatarChange(publicUrl);
      toast.success("Profilbild aktualisiert");
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Fehler beim Hochladen");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async () => {
    if (!user || !currentAvatarUrl) return;

    setDeleting(true);
    try {
      // Extract file path from URL
      const urlParts = currentAvatarUrl.split("/avatars/");
      if (urlParts[1]) {
        await supabase.storage.from("avatars").remove([urlParts[1]]);
      }

      // Update profile
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", user.id);

      if (error) throw error;

      onAvatarChange(null);
      toast.success("Profilbild entfernt");
    } catch (error: any) {
      toast.error(error.message || "Fehler beim Löschen");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="bg-card/60 backdrop-blur-xl border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          Profilbild
        </CardTitle>
        <CardDescription>
          Lade ein Profilbild hoch (max. 5MB)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <Avatar className="h-24 w-24 border-2 border-primary/20">
            <AvatarImage src={currentAvatarUrl || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary">
              <User className="h-10 w-10" />
            </AvatarFallback>
          </Avatar>

          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="border-white/10"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Wird hochgeladen...
                </>
              ) : (
                <>
                  <Camera className="mr-2 h-4 w-4" />
                  Bild auswählen
                </>
              )}
            </Button>

            {currentAvatarUrl && (
              <Button
                variant="ghost"
                onClick={handleDelete}
                disabled={deleting}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {deleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Entfernen
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
